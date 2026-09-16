"use client";

/* Sidebar: full 304px variant on upload/loading, collapsed 64px icon rail on
   the results screen. Nav items beyond "Check Exam" are placeholders. */

const NAV = [
  { icon: "/figma/nav-home.svg", label: "Home" },
  { icon: "/figma/nav-exams.svg", label: "Check Exam", active: true },
  { icon: "/figma/nav-assignments.svg", label: "Past Checks" },
  { icon: "/figma/nav-library.svg", label: "Question Bank" },
];

export default function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <aside className="hidden shrink-0 flex-col items-center justify-between rounded-2xl bg-white p-3 shadow-[0px_16px_24px_rgba(0,0,0,0.06)] lg:flex w-16">
        <div className="flex flex-col items-center gap-6">
          <img src="/brand/parakh.svg" alt="Parakh" className="size-10" />
          <nav className="flex flex-col gap-2">
            {NAV.map((item) => (
              <button
                key={item.label}
                title={item.label}
                className={`flex size-10 items-center justify-center rounded-lg ${
                  item.active ? "bg-offwhite-2" : "hover:bg-offwhite"
                }`}
              >
                <img src={item.icon} alt="" className="size-5" />
              </button>
            ))}
          </nav>
        </div>
        <button title="Settings" className="flex size-10 items-center justify-center rounded-lg hover:bg-offwhite">
          <img src="/figma/nav-settings.svg" alt="" className="size-5" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="hidden w-[304px] shrink-0 flex-col justify-between rounded-2xl bg-white p-6 shadow-[0px_16px_24px_rgba(0,0,0,0.06)] lg:flex">
      <div className="flex flex-col gap-14">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/brand/parakh.svg" alt="" className="size-10" />
            <span className="text-[28px] font-bold tracking-[-0.06em] text-ink">
              Parakh
            </span>
          </div>
          <span className="text-lg font-bold tracking-normal text-brand/70">परख</span>
        </div>

        <div className="relative flex h-[42px] items-center justify-center gap-2.5 rounded-full border-4 border-[#ff7950] bg-[#272727] px-6">
          <img src="/figma/toolkit.svg" alt="" className="h-[17px] w-[18px]" />
          <span className="whitespace-nowrap text-[15px] font-medium text-white">
            AI Exam Assessment
          </span>
          <div className="pointer-events-none absolute -inset-1 rounded-[inherit] shadow-[inset_0px_-1px_3.5px_0px_rgba(177,177,177,0.6),inset_0px_0px_34.5px_0px_rgba(255,255,255,0.25)]" />
        </div>

        <nav className="flex w-full flex-col gap-2">
          {NAV.map((item) => (
            <button
              key={item.label}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-base ${
                item.active
                  ? "bg-offwhite-2 font-medium text-ink"
                  : "text-[rgba(94,94,94,0.8)] hover:bg-offwhite"
              }`}
            >
              <img src={item.icon} alt="" className="size-5" />
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex flex-col gap-2">
        <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-base text-[rgba(94,94,94,0.8)] hover:bg-offwhite">
          <img src="/figma/nav-settings.svg" alt="" className="size-5" />
          Settings
        </button>
        <a
          href="https://www.arnavbule.in"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-2xl bg-offwhite-2 p-3 transition-colors hover:bg-offwhite"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#fb975d] to-[#fc5e24] text-lg font-bold text-white">
            AB
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-ink">Built by Arnav Bule</p>
            <p className="truncate text-sm text-muted">arnavbule.in</p>
          </div>
        </a>
      </div>
    </aside>
  );
}
