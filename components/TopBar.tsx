"use client";

import { ChevronDown } from "lucide-react";

export default function TopBar({ onHome }: { onHome?: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2.5 rounded-2xl bg-white/75 pl-3 pr-2 sm:pl-6">
      <button
        onClick={onHome}
        disabled={!onHome}
        aria-label="Back to upload"
        title={onHome ? "Check another exam" : undefined}
        className={`flex size-10 items-center justify-center rounded-full bg-white ${
          onHome ? "cursor-pointer hover:bg-offwhite" : ""
        }`}
      >
        <img src="/figma/arrow-left.svg" alt="" className="size-6" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <img src="/figma/exams-crumb.svg" alt="" className="size-5" />
        <span className="truncate text-base font-semibold text-[#a9a9a9]">Exam Check</span>
      </div>
      <div className="hidden size-9 items-center justify-center rounded-full bg-offwhite sm:flex">
        <span className="flex size-6 items-center justify-center rounded-full border-2 border-ink text-base font-bold text-ink">
          ?
        </span>
      </div>
      <img src="/figma/bell.svg" alt="" className="hidden size-9 sm:block" />
      <img src="/figma/sparkle-btn.svg" alt="" className="hidden size-9 sm:block" />
      <div className="flex items-center gap-2 rounded-xl px-3 py-1.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[#fb975d] to-[#fc5e24] text-sm font-bold text-white">
          A
        </span>
        <span className="hidden text-base font-semibold text-ink md:block">Arnav Bule</span>
        <ChevronDown className="hidden size-4 text-ink md:block" />
      </div>
    </header>
  );
}
