import { mkdir, readdir, rm, stat, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { jobs } from "@/lib/store";
import { runPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";

const JOBS_DIR = path.join(process.cwd(), ".jobs");
const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = /\.(pdf|png|jpe?g|webp)$/i;
const TTL_MS = 24 * 60 * 60 * 1000;

async function sweepOldJobs() {
  try {
    for (const name of await readdir(JOBS_DIR)) {
      const p = path.join(JOBS_DIR, name);
      const s = await stat(p).catch(() => null);
      if (s?.isDirectory() && Date.now() - s.mtimeMs > TTL_MS) {
        await rm(p, { recursive: true, force: true }).catch(() => {});
        jobs.delete(name);
      }
    }
  } catch {
    /* dir may not exist yet */
  }
}

async function saveUpload(file: File, dir: string, name: string) {
  if (file.size > MAX_BYTES) throw new Error(`${file.name} exceeds 10MB`);
  const ext = path.extname(file.name).toLowerCase() || ".pdf";
  if (!OK_TYPES.test(ext)) throw new Error(`Unsupported file type: ${file.name}`);
  const p = path.join(dir, name + ext);
  await writeFile(p, Buffer.from(await file.arrayBuffer()));
  return p;
}

export async function POST(req: NextRequest) {
  try {
    // optional shared secret for the public tunnel (set DEMO_KEY to enable)
    const demoKey = process.env.DEMO_KEY;
    if (demoKey && req.nextUrl.searchParams.get("key") !== demoKey) {
      return NextResponse.json({ error: "Invalid access key" }, { status: 403 });
    }

    void sweepOldJobs();

    const form = await req.formData();
    const qp = form.get("qp");
    const ans = form.get("ans");
    const scheme = form.get("scheme");
    if (!(qp instanceof File) || !(ans instanceof File)) {
      return NextResponse.json({ error: "Both files are required" }, { status: 400 });
    }
    const id = randomUUID().slice(0, 8);
    const dir = path.join(JOBS_DIR, id, "uploads");
    await mkdir(dir, { recursive: true });
    const qpPath = await saveUpload(qp, dir, "qp");
    const ansPath = await saveUpload(ans, dir, "ans");
    const schemePath =
      scheme instanceof File && scheme.size > 0
        ? await saveUpload(scheme, dir, "scheme")
        : undefined;

    jobs.set(id, {
      id,
      stage: "queued",
      progress: 0,
      detail: "Queued",
      createdAt: Date.now(),
    });
    void runPipeline(id, qpPath, ansPath, schemePath);
    return NextResponse.json({ jobId: id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 400 }
    );
  }
}
