import { NextRequest, NextResponse } from "next/server";
import { jobs } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = jobs.get(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json(job);
}
