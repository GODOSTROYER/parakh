"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import UploadScreen from "@/components/UploadScreen";
import LoadingScreen from "@/components/LoadingScreen";
import MappingScreen from "@/components/MappingScreen";
import type { Job } from "@/lib/types";

export default function Home() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const reset = (message: string | null) => {
    stopPoll();
    setError(message);
    setJobId(null);
    setJob(null);
    history.replaceState(null, "", location.pathname);
  };

  const start = useCallback(async (qp: File, ans: File, scheme: File | null) => {
    setError(null);
    const form = new FormData();
    form.append("qp", qp);
    form.append("ans", ans);
    if (scheme) form.append("scheme", scheme);
    // pass the demo access key through if the page was opened with one
    const key = new URLSearchParams(location.search).get("key");
    const res = await fetch(`/api/process${key ? `?key=${encodeURIComponent(key)}` : ""}`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Upload failed");
      return;
    }
    setJobId(data.jobId);
    setJob({ id: data.jobId, stage: "queued", progress: 0, detail: "Queued", createdAt: 0 });
    const params = new URLSearchParams(location.search);
    params.set("job", data.jobId);
    history.replaceState(null, "", `?${params}`);
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
        if (res.status === 404) {
          reset("That session has expired — upload the files again to re-run it.");
          return;
        }
        if (!res.ok) return;
        const j: Job = await res.json();
        setJob(j);
        if (j.stage === "done") stopPoll();
        if (j.stage === "error") reset(j.error ?? "Processing failed");
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
          <LoadingScreen detail={job?.detail && job.detail !== "Queued" ? job.detail : "Preparing..."} />
        )}
        {phase === "results" && job?.result && jobId && (
          <MappingScreen jobId={jobId} result={job.result} />
        )}
      </main>
    </div>
  );
}
