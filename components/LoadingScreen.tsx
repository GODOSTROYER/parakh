"use client";

const STEPS = [
  { label: "Preparing pages", match: "Preparing" },
  { label: "Extracting questions", match: "Extract" },
  { label: "Mapping answers", match: "Mapping" },
  { label: "Grading", match: "Grad" },
];

export default function LoadingScreen({ detail }: { detail: string }) {
  const matched = STEPS.findIndex((s) => detail.includes(s.match));
  const active = matched === -1 ? 0 : matched;

  return (
    <div className="enter-rise flex flex-1 flex-col items-center justify-center py-8">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <h1 className="font-display text-[28px] italic leading-tight tracking-[-0.01em] text-text">
          Parakh is reading…
        </h1>

        <div className="h-0.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="indeterminate-bar h-full w-1/3 rounded-full bg-saffron" />
        </div>

        <ol className="flex flex-col gap-4">
          {STEPS.map((step, i) => {
            const done = i < active;
            const isActive = i === active;
            return (
              <li key={step.label} className="flex items-start gap-3">
                <span
                  className={`mt-[5px] size-1.5 shrink-0 rounded-full ${
                    done
                      ? "bg-green"
                      : isActive
                        ? "pulse-dot bg-saffron"
                        : "bg-faint/40"
                  }`}
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span
                    className={`font-mono text-[13px] ${
                      done ? "text-muted" : isActive ? "text-text" : "text-faint"
                    }`}
                  >
                    {step.label}
                  </span>
                  {isActive && detail ? (
                    <span className="truncate font-mono text-xs text-muted">
                      {detail}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
