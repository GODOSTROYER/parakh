"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";

export interface Picked {
  file: File;
  pages?: number;
}

function prettySize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 3 * 1024 * 1024 ? 0 : 1)}MB`;
}

function UploadCard({
  title,
  picked,
  onPick,
  onClear,
}: {
  title: string;
  picked: Picked | null;
  onPick: (f: File) => void;
  onClear: () => void;
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
      className={`relative flex h-full flex-1 cursor-pointer items-center justify-center overflow-clip rounded-[20px] border-[1.5px] border-dashed bg-white p-2.5 transition-colors ${
        dragOver ? "border-brand" : "border-[#cecece]"
      }`}
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
        <div className="relative flex items-center justify-center rounded-xl bg-offwhite py-3 pl-3 pr-5">
          <div className="flex items-center gap-3">
            <img src="/figma/pdf-icon.png" alt="" className="h-10 w-[35px] object-contain" />
            <div className="flex min-w-0 flex-col items-center">
              <p className="max-w-[220px] truncate text-base font-bold text-ink-dark">
                {picked.file.name}
              </p>
              <p className="flex items-center gap-2 text-sm text-[rgba(94,94,94,0.8)]">
                {prettySize(picked.file.size)}
                {picked.pages ? (
                  <>
                    <span className="inline-block size-[5px] rounded-full bg-[#d9d9d9]" />
                    {picked.pages} Page{picked.pages > 1 ? "s" : ""}
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <button
            aria-label="Remove file"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="absolute -right-3 -top-3 flex size-[26px] items-center justify-center rounded-full bg-[rgba(43,43,43,0.8)] shadow-[0px_4px_11.4px_rgba(0,0,0,0.25)]"
          >
            <X className="size-4 text-white" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-lg bg-[#f3f3f3]">
            <Upload className="size-6 text-ink" />
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <p className="text-xl font-semibold tracking-[-0.06em] text-ink">
              Upload <span className="text-brand">{title}</span>
            </p>
            <p className="text-sm text-[rgba(94,94,94,0.55)]">Max 10MB</p>
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
    <div className="flex flex-1 flex-col items-center justify-center gap-9 overflow-y-auto rounded-[40px] py-6">
      <div className="flex flex-col items-center gap-5">
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-3 px-4">
            <span className="text-[28px] font-bold leading-tight tracking-[-0.04em] text-ink-dark lg:text-[40px]">
              Upload
            </span>
            <span className="rounded-lg bg-[rgba(255,147,80,0.15)] px-2 py-1 text-center text-[28px] font-bold leading-tight tracking-[-0.04em] text-brand lg:text-[40px]">
              Question Paper &amp; Answer Sheets
            </span>
          </div>
          <p className="text-xl text-ink">Upload both files to get started</p>
        </div>

        {/* mascot with rings + orbiting badges */}
        <div className="relative size-[138px]">
          <img src="/figma/ring-outer.svg" alt="" className="absolute inset-0 size-full" />
          <img
            src="/figma/ring-inner.svg"
            alt=""
            className="absolute left-1/2 top-[15px] size-[108px] -translate-x-1/2"
          />
          <img
            src="/brand/parakh.svg"
            alt=""
            className="absolute left-1/2 top-1/2 size-[62px] -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_6px_16px_rgba(252,94,36,0.35)]"
          />
          {[
            { src: "/figma/orbit-task.svg", cls: "left-[12px] top-[45px]" },
            { src: "/figma/orbit-cloud.svg", cls: "right-[6px] top-[83px]" },
            { src: "/figma/orbit-task.svg", cls: "left-[83px] top-[13px]" },
            { src: "/figma/orbit-cloud.svg", cls: "left-[40px] bottom-[4px]" },
          ].map((b, i) => (
            <span
              key={i}
              className={`absolute flex size-[13px] items-center justify-center rounded-full ${b.cls}`}
              style={{
                backgroundImage:
                  "linear-gradient(121.6deg, rgb(251,151,93) 30.9%, rgb(252,94,36) 69.8%)",
              }}
            >
              <img src={b.src} alt="" className="size-[7px]" />
            </span>
          ))}
        </div>

        <div className="w-full max-w-[789px] rounded-3xl bg-white/50 p-3">
          <div className="flex h-[181px] flex-col gap-4 sm:flex-row">
            <UploadCard
              title="Question Paper"
              picked={qp}
              onPick={pick(setQp)}
              onClear={() => setQp(null)}
            />
            <UploadCard
              title="Answer Sheet"
              picked={ans}
              onPick={pick(setAns)}
              onClear={() => setAns(null)}
            />
          </div>
          <button
            onClick={async () => {
              const load = async (url: string, name: string) => {
                const blob = await fetch(url).then((r) => r.blob());
                return new File([blob], name, { type: "application/pdf" });
              };
              const [q, a] = await Promise.all([
                load("/samples/sample_qp.pdf", "sample_question_paper.pdf"),
                load("/samples/sample_answers.pdf", "sample_answer_sheet.pdf"),
              ]);
              await pick(setQp)(q);
              await pick(setAns)(a);
            }}
            className="mt-2 w-full text-center text-sm font-medium text-brand underline-offset-2 hover:underline"
          >
            No files handy? Try the sample exam →
          </button>
          {showScheme ? (
            <div className="mt-3 h-[120px]">
              <UploadCard
                title="Marking Scheme"
                picked={scheme}
                onPick={pick(setScheme)}
                onClear={() => setScheme(null)}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowScheme(true)}
              className="mt-2 w-full text-center text-sm text-[rgba(94,94,94,0.8)] underline-offset-2 hover:underline"
            >
              + Add marking scheme (optional)
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          disabled={!ready}
          onClick={() => ready && onStart(qp.file, ans.file, scheme?.file ?? null)}
          className={`flex items-center gap-2 rounded-full border-2 border-white/15 bg-ink py-3 pl-6 pr-5 text-sm font-medium text-white transition-opacity ${
            ready ? "shadow-[0px_4px_5px_rgba(0,0,0,0.12)] hover:opacity-90" : "opacity-25"
          }`}
        >
          Start Mapping
          <img src="/figma/arrow-right.svg" alt="" className="size-5" />
        </button>
        {error ? (
          <p className="max-w-[560px] text-center text-sm font-medium text-danger">{error}</p>
        ) : (
          <p className="text-sm text-[rgba(94,94,94,0.8)]">
            Once both files are uploaded, Parakh maps every answer to its question
          </p>
        )}
        <p className="text-xs text-[rgba(94,94,94,0.5)]">
          परख · every answer, found and graded
        </p>
      </div>
    </div>
  );
}
