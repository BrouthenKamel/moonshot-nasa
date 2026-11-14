/** Commander Rosa Vega: original inline art, a retired astronaut in her flight jacket */
export function Portrait({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="31" fill="#14213d" stroke="#f97316" strokeWidth="2" />
      {/* a few stars behind her */}
      <circle cx="12" cy="16" r="1" fill="#fbf7ef" opacity="0.7" />
      <circle cx="52" cy="13" r="1.2" fill="#fbf7ef" opacity="0.6" />
      <circle cx="50" cy="26" r="0.8" fill="#fbf7ef" opacity="0.5" />
      {/* flight jacket and collar */}
      <path d="M10 58c3-11 12-16 22-16s19 5 22 16a31 31 0 0 1-44 0z" fill="#1d4ed8" />
      <path d="M24 43l8 8 8-8-3-2-5 4-5-4z" fill="#fbf7ef" />
      {/* mission patch */}
      <circle cx="44" cy="51" r="4" fill="#f97316" />
      <path d="M42 51.5a2.2 2.2 0 1 0 3.6-2.2 2.6 2.6 0 1 1-3.6 2.2z" fill="#fbf7ef" />
      {/* neck and face */}
      <rect x="28" y="36" width="8" height="7" rx="3" fill="#b9785a" />
      <ellipse cx="32" cy="28" rx="10" ry="11.5" fill="#c68863" />
      {/* short silver hair */}
      <path d="M21 27c-1-9 5-14 11-14 7 0 12 4 11 13-2-4-5-6-9-6-3 2-8 3-13 7z" fill="#d6d3d1" />
      {/* eyes, brows and a warm smile */}
      <circle cx="28" cy="29" r="1.3" fill="#1f2937" />
      <circle cx="36" cy="29" r="1.3" fill="#1f2937" />
      <path d="M26 26q2-1.4 4 0M34 26q2-1.4 4 0" stroke="#78716c" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M28 34q4 3.2 8 0" stroke="#7c2d12" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <circle cx="25.5" cy="32" r="1.6" fill="#f97316" opacity="0.25" />
      <circle cx="38.5" cy="32" r="1.6" fill="#f97316" opacity="0.25" />
    </svg>
  )
}
