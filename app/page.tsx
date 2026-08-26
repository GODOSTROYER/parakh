"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import UploadScreen from "@/components/UploadScreen";
import LoadingScreen from "@/components/LoadingScreen";
import MappingScreen from "@/components/MappingScreen";
import type { Job } from "@/lib/types";

const STAGE_TEXT: Record<string, string> = {
  queued: "Preparing...",
  reading_qp: "Reading question paper...",
  reading_answers: "Reading answer sheet...",
  extracting_questions: "Extracting...",
  mapping_grading: "Mapping & grading...",
};

export default function Home() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const start = useCallback(async (qp: File, ans: File) => {
    setError(null);
    const form = new FormData();
    form.append("qp", qp);
    form.append("ans", ans);
    const res = await fetch("/api/process", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Upload failed");
      return;
    }
    setJobId(data.jobId);
    setJob({ id: data.jobId, stage: "queued", progress: 0, detail: "Queued", createdAt: 0 });
    history.replaceState(null, "", `?job=${data.jobId}`);
  }, []);

  // resume viewing an existing job after refresh (?job=<id>)
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("job");
    if (id) setJobId(id);
  }, []);

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const j: Job = await res.json();
        setJob(j);
        if (j.stage === "done" || j.stage === "error") stopPoll();
        if (j.stage === "error") {
          setError(j.error ?? "Processing failed");
          setJobId(null);
        }
      } catch {
        /* transient network error — keep polling */
      }
    }, 1500);
    return stopPoll;
  }, [jobId]);

  const phase =
    job?.stage === "done" && job.result ? "results" : jobId ? "loading" : "upload";

  return (
    <div className="flex h-screen gap-3 p-3">
      <Sidebar collapsed={phase === "results"} />
      <main className="flex min-w-0 flex-1 flex-col gap-3">
        <TopBar />
        {phase === "upload" && <UploadScreen onStart={start} error={error} />}
        {phase === "loading" && (
          <LoadingScreen detail={STAGE_TEXT[job?.stage ?? "queued"] ?? "Working..."} />
        )}
        {phase === "results" && job?.result && jobId && (
          <MappingScreen jobId={jobId} result={job.result} />
        )}
      </main>
    </div>
  );
}
