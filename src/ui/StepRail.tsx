import { useMemo } from 'react'
import { useGameStore } from '../state/gameStore'
import type { DesignStep } from '../sim/types'
import { buildingForStep } from '../viz/missionMap'
import type { BuildingId } from '../data/agency'

const steps: { id: DesignStep; name: string }[] = [
  { id: 'brief', name: 'Brief' },
  { id: 'planning', name: '1. Planning' },
  { id: 'instruments', name: '2. Instruments' },
  { id: 'rocket', name: '3. Rocket' },
  { id: 'spacecraft', name: '4. Spacecraft' },
  { id: 'orbit', name: '5. Orbit' },
  { id: 'ride', name: '6. Ride & Transfer' },
  { id: 'comms', name: '7. Communications' },
  { id: 'go-nogo', name: '8. Go/No-Go' },
]

const BUILDING_ACCENT: Record<BuildingId, string> = {
  'comms-center': '#60a5fa',
  'research-lab': '#a3e635',
  factory: '#a78bfa',
  'launch-site': '#fb923c',
}

export function StepRail() {
  const designStep = useGameStore((s) => s.designStep)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const visitedSteps = useGameStore((s) => s.visitedSteps)
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)

  const currentIndex = steps.findIndex((s) => s.id === designStep)
  const goNoGo = useMemo(() => getGoNoGo(), [getGoNoGo, design, difficulty])
  const blockerSteps = useMemo(
    () => new Set(goNoGo.blockers.map((b) => b.fixStep).filter((s): s is DesignStep => !!s)),
    [goNoGo]
  )
  const warningSteps = useMemo(
    () => new Set(goNoGo.warnings.map((w) => w.fixStep).filter((s): s is DesignStep => !!s)),
    [goNoGo]
  )

  return (
    <nav aria-label="Mission Sequence" className="flex w-48 shrink-0 flex-col border-r border-white/10 bg-[#070c18]/95">
      <div className="border-b border-white/10 px-3 py-2.5">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          Mission Sequence
        </div>
      </div>

      {/* Clear bottom padding leaves space for <Narrator /> in the lower rail without overlap */}
      <div className="flex-1 space-y-1 overflow-y-auto p-2 pb-56">
        {steps.map((step, index) => {
          const isCurrent = step.id === designStep
          const isPast = index < currentIndex
          const isVisited = visitedSteps.includes(step.id)
          const hasBlocker = blockerSteps.has(step.id)
          const hasWarning = !hasBlocker && warningSteps.has(step.id)
          const roleColor = BUILDING_ACCENT[buildingForStep(step.id)]

          return (
            <button
              key={step.id}
              onClick={() => setDesignStep(step.id)}
              style={{
                borderLeftColor: isCurrent ? roleColor : `${roleColor}55`,
                backgroundColor: isCurrent ? 'rgba(15, 25, 48, 0.92)' : undefined,
                boxShadow: isCurrent ? `inset 0 0 0 1px ${roleColor}44` : undefined,
              }}
              className={`
                flex w-full items-center justify-between gap-2 rounded-r-lg rounded-l-sm border-l-[3px] px-2.5 py-2 text-left text-xs font-medium transition-colors
                ${isCurrent ? 'text-white' : isPast || isVisited ? 'text-slate-200 hover:bg-white/5' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}
              `}
            >
              <span className="truncate">{step.name}</span>
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${
                  hasBlocker
                    ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.85)]'
                    : isCurrent
                      ? ''
                      : hasWarning
                        ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]'
                        : isVisited || isPast
                          ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.65)]'
                          : 'bg-slate-700'
                }`}
                style={
                  !hasBlocker && isCurrent
                    ? { backgroundColor: roleColor, boxShadow: `0 0 8px ${roleColor}` }
                    : undefined
                }
              />
            </button>
          )
        })}
      </div>
    </nav>
  )
}
