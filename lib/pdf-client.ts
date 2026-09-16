"use client";

// Browser-side document prep: PDFs/images → JPEG page images + text layer.
// Keeps everything client-side so the serverless backend only ever sees
// compact JPEGs (Vercel body limit) and the viewer can show pages instantly.

export interface RenderedPage {
  index: number;
  width: number;
  height: number;
  dataUrl: string; // image/jpeg
}

export interface RenderedDoc {
  pages: RenderedPage[];
  text: string; // embedded text layer ("" for images/scans)
}

const MAX_W = 1200;
const MAX_PAGES = 15;
const JPEG_Q = 0.78;

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  // served from public/ — bundler-emitted worker URLs 404 in some setups
  lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return lib;
}

export async function renderDocument(
  file: File,
  onProgress?: (done: number, total: number) => void
): Promise<RenderedDoc> {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return { pages: [await renderImage(file)], text: "" };
  }
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const n = Math.min(doc.numPages, MAX_PAGES);
  const pages: RenderedPage[] = [];
  let text = "";
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_W / base.width);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // intent "print" schedules with timeouts, not requestAnimationFrame —
    // keeps rendering alive when the tab is backgrounded mid-run
    await page.render({ canvasContext: ctx, viewport: vp, canvas, intent: "print" }).promise;
    pages.push({
      index: i - 1,
      width: canvas.width,
      height: canvas.height,
      dataUrl: canvas.toDataURL("image/jpeg", JPEG_Q),
    });
    const tc = await page.getTextContent();
    text +=
      tc.items
        .map((it) => ("str" in it ? it.str : ""))
        .join(" ")
        .trim() + "\n\n";
    onProgress?.(i, n);
  }
  await doc.cleanup?.();
  return { pages, text: text.trim() };
}

function renderImage(file: File): Promise<RenderedPage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, MAX_W / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({
        index: 0,
        width: canvas.width,
        height: canvas.height,
        dataUrl: canvas.toDataURL("image/jpeg", JPEG_Q),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read image: ${file.name}`));
    };
    img.src = url;
  });
}

/** dataUrl → {mimeType, data} for the API payload */
export function toImagePart(dataUrl: string): { mimeType: string; data: string } {
  const [head, data] = dataUrl.split(",");
  return { mimeType: head.match(/data:(.*?);/)?.[1] ?? "image/jpeg", data };
}
