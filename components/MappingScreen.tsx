"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus } from "lucide-react";
import type { JobResult, QuestionResult } from "@/lib/types";

const ZOOMS = [50, 75, 100, 125, 150, 200];

function scorePill(q: QuestionResult) {
  const ratio = q.maxMarks > 0 ? q.score / q.maxMarks : 0;
  if (!q.answered || q.score === 0)
    return "bg-danger-bg text-danger";
  if (ratio >= 0.8) return "bg-success-bg text-success";
  return "bg-warn-bg text-warn";
}

function QuestionCard({
  q,
  selected,
  expanded,
  onSelect,
  onToggle,
}: {
  q: QuestionResult;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`flex w-full cursor-pointer flex-col gap-3 rounded-2xl bg-white p-3 transition-shadow ${
        selected ? "border-2 border-brand-light" : "border-2 border-transparent"
      }`}
    >
      <div className="flex w-full items-center gap-3">
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`flex size-8 items-center justify-center rounded-full border-2 border-white/25 text-lg font-extrabold text-white ${
              selected
                ? "bg-brand drop-shadow-[0px_8px_4.4px_rgba(255,121,80,0.1)]"
                : "bg-[rgba(43,43,43,0.8)] shadow-[0px_4px_16px_rgba(67,67,67,0.1)]"
            }`}
          >
            {q.number}
          </span>
          {q.part && (
            <span className="flex size-8 items-center justify-center rounded-full bg-offwhite text-base font-bold text-ink">
              {q.part}.
            </span>
          )}
        </div>
        <p className="min-w-0 flex-1 text-base leading-[1.4] text-ink">{q.text}</p>
        <span
          className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-base font-bold ${scorePill(q)}`}
        >
          {q.score % 1 === 0 ? q.score : q.score.toFixed(1)} / {q.maxMarks}
        </span>
        <button
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="shrink-0 rounded-lg bg-offwhite p-1"
        >
          {expanded ? (
            <ChevronUp className="size-5 text-ink" />
          ) : (
            <ChevronDown className="size-5 text-ink" />
          )}
        </button>
      </div>
      {expanded && (
        <div className="flex flex-col gap-2.5 rounded-2xl bg-offwhite px-6 py-4">
          <p className="text-base font-bold text-ink">AI Feedback</p>
          <p className="text-sm leading-[1.4] text-ink">{q.feedback}</p>
          {!q.answered && (
            <p className="text-sm font-bold text-danger">Not answered</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function MappingScreen({ jobId, result }: { jobId: string; result: JobResult }) {
  const [selectedQid, setSelectedQid] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(0);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [mobilePane, setMobilePane] = useState<"questions" | "answers">("questions");
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const selected = result.questions.find((q) => q.qid === selectedQid) ?? null;
  const nPages = result.answerPages.length;

  const highlights = useMemo(() => {
    if (showUnmatched)
      return result.unmatched.flatMap((u) =>
        u.highlights.map((h) => ({ ...h, label: "Extra", tone: "warn" as const }))
      );
    if (!selected) return [];
    return selected.highlights.map((h) => ({
      ...h,
      label: `Q${selected.label.replace(/\s+/g, "")}`,
      tone: "success" as const,
    }));
  }, [selected, showUnmatched, result.unmatched]);

  // scroll the sheet to the first highlight of the selection
  useEffect(() => {
    if (!highlights.length || !scrollRef.current) return;
    const h = highlights[0];
    const pageEl = pageRefs.current[h.page];
    if (!pageEl) return;
    const y = pageEl.offsetTop + h.bbox[1] * pageEl.offsetHeight - 90;
    scrollRef.current.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }, [highlights]);

  const toggleAll = () => {
    const next = !allExpanded;
    setAllExpanded(next);
    setExpanded(next ? new Set(result.questions.map((q) => q.qid)) : new Set());
  };

  const goToPage = (n: number) => {
    const clamped = Math.max(0, Math.min(nPages - 1, n));
    const el = pageRefs.current[clamped];
    if (el && scrollRef.current)
      scrollRef.current.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
  };

  const onSheetScroll = () => {
    const c = scrollRef.current;
    if (!c) return;
    let current = 0;
    for (let i = 0; i < nPages; i++) {
      const el = pageRefs.current[i];
      if (el && el.offsetTop <= c.scrollTop + c.clientHeight / 2) current = i;
    }
    setPage(current);
  };

  const pct = result.overall.maxScore
    ? Math.round((result.overall.score / result.overall.maxScore) * 100)
    : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* mobile pane toggle */}
      <div className="flex gap-2 rounded-full bg-white/60 p-1 lg:hidden">
        {(["questions", "answers"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setMobilePane(p)}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-medium capitalize ${
              mobilePane === p ? "bg-ink text-white" : "text-ink"
            }`}
          >
            {p === "questions" ? "Questions" : "Answer Sheet"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 items-start gap-3">
        {/* left: questions */}
        <div
          className={`${
            mobilePane === "questions" ? "flex" : "hidden"
          } h-full w-full min-w-0 flex-col gap-4 overflow-y-auto rounded-[20px] bg-white/50 p-4 lg:flex lg:w-[46%] lg:shrink-0`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-bold text-ink">
              Extracted Questions (from question paper)
            </p>
            <button
              onClick={toggleAll}
              className="shrink-0 rounded-full bg-white py-3 pl-4 pr-5 text-sm font-medium text-[#181818] hover:bg-offwhite"
            >
              {allExpanded ? "Collapse All" : "Expand All"}
            </button>
          </div>

          {/* grading summary */}
          <div className="flex flex-col gap-2 rounded-2xl bg-ink p-4 text-white">
            <div className="flex items-center justify-between">
              <p className="text-base font-bold">Grading Summary</p>
              <span className="rounded-full bg-white/10 px-3 py-1 text-base font-bold">
                {result.overall.score % 1 === 0
                  ? result.overall.score
                  : result.overall.score.toFixed(1)}{" "}
                / {result.overall.maxScore} · {pct}%
              </span>
            </div>
            <p className="text-sm leading-[1.4] text-white/80">{result.overall.summary}</p>
          </div>

          {result.questions.map((q) => (
            <QuestionCard
              key={q.qid}
              q={q}
              selected={q.qid === selectedQid && !showUnmatched}
              expanded={expanded.has(q.qid)}
              onSelect={() => {
                setShowUnmatched(false);
                setSelectedQid(q.qid);
                setExpanded((prev) => new Set(prev).add(q.qid));
                if (window.innerWidth < 1024) setMobilePane("answers");
              }}
              onToggle={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(q.qid)) next.delete(q.qid);
                  else next.add(q.qid);
                  return next;
                })
              }
            />
          ))}

          {result.unmatched.length > 0 && (
            <div
              onClick={() => {
                setShowUnmatched(true);
                setSelectedQid(null);
              }}
              className={`flex cursor-pointer flex-col gap-2 rounded-2xl bg-white p-3 ${
                showUnmatched ? "border-2 border-warn" : "border-2 border-transparent"
              }`}
            >
              <p className="text-base font-bold text-warn">
                Unmatched answers ({result.unmatched.length})
              </p>
              {result.unmatched.map((u, i) => (
                <p key={i} className="text-sm text-ink">
                  • {u.note}
                </p>
              ))}
              <p className="text-xs text-muted">
                Writing on the sheet that doesn&rsquo;t belong to any question — click to
                highlight.
              </p>
            </div>
          )}
        </div>

        {/* right: answer sheet viewer */}
        <div
          className={`${
            mobilePane === "answers" ? "flex" : "hidden"
          } h-full w-full min-w-0 flex-1 flex-col overflow-clip rounded-[20px] border-[1.25px] border-black/10 bg-white lg:flex`}
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b-[1.25px] border-black/10 bg-ink px-4 py-3 sm:px-6">
            <p className="text-base font-bold text-white/80">Answer Sheet</p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2">
                <button
                  aria-label="Zoom out"
                  onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])}
                >
                  <Minus className="size-4 text-white" />
                </button>
                <span className="min-w-[42px] text-center text-sm font-bold text-white">
                  {zoom}%
                </span>
                <button
                  aria-label="Zoom in"
                  onClick={() =>
                    setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])
                  }
                >
                  <Plus className="size-4 text-white" />
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2">
                <button aria-label="Previous page" onClick={() => goToPage(page - 1)}>
                  <ChevronLeft className="size-4 text-white" />
                </button>
                <span className="whitespace-nowrap text-sm font-bold text-white">
                  Page {page + 1} of {nPages}
                </span>
                <button aria-label="Next page" onClick={() => goToPage(page + 1)}>
                  <ChevronRight className="size-4 text-white" />
                </button>
              </div>
            </div>
          </div>

          <div ref={scrollRef} onScroll={onSheetScroll} className="relative flex-1 overflow-auto">
            <div style={{ width: `${zoom}%`, minWidth: zoom > 100 ? `${zoom}%` : undefined }} className="mx-auto flex flex-col gap-4 px-2.5 py-4">
              {result.answerPages.map((p) => (
                <div
                  key={p.index}
                  ref={(el) => {
                    pageRefs.current[p.index] = el;
                  }}
                  className="relative w-full"
                >
                  <img
                    src={`/api/jobs/${jobId}/pages/${p.index}`}
                    alt={`Answer sheet page ${p.index + 1}`}
                    width={p.width}
                    height={p.height}
                    className="w-full rounded-md shadow-sm"
                  />
                  {highlights
                    .filter((h) => h.page === p.index)
                    .map((h, i) => (
                      <div
                        key={i}
                        className={`absolute rounded-2xl border-2 shadow-[0_0_0_1.5px_white] ${
                          h.tone === "success"
                            ? "border-[#3dd218] bg-[rgba(94,255,53,0.1)]"
                            : "border-[#ff9900] bg-[rgba(255,153,0,0.12)]"
                        }`}
                        style={{
                          left: `${h.bbox[0] * 100}%`,
                          top: `${h.bbox[1] * 100}%`,
                          width: `${(h.bbox[2] - h.bbox[0]) * 100}%`,
                          height: `${(h.bbox[3] - h.bbox[1]) * 100}%`,
                        }}
                      >
                        <span
                          className={`absolute -top-7 left-3.5 rounded-t-xl px-3 py-1 text-base font-bold text-white ${
                            h.tone === "success" ? "bg-success" : "bg-[#ff9900]"
                          }`}
                        >
                          {h.label}
                        </span>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
