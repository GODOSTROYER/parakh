import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

// Serves rendered answer-sheet page PNGs from the shared .jobs dir.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; n: string }> }
) {
  const { id, n } = await params;
  if (!/^[a-f0-9-]+$/i.test(id) || !/^\d+$/.test(n)) {
    return new NextResponse("Bad request", { status: 400 });
  }
  try {
    const p = path.join(process.cwd(), ".jobs", id, "ans", `page_${n}.png`);
    const buf = await readFile(p);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
