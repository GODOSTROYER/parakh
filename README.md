# VedaAI — AI Assessment Extraction & Answer Mapping

Upload a **question paper** and a student's **handwritten answer sheet**. The app extracts every question, finds each answer on the sheet, **highlights its exact region**, grades it, and gives per-question and overall AI feedback — so a teacher can instantly see *which question was answered, where the answer is, and what was left unanswered*.

![Upload screen](docs/upload.png)

![Question–answer mapping screen](docs/mapping.png)

## How it works

```
Upload (PDF/images, ≤10MB each)
   │
   ▼
DeepSeek-OCR-2  — local GPU worker (FastAPI)
   PDF → page PNGs (PyMuPDF @150dpi)
   per page: markdown + text regions with bounding boxes
   (grounding <|ref|>/<|det|> tokens, coords normalized 0–999)
   │
   ▼
GPT-5.6 Luna  — via OpenAI Codex CLI (`codex exec --output-schema`)
   call 1: structure questions (printed order, sub-parts split, marks)
   call 2: map answer regions → questions + grade + feedback + summary
   │
   ▼
Next.js UI — side-by-side questions ↔ answer sheet,
   click a question → its exact region(s) highlighted on the sheet
```

### Question extraction
DeepSeek-OCR-2 converts each question-paper page to layout-aware markdown; GPT-5.6 Luna then structures it against a strict JSON schema. Printed numbering is preserved exactly, and labelled sub-parts become separate entries — `11 (a)` and `11 (b)` are two questions. Marks are read from the paper (estimated by question type when not printed).

### Answer mapping
Every OCR region on the answer sheet gets an id (`p{page}_r{idx}`). The mapper assigns region ids to each question using the student's own numbering ("Ans 2.", "5 (b)…") as the primary signal and content similarity as fallback. It handles:

| Edge case | Behaviour |
|---|---|
| Answers out of order | Mapped by label/content, not position |
| Answer spans multiple regions/pages | All regions included; one highlight per page |
| Unanswered question | Flagged, scored 0, listed in red |
| Writing that matches no question | Shown under "Unmatched answers", highlightable |
| Name/roll-number headers | Ignored as answers |

### Highlighting
DeepSeek's normalized boxes (0–999 → 0–1) are unioned per page per question and drawn as overlays on the rendered page images — the highlight follows the exact ink region at any zoom level.

### Grading
Score per question (capped at max marks), 1–2 sentences of feedback addressed to the student, plus an overall teacher summary with the total. OCR noise on handwriting is explicitly not penalized when intent is clear.

- **Marking scheme (optional)**: a third upload slot accepts the teacher's marking scheme; grading then follows its criteria instead of general judgment.
- **Diagram vision pass**: questions that ask to draw/label/sketch are re-graded from cropped images of the student's actual answer region (GPT-5.6 Luna vision), since text OCR can't see drawings.
- **OR / optional questions**: both alternatives are extracted; the skipped one shows "OR — skipped" and the total counts the choice-set once.

## Stack

| Layer | Tech |
|---|---|
| Frontend / orchestration | Next.js 15 (App Router), Tailwind CSS v4, in-memory job store |
| OCR | [DeepSeek-OCR-2](https://huggingface.co/deepseek-ai/DeepSeek-OCR-2) (3B, Apache-2.0), bf16 on a single consumer GPU (RTX 4060 8GB), FastAPI worker |
| LLM | GPT-5.6 Luna through the OpenAI Codex CLI, ChatGPT OAuth (`codex login`) — structured output via `--output-schema`, no API key needed |
| PDF handling | PyMuPDF (render + fixtures) |

The UI implements the provided Figma design.

## Run locally

Prereqs: Node 20+, Python 3.12, an NVIDIA GPU with ~7GB free VRAM, and the Codex CLI logged in once (`npm i -g @openai/codex && codex login`).

```powershell
# one-time setup
npm install
python -m venv worker/.venv
worker/.venv/Scripts/pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
worker/.venv/Scripts/pip install -r worker/requirements.txt

# model weights (~6.4GB) into worker/model
curl.exe -L --retry 10 -C - -o worker/model/model-00001-of-000001.safetensors "https://huggingface.co/deepseek-ai/DeepSeek-OCR-2/resolve/main/model-00001-of-000001.safetensors"
# plus the small config/tokenizer files from the same repo (or let the worker
# pull the whole repo from the Hub by deleting worker/model)

# every time — starts worker + app + public tunnel (live URL)
./scripts/start-all.ps1
```

The tunnel prints an `https://*.trycloudflare.com` URL — that's the live URL. App alone: `npm run dev` → http://localhost:3000.

Sample files to try are in `fixtures/` (synthetic, exercises every edge case) and `Test Data/` (a real ML exam). Regenerate fixtures with `worker/.venv/Scripts/python worker/make_fixtures.py`.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `WORKER_URL` | `http://127.0.0.1:8100` | OCR worker base URL |
| `CODEX_MODEL` | `gpt-5.6-luna` | Codex model slug |
| `RENDER_DPI` | `150` | PDF render DPI |
| `ATTN_IMPL` | `eager` | Attention implementation (no flash-attn required) |
| `DEMO_KEY` | unset | If set, uploads require `?key=<value>` in the page URL (protects a public tunnel) |
| `CODEX_TIMEOUT_MS` | `300000` | Per-LLM-call timeout (one retry on failure) |

## Assumptions & limitations

- One answer sheet per run; job state is in-memory with completed results persisted to disk (survive restarts; swept after 24h). No auth per assignment scope — set `DEMO_KEY` to gate a public tunnel.
- Digital question papers use the PDF text layer (exact); **scanned** question papers fall back to OCR and inherit its accuracy.
- OCR quality on very messy handwriting bounds mapping quality; the grader is told not to penalize OCR noise when intent is clear. A failed page degrades (skipped with a console warning) rather than failing the run.
- Marks not printed on the paper are estimated from question type.
- The GPU worker processes one page at a time (~35–80s/page on an RTX 4060); a second upload queues behind the first.
- The live URL requires the local GPU machine to be running; a quick tunnel's URL changes on restart.
