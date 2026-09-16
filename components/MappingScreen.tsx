"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus } from "lucide-react";
import type { JobResult, QuestionResult } from "@/lib/types";
import type { RenderedPage } from "@/lib/pdf-client";

const ZOOMS = [50, 75, 100, 125, 150, 200];

function scorePill(q: QuestionResult) {
  if (q.skippedOr) return "bg-sky-tint text-sky";
  const ratio = q.maxMarks > 0 ? q.score / q.maxMarks : 0;
  if (!q.answered || q.score === 0) return "bg-rose-tint text-rose";
  if (ratio >= 0.8) return "bg-green-tint text-green";
  return "bg-amber-tint text-amber";
}

function pctChip(pct: number) {
  if (pct >= 80) return "bg-green-tint text-green";
  if (pct >= 50) return "bg-amber-tint text-amber";
  return "bg-rose-tint text-rose";
}

function fmt(n: number) {
  return n % 1 === 0 ? n : n.toFixed(1);
}

function QuestionRow({
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
      id={`qcard-${q.qid}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={`flex w-full cursor-pointer flex-col gap-3 px-4 py-3.5 transition-colors duration-120 hover:bg-surface-2 ${
        selected
          ? "bg-surface-2 shadow-[inset_2px_0_0_var(--color-saffron)]"
          : ""
      }`}
    >
      <div className="flex w-full items-start gap-3">
        <span className="mt-0.5 min-w-[44px] shrink-0 font-mono text-xs text-faint">
          Q{q.label.replace(/\s+/g, "")}
        </span>
        <p
          className={`min-w-0 flex-1 text-sm leading-normal text-text ${
            expanded ? "" : "line-clamp-2"
          }`}
        >
          {q.text}
        </p>
        <span
          className={`shrink-0 whitespace-nowrap rounded-sm px-2 py-0.5 font-mono text-xs ${scorePill(q)}`}
        >
          {q.skippedOr ? "OR · skipped" : `${fmt(q.score)} / ${q.maxMarks}`}
        </span>
        <button
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="shrink-0 rounded-sm p-1 text-muted transition-colors duration-120 hover:text-text"
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>
      {expanded && (
        <div className="ml-[56px] flex flex-col gap-2 rounded-[8px] bg-surface-2 p-4">
          <p className="eyebrow">AI FEEDBACK</p>
          <p className="text-sm leading-normal text-text">{q.feedback}</p>
          {!q.answered && !q.skippedOr && (
            <p className="font-mono text-xs text-rose">not answered</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function MappingScreen({
  result,
  pages,
  onReset,
}: {
  result: JobResult;
  pages: RenderedPage[];
  onReset?: () => void;
}) {
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

  const selectQuestion = (qid: string) => {
    setShowUnmatched(false);
    setSelectedQid(qid);
    setExpanded((prev) => new Set(prev).add(qid));
    // reverse navigation: bring the question card into view in the list
    document.getElementById(`qcard-${qid}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

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
    <div className="enter-rise flex min-h-0 flex-1 flex-col gap-5">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="eyebrow">ASSESSMENT COMPLETE</p>
          <h1 className="font-display text-[32px] leading-tight tracking-[-0.01em] text-text">
            Every answer, accounted for.
          </h1>
        </div>
        {onReset && (
          <button
            onClick={onReset}
            className="shrink-0 rounded-[8px] border border-border px-4 py-2 text-sm text-muted transition-colors duration-120 hover:bg-surface-2 hover:text-text"
          >
            Check another exam
          </button>
        )}
      </div>

      {/* mobile pane toggle */}
      <div className="flex gap-1 rounded-[8px] border border-border bg-surface p-1 lg:hidden">
        {(["questions", "answers"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setMobilePane(p)}
            className={`flex-1 rounded-sm px-4 py-2 font-mono text-xs transition-colors duration-120 ${
              mobilePane === p ? "bg-surface-2 text-text" : "text-muted hover:text-text"
            }`}
          >
            {p === "questions" ? "Questions" : "Answer Sheet"}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* left: summary + questions */}
        <div
          className={`${
            mobilePane === "questions" ? "flex" : "hidden"
          } h-full min-h-0 w-full min-w-0 flex-col gap-4 overflow-y-auto pr-1 lg:flex`}
        >
          {/* summary */}
          <div className="shrink-0 rounded-lg border border-border bg-surface p-5">
            <div className="flex items-baseline gap-3">
              <p className="font-display text-[56px] leading-none tracking-[-0.01em] text-text">
                {fmt(result.overall.score)}{" "}
                <span className="text-muted">/ {result.overall.maxScore}</span>
              </p>
              <span className={`rounded-sm px-2 py-0.5 font-mono text-xs ${pctChip(pct)}`}>
                {pct}%
              </span>
            </div>
            <p className="mt-3 max-w-prose text-sm leading-normal text-muted">
              {result.overall.summary}
            </p>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2">
            <p className="eyebrow">QUESTIONS</p>
            <button
              onClick={toggleAll}
              className="shrink-0 font-mono text-xs text-muted transition-colors duration-120 hover:text-text"
            >
              {allExpanded ? "Collapse all" : "Expand all"}
            </button>
          </div>

          {/* question list: one bordered region, hairline-divided rows */}
          <div className="divide-y divide-border rounded-lg border border-border bg-surface">
            {result.questions.map((q) => (
              <QuestionRow
                key={q.qid}
                q={q}
                selected={q.qid === selectedQid && !showUnmatched}
                expanded={expanded.has(q.qid)}
                onSelect={() => {
                  selectQuestion(q.qid);
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
          </div>

          {result.unmatched.length > 0 && (
            <div
              onClick={() => {
                setShowUnmatched(true);
                setSelectedQid(null);
              }}
              className={`flex cursor-pointer flex-col gap-2 rounded-lg border bg-surface p-4 transition-colors duration-120 ${
                showUnmatched ? "border-amber" : "border-amber/40 hover:border-amber/70"
              }`}
            >
              <p className="font-display text-lg italic text-amber">
                Stray writing{" "}
                <span className="font-mono text-xs not-italic text-muted">
                  ({result.unmatched.length})
                </span>
              </p>
              {result.unmatched.map((u, i) => (
                <p key={i} className="text-sm leading-normal text-text">
                  • {u.note}
                </p>
              ))}
              <p className="text-xs text-faint">
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
          } h-full min-h-0 w-full min-w-0 flex-col overflow-clip rounded-lg border border-border lg:flex`}
        >
          {/* chrome bar */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5">
            <p className="font-mono text-[13px] text-muted">answer sheet</p>
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-[8px] border border-border">
                <button
                  aria-label="Zoom out"
                  onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])}
                  className="p-1.5 text-muted transition-colors duration-120 hover:text-text"
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="min-w-[46px] border-x border-border px-1 py-1 text-center font-mono text-xs text-text">
                  {zoom}%
                </span>
                <button
                  aria-label="Zoom in"
                  onClick={() =>
                    setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])
                  }
                  className="p-1.5 text-muted transition-colors duration-120 hover:text-text"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              <div className="flex items-center rounded-[8px] border border-border">
                <button
                  aria-label="Previous page"
                  onClick={() => goToPage(page - 1)}
                  className="p-1.5 text-muted transition-colors duration-120 hover:text-text"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <span className="whitespace-nowrap border-x border-border px-2 py-1 font-mono text-xs text-text">
                  page {page + 1} / {nPages}
                </span>
                <button
                  aria-label="Next page"
                  onClick={() => goToPage(page + 1)}
                  className="p-1.5 text-muted transition-colors duration-120 hover:text-text"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div ref={scrollRef} onScroll={onSheetScroll} className="relative flex-1 overflow-auto bg-bg">
            <div
              style={{ width: `${zoom}%`, minWidth: zoom > 100 ? `${zoom}%` : undefined }}
              className="mx-auto flex flex-col gap-4 px-2.5 py-4"
            >
              {result.answerPages.map((p) => (
                <div
                  key={p.index}
                  ref={(el) => {
                    pageRefs.current[p.index] = el;
                  }}
                  className="relative w-full"
                >
                  <img
                    src={pages[p.index]?.dataUrl}
                    alt={`Answer sheet page ${p.index + 1}`}
                    width={p.width}
                    height={p.height}
                    loading="lazy"
                    className="w-full rounded-sm border border-border"
                  />
                  {/* invisible hitboxes: click any answer region to select its question */}
                  {result.questions.flatMap((q) =>
                    q.qid === selectedQid
                      ? []
                      : q.highlights
                          .filter((h) => h.page === p.index)
                          .map((h, i) => (
                            <button
                              key={`${q.qid}-${i}`}
                              title={`Q${q.label}`}
                              aria-label={`Select question ${q.label}`}
                              onClick={() => selectQuestion(q.qid)}
                              className="absolute rounded-sm border-2 border-transparent transition-colors duration-120 hover:border-saffron/40 hover:bg-saffron-tint"
                              style={{
                                left: `${h.bbox[0] * 100}%`,
                                top: `${h.bbox[1] * 100}%`,
                                width: `${(h.bbox[2] - h.bbox[0]) * 100}%`,
                                height: `${(h.bbox[3] - h.bbox[1]) * 100}%`,
                              }}
                            />
                          ))
                  )}
                  {highlights
                    .filter((h) => h.page === p.index)
                    .map((h, i) => (
                      <div
                        key={i}
                        className={`absolute rounded-sm border-2 ${
                          h.tone === "success"
                            ? "border-saffron bg-saffron-tint"
                            : "border-amber bg-amber-tint"
                        }`}
                        style={{
                          left: `${h.bbox[0] * 100}%`,
                          top: `${h.bbox[1] * 100}%`,
                          width: `${(h.bbox[2] - h.bbox[0]) * 100}%`,
                          height: `${(h.bbox[3] - h.bbox[1]) * 100}%`,
                        }}
                      >
                        <span
                          className={`absolute -top-5 left-0 rounded-t-sm px-2 py-0.5 font-mono text-[11px] text-[#0B0C0F] ${
                            h.tone === "success" ? "bg-saffron" : "bg-amber"
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
