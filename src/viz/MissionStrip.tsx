import { getOrbitById } from '../data/orbits'
import type { Design, DesignStep } from '../sim/types'
import { computeBudgets } from '../sim/budgets'
import { useGameStore } from '../state/gameStore'

interface MissionStripProps {
  step: DesignStep
  design: Design
  failingSteps: DesignStep[]
}

// Engineering-drawing colours from the FLIGHT PLAN palette
const NORMAL = '#3a4254' // rule-strong
const LIT = '#e8a33d' // kapton: the part of the trip this step decides
const BAD = '#d0533f' // nogo
const PAPER_DIM = '#b9b2a3'
const PAPER_FAINT = '#948d7f'

export function MissionStrip({ step, design, failingSteps }: MissionStripProps) {
  const difficulty = useGameStore((s) => s.difficulty)
  const budgets = computeBudgets(design, difficulty)
  const all = step === 'go-nogo'
  const lit = (s: DesignStep) => all || step === s
  const colour = (s: DesignStep) => (all && failingSteps.includes(s) ? BAD : lit(s) ? LIT : NORMAL)
  const label = (s: DesignStep) => (all && failingSteps.includes(s) ? BAD : lit(s) ? LIT : PAPER_FAINT)
  const width = (s: DesignStep) => (lit(s) ? 1.5 : 0.75)

  const altitude = getOrbitById(design.orbit)?.altitude
  const ringR = 20 + ((Number.isFinite(altitude) ? Math.min(Math.max(altitude as number, 0), 300) : 100) / 300) * 14
  const duration = budgets.transferTurns
  const p = design.planning

  return (
    <svg viewBox="0 0 400 110" className="h-full w-full" role="img" aria-label="Mission strip: Earth to Moon">
      {/* Earth and Moon as drawn circles with a centre cross */}
      <circle cx={45} cy={65} r={16} fill="#7c9cc9" fillOpacity={0.15} stroke={PAPER_DIM} strokeWidth={0.75} />
      <path d="M 41 65 H 49 M 45 61 V 69" stroke={PAPER_FAINT} strokeWidth={0.5} />
      <text x={45} y={95} textAnchor="middle" className="fp-label" style={{ fontSize: 8 }} fill={PAPER_DIM}>
        Earth
      </text>
      <circle cx={350} cy={65} r={13} fill="#b9b2a3" fillOpacity={0.12} stroke={PAPER_DIM} strokeWidth={0.75} />
      <path d="M 346 65 H 354 M 350 61 V 69" stroke={PAPER_FAINT} strokeWidth={0.5} />
      <text x={350} y={104} textAnchor="middle" className="fp-label" style={{ fontSize: 8 }} fill={PAPER_DIM}>
        Moon
      </text>
      <circle cx={350} cy={65} r={ringR} fill="none" stroke={colour('orbit')} strokeWidth={width('orbit')} strokeDasharray="4 3" />
      <path d="M 61 60 Q 200 -5 336 58" fill="none" stroke={colour('ride')} strokeWidth={width('ride')} />
      <text x={200} y={20} textAnchor="middle" className="fp-label" style={{ fontSize: 8 }} fill={label('ride')}>
        {duration === null ? 'no way to the Moon' : duration === 0 ? 'transfer about 5 days' : `transfer ${duration} month${duration === 1 ? '' : 's'}`}
      </text>
      <line x1={337} y1={72} x2={62} y2={72} stroke={colour('comms')} strokeWidth={width('comms')} strokeDasharray="2 4" />
      <text x={200} y={86} textAnchor="middle" className="fp-label" style={{ fontSize: 8 }} fill={label('comms')}>
        downlink
      </text>
      <text x={8} y={12} className="fp-data" style={{ fontSize: 8.5 }} fill={label('planning')}>
        Build {budgets.buildTurns} · Test {p?.testTurns ?? '?'} · Ride month {budgets.rideTurn}
      </text>
    </svg>
  )
}
