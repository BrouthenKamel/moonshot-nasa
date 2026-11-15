/**
 * Commander Rosa Vega: original inline art, a retired astronaut in her flight jacket.
 * Muted FLIGHT PLAN palette: ink ground, Kapton rim and patch, paper highlights.
 */
const INK = '#121620'
const KAPTON = '#e8a33d'
const PAPER = '#ede6d6'
const JACKET = '#4a5872'
const SKIN_SHADE = '#a87458'
const SKIN = '#bf8a68'
const HAIR = '#c4bcac'
const FEATURE = '#1a1f2b'
const BROW = '#827c70'
const MOUTH = '#7a3a26'

export function Portrait({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="31" fill={INK} stroke={KAPTON} strokeWidth="1.5" />
      {/* a few stars behind her */}
      <circle cx="12" cy="16" r="1" fill={PAPER} opacity="0.55" />
      <circle cx="52" cy="13" r="1.2" fill={PAPER} opacity="0.45" />
      <circle cx="50" cy="26" r="0.8" fill={PAPER} opacity="0.35" />
      {/* flight jacket and collar */}
      <path d="M10 58c3-11 12-16 22-16s19 5 22 16a31 31 0 0 1-44 0z" fill={JACKET} />
      <path d="M24 43l8 8 8-8-3-2-5 4-5-4z" fill={PAPER} />
      {/* mission patch */}
      <circle cx="44" cy="51" r="4" fill={KAPTON} />
      <path d="M42 51.5a2.2 2.2 0 1 0 3.6-2.2 2.6 2.6 0 1 1-3.6 2.2z" fill={PAPER} />
      {/* neck and face */}
      <rect x="28" y="36" width="8" height="7" rx="3" fill={SKIN_SHADE} />
      <ellipse cx="32" cy="28" rx="10" ry="11.5" fill={SKIN} />
      {/* short silver hair */}
      <path d="M21 27c-1-9 5-14 11-14 7 0 12 4 11 13-2-4-5-6-9-6-3 2-8 3-13 7z" fill={HAIR} />
      {/* eyes, brows and a warm smile */}
      <circle cx="28" cy="29" r="1.3" fill={FEATURE} />
      <circle cx="36" cy="29" r="1.3" fill={FEATURE} />
      <path d="M26 26q2-1.4 4 0M34 26q2-1.4 4 0" stroke={BROW} strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M28 34q4 3.2 8 0" stroke={MOUTH} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <circle cx="25.5" cy="32" r="1.6" fill={KAPTON} opacity="0.18" />
      <circle cx="38.5" cy="32" r="1.6" fill={KAPTON} opacity="0.18" />
    </svg>
  )
}
