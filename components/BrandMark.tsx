/* Parakh mark: saffron gradient squircle with प set in the live Devanagari
   webfont, so it matches the परख accents everywhere (the SVG favicon stays
   as-is for tab icons). */
export default function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-[#fb975d] to-[#fc5e24] font-devanagari leading-none text-[#0b0c0f]"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        fontSize: size * 0.62,
        paddingBottom: size * 0.06,
      }}
    >
      प
    </span>
  );
}
