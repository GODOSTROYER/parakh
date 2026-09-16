"use client";

import { useRef, useState, type ComponentType } from "react";
import { FileText, PenLine, X } from "lucide-react";
import BrandMark from "./BrandMark";

export interface Picked {
  file: File;
  pages?: number;
}

function prettySize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 3 * 1024 * 1024 ? 0 : 1)}MB`;
}

function Dropzone({
  title,
  icon: Icon,
  picked,
  onPick,
  onClear,
  slim = false,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  picked: Picked | null;
  onPick: (f: File) => void;
  onClear: () => void;
  slim?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !picked && inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && !picked && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onPick(f);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-surface px-4 transition-colors duration-120 ${
        slim ? "py-5" : "py-10"
      } ${dragOver ? "border-saffron" : "border-border-strong hover:border-border-strong"}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      {picked ? (
        <div className="flex w-full min-w-0 items-center gap-3">
          <Icon className="size-4 shrink-0 text-muted" />
          <div className="flex min-w-0 flex-col items-start gap-0.5">
            <p className="max-w-full truncate font-mono text-[13px] text-text">
              {picked.file.name}
            </p>
            <p className="font-mono text-xs text-muted">
              {prettySize(picked.file.size)}
              {picked.pages
                ? ` · ${picked.pages} page${picked.pages > 1 ? "s" : ""}`
                : null}
            </p>
          </div>
          <button
            aria-label="Remove file"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-120 hover:text-rose"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className={`flex flex-col items-center ${slim ? "gap-1.5" : "gap-3"}`}>
          <Icon className="size-5 text-muted" />
          <div className="flex flex-col items-center gap-0.5">
            <p className="text-base text-text">{title}</p>
            <p className="text-xs text-faint">PDF or images · max 10MB</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UploadScreen({
  onStart,
  error,
}: {
  onStart: (qp: File, ans: File, scheme: File | null) => void;
  error: string | null;
}) {
  const [qp, setQp] = useState<Picked | null>(null);
  const [ans, setAns] = useState<Picked | null>(null);
  const [scheme, setScheme] = useState<Picked | null>(null);
  const [showScheme, setShowScheme] = useState(false);
  const ready = qp && ans;

  const pick = (set: (p: Picked) => void) => async (file: File) => {
    let pages: number | undefined;
    if (file.name.toLowerCase().endsWith(".pdf")) {
      // count "/Type /Page" occurrences — close enough for a hint chip
      const text = new TextDecoder("latin1").decode(await file.arrayBuffer());
      const n = text.match(/\/Type\s*\/Page[^s]/g)?.length;
      if (n) pages = n;
    } else {
      pages = 1;
    }
    set({ file, pages });
  };

  return (
    <div className="enter-rise flex flex-1 flex-col items-center justify-center overflow-y-auto py-8">
      <div className="flex w-full max-w-2xl flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <BrandMark size={56} />
          <p className="flex items-baseline gap-3">
            <span className="font-devanagari text-[22px] leading-none text-saffron">परख</span>
            <span className="font-mono text-xs tracking-[0.02em] text-faint">
              /pə·rəkh/ · to assess, to discern
            </span>
          </p>
          <h1 className="font-display text-[44px] leading-[1.05] tracking-[-0.015em] text-text">
            <em>Parakh</em> checks the whole exam
          </h1>
          <p className="max-w-lg text-[15px] leading-relaxed text-muted">
            Upload the question paper and the student&apos;s answer sheet — every
            answer found, highlighted and graded.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Dropzone
              title="Question paper"
              icon={FileText}
              picked={qp}
              onPick={pick(setQp)}
              onClear={() => setQp(null)}
            />
            <Dropzone
              title="Answer sheet"
              icon={PenLine}
              picked={ans}
              onPick={pick(setAns)}
              onClear={() => setAns(null)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={async () => {
                const load = async (url: string, name: string) => {
                  const blob = await fetch(url).then((r) => r.blob());
                  return new File([blob], name, { type: "application/pdf" });
                };
                const [q, a] = await Promise.all([
                  load("/parakh/samples/sample_qp.pdf", "sample_question_paper.pdf"),
                  load("/parakh/samples/sample_answers.pdf", "sample_answer_sheet.pdf"),
                ]);
                await pick(setQp)(q);
                await pick(setAns)(a);
              }}
              className="font-mono text-[13px] text-saffron underline-offset-2 transition-colors duration-120 hover:underline"
            >
              No files handy? Load the sample exam →
            </button>
            {!showScheme && (
              <button
                onClick={() => setShowScheme(true)}
                className="font-mono text-[13px] text-muted underline-offset-2 transition-colors duration-120 hover:text-text hover:underline"
              >
                + marking scheme (optional)
              </button>
            )}
          </div>

          {showScheme && (
            <Dropzone
              title="Marking scheme (optional)"
              icon={FileText}
              picked={scheme}
              onPick={pick(setScheme)}
              onClear={() => setScheme(null)}
              slim
            />
          )}
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            disabled={!ready}
            onClick={() => ready && onStart(qp.file, ans.file, scheme?.file ?? null)}
            className={`rounded-lg px-6 py-2.5 text-sm font-medium transition-colors duration-120 ${
              ready
                ? "bg-saffron text-[#0B0C0F] hover:bg-saffron/90"
                : "cursor-not-allowed bg-surface-2 text-faint"
            }`}
          >
            Run the check
          </button>
          {error && (
            <p className="max-w-[560px] text-center text-xs text-rose">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
