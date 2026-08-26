"""DeepSeek-OCR-2 worker: renders PDFs/images to page PNGs and OCRs them
with grounding boxes. One request at a time (single 8GB GPU)."""

import ast
import gc
import os
import re
import sys
import threading
import traceback

import fitz  # PyMuPDF
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image

_LOCAL_MODEL = os.path.join(os.path.dirname(__file__), "model")
MODEL_NAME = os.environ.get(
    "OCR_MODEL",
    _LOCAL_MODEL if os.path.isdir(_LOCAL_MODEL) else "deepseek-ai/DeepSeek-OCR-2",
)
ATTN_IMPL = os.environ.get("ATTN_IMPL", "eager")  # no flash-attn on Windows
DPI = int(os.environ.get("RENDER_DPI", "150"))
JOBS_DIR = os.path.abspath(os.environ.get("JOBS_DIR", os.path.join(os.path.dirname(__file__), "..", ".jobs")))

app = FastAPI()
model = None
tokenizer = None
load_error = None
lock = threading.Lock()  # ponytail: global lock, single GPU can't batch anyway


def load_model():
    global model, tokenizer, load_error
    try:
        import torch
        from transformers import AutoModel, AutoTokenizer

        tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
        m = AutoModel.from_pretrained(
            MODEL_NAME,
            _attn_implementation=ATTN_IMPL,
            trust_remote_code=True,
            use_safetensors=True,
        )
        m = m.eval().cuda().to(torch.bfloat16)
        model = m  # publish only once fully cast — /health gates on this
        print("model loaded", flush=True)
    except Exception as e:
        load_error = f"{e}\n{traceback.format_exc()}"
        print("MODEL LOAD FAILED:", load_error, file=sys.stderr, flush=True)


if os.environ.get("SKIP_MODEL") != "1":
    threading.Thread(target=load_model, daemon=True).start()


class RenderRequest(BaseModel):
    job_id: str
    kind: str  # "qp" | "ans"
    file_path: str  # uploaded pdf/image on disk
    max_pages: int = 20


class OcrPageRequest(BaseModel):
    job_id: str
    kind: str
    index: int
    base_size: int = int(os.environ.get("BASE_SIZE", "1024"))
    image_size: int = int(os.environ.get("IMAGE_SIZE", "640"))
    crop_mode: bool = os.environ.get("CROP_MODE", "1") == "1"


REF_RE = re.compile(
    r"<\|ref\|>(?P<label>.*?)<\|/ref\|><\|det\|>(?P<boxes>\[\[.*?\]\])<\|/det\|>",
    re.S,
)


def parse_grounding(raw: str):
    """Split DeepSeek grounding output into regions.

    Output interleaves `<|ref|>type<|/ref|><|det|>[[x1,y1,x2,y2],...]<|/det|>`
    tokens with the markdown content of that region (content follows its tag).
    Coordinates are normalized to 0..999. Returns (clean_markdown, regions).
    """
    regions = []
    matches = list(REF_RE.finditer(raw))
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(raw)
        text = raw[start:end].strip()
        try:
            boxes = ast.literal_eval(m.group("boxes"))  # [[x1,y1,x2,y2],...]
        except Exception:
            continue
        for box in boxes:
            if len(box) != 4:
                continue
            x1, y1, x2, y2 = (min(max(float(v) / 999.0, 0.0), 1.0) for v in box)
            regions.append(
                {
                    "label": m.group("label").strip(),
                    "text": text,
                    "bbox": [x1, y1, x2, y2],
                }
            )
    # the model sometimes emits the same text twice with shifted boxes on
    # sparse layouts — dropping consecutive duplicates removes the bad anchors
    deduped = []
    for r in regions:
        if deduped and r["text"] and r["text"] == deduped[-1]["text"]:
            continue
        deduped.append(r)
    clean = REF_RE.sub("", raw)
    clean = re.sub(r"<\|.*?\|>", "", clean)
    return clean.strip(), deduped


def render_pages(file_path: str, out_dir: str, max_pages: int):
    """PDF or image -> list of (png_path, embedded_text)."""
    os.makedirs(out_dir, exist_ok=True)
    pages = []
    if file_path.lower().endswith(".pdf"):
        doc = fitz.open(file_path)
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            pix = page.get_pixmap(dpi=DPI)
            p = os.path.join(out_dir, f"page_{i}.png")
            pix.save(p)
            pages.append((p, page.get_text().strip()))
        doc.close()
    else:
        img = Image.open(file_path).convert("RGB")
        # cap the long edge so token count stays sane
        if max(img.size) > 2200:
            img.thumbnail((2200, 2200))
        p = os.path.join(out_dir, "page_0.png")
        img.save(p)
        pages.append((p, ""))
    return pages


def run_infer(image_path: str, out_dir: str, base_size=1024, image_size=640, crop_mode=True):
    import torch

    prompt = "<image>\n<|grounding|>Convert the document to markdown. "
    os.makedirs(out_dir, exist_ok=True)
    with torch.no_grad():
        # eval_mode=True returns the raw text WITH <|ref|>/<|det|> grounding
        # tokens (save_results strips them before writing result.mmd)
        raw = model.infer(
            tokenizer,
            prompt=prompt,
            image_file=image_path,
            output_path=out_dir,
            base_size=base_size,
            image_size=image_size,
            crop_mode=crop_mode,
            eval_mode=True,
        )
    if not isinstance(raw, str) or not raw:
        raise RuntimeError("model.infer produced no output")
    return raw


class CropRequest(BaseModel):
    job_id: str
    kind: str
    index: int
    bbox: list[float]  # normalized x1,y1,x2,y2
    name: str


@app.post("/crop")
def crop(req: CropRequest):
    """Crop a region out of a rendered page (for vision grading of diagrams)."""
    if not re.fullmatch(r"[\w-]+", req.name):
        raise HTTPException(400, "bad name")
    job_dir = os.path.join(JOBS_DIR, req.job_id, req.kind)
    src = os.path.join(job_dir, f"page_{req.index}.png")
    if not os.path.isfile(src):
        raise HTTPException(400, f"page not rendered: {src}")
    with Image.open(src) as im:
        w, h = im.size
        pad = 0.01
        x1, y1, x2, y2 = req.bbox
        box = (
            int(max(0.0, x1 - pad) * w),
            int(max(0.0, y1 - pad) * h),
            int(min(1.0, x2 + pad) * w),
            int(min(1.0, y2 + pad) * h),
        )
        out = os.path.join(job_dir, f"crop_{req.name}.png")
        im.crop(box).save(out)
    return {"path": out}


@app.get("/health")
def health():
    return {"model_loaded": model is not None, "load_error": load_error}


@app.post("/render")
def render(req: RenderRequest):
    if not os.path.isfile(req.file_path):
        raise HTTPException(400, f"file not found: {req.file_path}")
    job_dir = os.path.join(JOBS_DIR, req.job_id, req.kind)
    rendered = render_pages(req.file_path, job_dir, req.max_pages)
    pages = []
    for i, (p, text) in enumerate(rendered):
        with Image.open(p) as im:
            w, h = im.size
        pages.append(
            {"index": i, "width": w, "height": h, "image": f"page_{i}.png", "text": text}
        )
    return {"pages": pages}


@app.post("/ocr_page")
def ocr_page(req: OcrPageRequest):
    if load_error:
        raise HTTPException(500, f"model failed to load: {load_error.splitlines()[0]}")
    if model is None:
        raise HTTPException(503, "model still loading")
    job_dir = os.path.join(JOBS_DIR, req.job_id, req.kind)
    p = os.path.join(job_dir, f"page_{req.index}.png")
    if not os.path.isfile(p):
        raise HTTPException(400, f"page not rendered: {p}")
    with lock:
        raw = run_infer(
            p,
            os.path.join(job_dir, f"ocr_{req.index}"),
            base_size=req.base_size,
            image_size=req.image_size,
            crop_mode=req.crop_mode,
        )
        gc.collect()
        try:
            import torch

            torch.cuda.empty_cache()
        except Exception:
            pass
    markdown, regions = parse_grounding(raw)
    return {"markdown": markdown, "regions": regions}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8100)
