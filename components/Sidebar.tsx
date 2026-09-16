"use client";

/* Sidebar: 240px dark-editorial rail. Nav items beyond "Check Exam" are
   placeholders. Hidden below lg. */

import { ClipboardCheck, History, Library, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const NAV: { icon: LucideIcon; label: string; active?: boolean }[] = [
  { icon: ClipboardCheck, label: "Check Exam", active: true },
  { icon: History, label: "Past Checks" },
  { icon: Library, label: "Question Bank" },
  { icon: Settings, label: "Settings" },
];

export default function Sidebar(_props: { collapsed?: boolean }) {
  return (
    <aside className="hidden w-[240px] shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex items-baseline gap-2.5 px-5 pb-6 pt-6">
        <img
          src="/parakh/brand/parakh.svg"
          alt=""
          className="size-8 self-center"
        />
        <span className="font-display text-[22px] italic leading-none text-text">
          Parakh
        </span>
        <span className="text-sm text-muted">परख</span>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-120 ${
              active
                ? "bg-saffron-tint text-saffron"
                : "cursor-default text-muted hover:bg-surface-2"
            }`}
          >
            <Icon className="size-4" strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex flex-col">
        <div className="flex flex-col gap-1.5 px-5 pb-4 font-mono text-xs text-faint">
          <span>model · gemini-3.5-flash</span>
          <span>keys · rotating pool</span>
        </div>
        <a
          href="https://www.arnavbule.in"
          target="_blank"
          rel="noreferrer"
          className="border-t border-border px-5 py-4 text-sm text-muted transition-colors duration-120 hover:text-text"
        >
          Built by Arnav Bule ↗
        </a>
      </div>
    </aside>
  );
}
