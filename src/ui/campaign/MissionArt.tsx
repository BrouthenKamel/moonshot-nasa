import type { CampaignMissionId } from '../../campaign/missions'
import type { Outcome } from '../../campaign/scenes/types'

/**
 * The destination's horizon behind every campaign mission screen (pure SVG, no WebGL):
 * the grey Moon with Earth in the sky, the Moon with base lights, or the red Mars plains.
 */
export function MissionArt({ id, stage, outcome }: { id: CampaignMissionId; stage: 'brief' | 'design' | 'result'; outcome?: Outcome }) {
  // The result shows what happened: nothing stands after a failure, a partial lander lies on its side
  const lost = stage === 'result' && outcome === 'failed'
  const tipped = stage === 'result' && outcome === 'partial'
  const mars = id === 'mars-base'
  const base = id === 'moon-base'
  const ground = mars ? ['#c2602f', '#6a2a14', '#2a120a'] : ['#8b877e', '#4a4842', '#1a1916']
  const tall = stage === 'brief' ? 1 : 0.6
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1600 600"
      preserveAspectRatio="xMidYMax slice"
      className="campaign-art pointer-events-none fixed inset-x-0 bottom-0 -z-0 h-[55vh] w-full"
      style={{ opacity: stage === 'design' ? 0.55 : 0.9 }}
    >
      <defs>
        <linearGradient id={`ga-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ground[0]} />
          <stop offset="35%" stopColor={ground[1]} />
          <stop offset="100%" stopColor={ground[2]} />
        </linearGradient>
        <radialGradient id={`gs-${id}`} cx="50%" cy="100%" r="60%">
          <stop offset="0%" stopColor={mars ? '#d98a55' : '#5ee6f0'} stopOpacity={mars ? 0.35 : 0.08} />
          <stop offset="100%" stopColor="#000" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`ge-${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#bfe6ff" />
          <stop offset="50%" stopColor="#2a6fb0" />
          <stop offset="100%" stopColor="#0a1a30" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="1600" height="600" fill={`url(#gs-${id})`} />
      {/* Earth (or Phobos over Mars) */}
      {mars ? (
        <ellipse cx="1260" cy={180 / tall} rx="16" ry="12" fill="#8a7a6a" />
      ) : (
        <g className="campaign-float">
          <circle cx="1280" cy="150" r="46" fill={`url(#ge-${id})`} />
          <path d="M 1250 135 q 20 -12 34 4 q -8 14 -30 10 z M 1292 170 q 12 -4 18 6 q -10 8 -18 -6 z" fill="#e8f4e0" opacity="0.5" />
        </g>
      )}
      {/* far ridge */}
      <path d={`M 0 ${430 + 60 * (1 - tall)} Q 300 ${360 + 60 * (1 - tall)} 620 ${410 + 60 * (1 - tall)} T 1200 ${390 + 60 * (1 - tall)} T 1600 ${420 + 60 * (1 - tall)} V 600 H 0 Z`} fill={ground[1]} opacity="0.7" />
      {/* near ground */}
      <path d={`M 0 ${490 + 50 * (1 - tall)} Q 400 ${450 + 50 * (1 - tall)} 800 ${480 + 50 * (1 - tall)} T 1600 ${470 + 50 * (1 - tall)} V 600 H 0 Z`} fill={`url(#ga-${id})`} />
      {/* craters */}
      {!mars &&
        [
          [220, 540, 60],
          [620, 560, 34],
          [1040, 545, 48],
          [1420, 565, 26],
        ].map(([x, y, r]) => (
          <g key={x}>
            <ellipse cx={x} cy={y} rx={r} ry={r * 0.22} fill="#1a1916" opacity="0.55" />
            <ellipse cx={x} cy={y - r * 0.05} rx={r} ry={r * 0.2} fill="none" stroke="#b5b0a4" strokeOpacity="0.35" strokeWidth="2" />
          </g>
        ))}
      {mars &&
        [
          [180, 545, 14],
          [530, 560, 22],
          [960, 548, 10],
          [1330, 566, 18],
        ].map(([x, y, r]) => <ellipse key={x} cx={x} cy={y} rx={r * 2} ry={r * 0.7} fill="#4a1d10" opacity="0.7" />)}
      {/* the base, lit, on the Moon base and Mars screens */}
      {(base || mars) && !lost && (
        <g transform={`translate(${mars ? 180 : 1330}, ${mars ? 470 : 462})`} opacity={stage === 'result' ? 1 : 0.85}>
          <rect x="0" y="-26" width="90" height="26" rx="13" fill="#d8d2c4" />
          <path d="M 100 0 a 34 34 0 0 1 68 0 z" fill="#ede6d6" />
          <rect x="-60" y="-60" width="4" height="60" fill="#888" />
          <rect x="-90" y="-62" width="64" height="16" fill="#1c3a6a" stroke="#5aa0e0" strokeWidth="1" />
          {[12, 32, 52, 72].map((x) => (
            <rect key={x} x={x} y="-17" width="8" height="5" fill="#e8a33d" className="campaign-window" style={{ animationDelay: `${x * 20}ms` }} />
          ))}
        </g>
      )}
      {/* a lander on the landing screens */}
      {id === 'moon-landing' && !lost && (
        <g transform={tipped ? 'translate(230, 486) rotate(78)' : 'translate(230, 478)'}>
          <path d="M -26 0 L -14 -22 M 26 0 L 14 -22 M -8 0 L -4 -18 M 8 0 L 4 -18" stroke="#c9c2b2" strokeWidth="3" />
          <rect x="-18" y="-42" width="36" height="22" fill="#d4af37" />
          <rect x="-12" y="-56" width="24" height="14" fill="#ddd" />
          <circle cx="0" cy="-49" r="3" fill="#e8a33d" className="campaign-window" />
        </g>
      )}
    </svg>
  )
}
