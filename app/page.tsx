"use client";

import { useCallback, useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import UploadScreen from "@/components/UploadScreen";
import LoadingScreen from "@/components/LoadingScreen";
import MappingScreen from "@/components/MappingScreen";
import { renderDocument, toImagePart, type RenderedPage } from "@/lib/pdf-client";
import type { JobResult } from "@/lib/types";

async function api<T>(path: string, body: object): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export default function Home() {
  const [phase, setPhase] = useState<"upload" | "loading" | "results">("upload");
  const [detail, setDetail] = useState("Preparing...");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const [ansPages, setAnsPages] = useState<RenderedPage[]>([]);

  const start = useCallback(async (qp: File, ans: File, scheme: File | null) => {
    setError(null);
    setPhase("loading");
    try {
      setDetail("Preparing question paper...");
      const qpDoc = await renderDocument(qp);

      setDetail("Preparing answer sheet...");
      const ansDoc = await renderDocument(ans, (d, t) =>
        setDetail(`Preparing answer sheet · page ${d} of ${t}`)
      );
      setAnsPages(ansDoc.pages);

      let schemeText: string | undefined;
      if (scheme) {
        setDetail("Reading marking scheme...");
        const schemeDoc = await renderDocument(scheme);
        schemeText = schemeDoc.text || undefined;
      }

      setDetail("Extracting questions...");
      const { questions } = await api<{ questions: object[] }>("/api/questions", {
        qpText: qpDoc.text.length > 200 ? qpDoc.text : undefined,
        qpImages:
          qpDoc.text.length > 200 ? undefined : qpDoc.pages.map((p) => toImagePart(p.dataUrl)),
      });

      setDetail("Mapping answers & grading...");
      const graded = await api<JobResult>("/api/grade", {
        questions,
        pages: ansDoc.pages.map((p) => ({
          index: p.index,
          width: p.width,
          height: p.height,
          image: toImagePart(p.dataUrl),
        })),
        schemeText,
      });

      setResult(graded);
      setPhase("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPhase("upload");
    }
  }, []);

  return (
    <div className="flex h-screen gap-3 p-3">
      <Sidebar collapsed={phase === "results"} />
      <main className="flex min-w-0 flex-1 flex-col gap-3">
        <TopBar
          onHome={
            phase === "results"
              ? () => {
                  setPhase("upload");
                  setResult(null);
                  setAnsPages([]);
                }
              : undefined
          }
        />
        {phase === "upload" && <UploadScreen onStart={start} error={error} />}
        {phase === "loading" && <LoadingScreen detail={detail} />}
        {phase === "results" && result && <MappingScreen result={result} pages={ansPages} />}
      </main>
    </div>
  );
}
