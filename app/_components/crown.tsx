// The gold crown on the wordmark, drawn as SVG so it looks the same on every
// platform (the ♛ glyph renders small and inconsistently). Gold, thick black
// outline, hard offset shadow, like everything else.
// `width` is for places without CSS, like the share card image.
export function Crown({ className, width }: { className?: string; width?: number }) {
  // A plain array, not a fragment: the share card's image renderer only accepts SVG elements here.
  const shape = (key: string) => [
    <path key={`${key}p`} d="M12 78 L12 34 L38 58 L64 16 L90 58 L116 34 L116 78 Z" />,
    <circle key={`${key}a`} cx="12" cy="30" r="9" />,
    <circle key={`${key}b`} cx="64" cy="13" r="9" />,
    <circle key={`${key}c`} cx="116" cy="30" r="9" />,
    <rect key={`${key}r`} x="10" y="74" width="108" height="18" />,
  ];
  return (
    <svg
      className={className}
      width={width}
      height={width && Math.round((width * 110) / 140)}
      viewBox="-4 -4 140 110" aria-hidden="true" focusable="false">
      <g fill="#111" stroke="#111" strokeWidth="6" strokeLinejoin="round" transform="translate(6 6)">
        {shape("s")}
      </g>
      <g fill="#ffe14d" stroke="#111" strokeWidth="6" strokeLinejoin="round">
        {shape("g")}
      </g>
      <circle cx="40" cy="83" r="4.5" fill="#ff4fb8" stroke="#111" strokeWidth="2.5" />
      <circle cx="64" cy="83" r="4.5" fill="#6fd3ff" stroke="#111" strokeWidth="2.5" />
      <circle cx="88" cy="83" r="4.5" fill="#9be22d" stroke="#111" strokeWidth="2.5" />
    </svg>
  );
}
