"use client";

/* Figma "AnalysingLoader": orange sparkle cluster + shimmering stage text. */
export default function LoadingScreen({ detail }: { detail: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-3xl bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="loader-sparkle relative h-[134px] w-[128px]">
          <img src="/figma/loader-v2.svg" alt="" className="absolute left-[25%] top-0 h-[71%] w-[75%]" />
          <img src="/figma/loader-v3.svg" alt="" className="absolute bottom-0 left-[10%] h-[53%] w-[56%]" />
          <img src="/figma/loader-v4.svg" alt="" className="absolute bottom-[16%] right-[7%] h-[21%] w-[22%]" />
          <img src="/figma/loader-dot.svg" alt="" className="absolute left-[14%] top-[35%] h-[9%] w-[10%]" />
        </div>
        <div className="flex flex-col items-center">
          <p className="shimmer-text text-[30px] font-bold leading-9 tracking-[-0.04em]">
            {detail}
          </p>
          <p className="text-xl leading-9 text-[rgba(70,70,70,0.75)]">This may take a while</p>
        </div>
      </div>
    </div>
  );
}
