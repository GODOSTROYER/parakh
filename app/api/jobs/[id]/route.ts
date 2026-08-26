import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { jobs } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = jobs.get(id);
  if (job) return NextResponse.json(job);

  // server restarted since the job ran — completed results are persisted on disk
  if (/^[a-f0-9-]+$/i.test(id)) {
    try {
      const raw = await readFile(path.join(process.cwd(), ".jobs", id, "result.json"), "utf-8");
      return NextResponse.json({
        id,
        stage: "done",
        progress: 100,
        detail: "Done",
        createdAt: 0,
        result: JSON.parse(raw),
      });
    } catch {
      /* fall through */
    }
  }
  return NextResponse.json({ error: "Job not found" }, { status: 404 });
}
