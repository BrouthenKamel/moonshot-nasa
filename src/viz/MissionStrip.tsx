import { getOrbitById } from '../data/orbits'
import { getTransferById } from '../data/transfers'
import type { Design, DesignStep } from '../sim/types'
import { computeBudgets } from '../sim/budgets'
import { useGameStore } from '../state/gameStore'

interface MissionStripProps {
  step: DesignStep
  design: Design
  failingSteps: DesignStep[]
}

const NORMAL = '#64748b'
const LIT = '#60a5fa'
const BAD = '#ef4444'

export function MissionStrip({ step, design, failingSteps }: MissionStripProps) {
  const difficulty = useGameStore((s) => s.difficulty)
  const budgets = computeBudgets(design, difficulty)
  const all = step === 'go-nogo'
  const lit = (s: DesignStep) => all || step === s
  const colour = (s: DesignStep) =>
    all && failingSteps.includes(s) ? BAD : lit(s) ? LIT : NORMAL
  const width = (s: DesignStep) => (lit(s) ? 2.5 : 1.2)

  const altitude = getOrbitById(design.orbit)?.altitude
  const ringR = 20 + (Number.isFinite(altitude) ? Math.min(Math.max(altitude as number, 0), 300) : 100) / 300 * 14
  const duration = getTransferById(design.transfer)?.durationTurns
  const p = design.planning

  return (
    <svg viewBox="0 0 400 110" className="h-full w-full" role="img" aria-label="Mission strip: Earth to Moon">
      <circle cx={45} cy={65} r={16} fill="#1d4ed8" stroke="#93c5fd" />
      <text x={45} y={95} textAnchor="middle" fontSize={9} fill="#94a3b8">Earth</text>
      <circle cx={350} cy={65} r={13} fill="#475569" stroke="#cbd5e1" />
      <text x={350} y={104} textAnchor="middle" fontSize={9} fill="#94a3b8">Moon</text>
      <circle
        cx={350}
        cy={65}
        r={ringR}
        fill="none"
        stroke={colour('orbit')}
        strokeWidth={width('orbit')}
        strokeDasharray="4 3"
      />
      <path
        d="M 61 60 Q 200 -5 336 58"
        fill="none"
        stroke={colour('ride')}
        strokeWidth={width('ride')}
      />
      <text x={200} y={28} textAnchor="middle" fontSize={9} fill={colour('ride')}>
        transfer {duration ?? '?'} turn{duration === 1 ? '' : 's'}
      </text>
      <line
        x1={337}
        y1={72}
        x2={62}
        y2={72}
        stroke={colour('comms')}
        strokeWidth={width('comms')}
        strokeDasharray="2 4"
      />
      <text x={200} y={86} textAnchor="middle" fontSize={9} fill={colour('comms')}>downlink</text>
      <text x={8} y={12} fontSize={9} fill={colour('planning')}>
        Build {p?.buildTurns ?? '?'} · Test {p?.testTurns ?? '?'} · Ride turn {budgets.rideTurn}
      </text>
    </svg>
  )
}
