"use client";

/* Sidebar per Figma: full 304px variant on upload/loading, collapsed 64px
   icon rail on the mapping screen. Static content (demo shell). */

const NAV = [
  { icon: "/figma/nav-home.svg", label: "Home" },
  { icon: "/figma/nav-classroom.svg", label: "My Classroom" },
  { icon: "/figma/nav-assignments.svg", label: "Assignments" },
  { icon: "/figma/nav-exams.svg", label: "Exams", active: true },
  { icon: "/figma/nav-library.svg", label: "My Library" },
];

export default function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <aside className="hidden shrink-0 flex-col items-center justify-between rounded-2xl bg-white p-3 shadow-[0px_16px_24px_rgba(0,0,0,0.06)] lg:flex w-16">
        <div className="flex flex-col items-center gap-6">
          <img src="/figma/logo.svg" alt="VedaAI" className="size-10" />
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
          <div className="flex items-center gap-2">
            <img src="/figma/logo.svg" alt="" className="size-10" />
            <span className="text-[28px] font-bold tracking-[-0.06em] text-ink">VedaAI</span>
          </div>
          <img src="/figma/collapse.svg" alt="" className="size-5" />
        </div>

        <div className="relative flex h-[42px] items-center justify-center gap-2.5 rounded-full border-4 border-[#ff7950] bg-[#272727] px-6">
          <img src="/figma/toolkit.svg" alt="" className="h-[17px] w-[18px]" />
          <span className="whitespace-nowrap text-[15px] font-medium text-white">
            AI Teacher&rsquo;s Toolkit
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
        <div className="flex items-center gap-2 rounded-2xl bg-offwhite-2 p-3">
          <img src="/figma/school.png" alt="" className="h-[60px] w-[59px] object-contain" />
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-ink">Delhi Public School</p>
            <p className="truncate text-sm text-muted">Bokaro Steel City</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
