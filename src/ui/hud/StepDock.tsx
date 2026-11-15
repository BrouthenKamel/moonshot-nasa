import { useMemo } from 'react'
import { useGameStore } from '../../state/gameStore'
import type { DesignStep } from '../../sim/types'
import { audio } from '../../assets/audio'
import { STEP_NAMES, TAB_STEPS, stepNumber } from '../kit/stepNumbers'
import { buildingForStep, buildingName } from '../../viz/missionMap'

/** One tab per step, in play order, named as everywhere else; the tooltip says which building holds it */
const STATIONS = TAB_STEPS.map((id) => ({
  id,
  num: String(stepNumber(id)),
  label: STEP_NAMES[id],
  stationName: buildingName(buildingForStep(id)),
}))

export function StepDock({ className = '' }: { className?: string }) {
  const designStep = useGameStore((s) => s.designStep)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)
  const visitedSteps = useGameStore((s) => s.visitedSteps)

  const checks = useMemo(() => getGoNoGo(), [getGoNoGo, designStep])
  const blockerSteps = useMemo(
    () => new Set(checks.blockers.map((b) => b.fixStep).filter((s): s is DesignStep => !!s)),
    [checks]
  )
  const warningSteps = useMemo(
    () => new Set(checks.warnings.map((w) => w.fixStep).filter((s): s is DesignStep => !!s)),
    [checks]
  )

  return (
    <nav
      aria-label="Mission Sequencer"
      className={`flex items-center gap-1 rounded-xl bg-ink-2/70 p-1 border border-rule/50 select-none ${className}`}
    >
      {STATIONS.map((station) => {
        const isCurrent = station.id === (designStep === 'rocket' ? 'spacecraft' : designStep)
        const hasBlocker = blockerSteps.has(station.id)
        const hasWarning = warningSteps.has(station.id)
        const isVisited = visitedSteps.includes(station.id)

        let badgeDot = 'bg-rule'
        if (hasBlocker) badgeDot = 'bg-nogo animate-pulse'
        else if (hasWarning) badgeDot = 'bg-caution'
        else if (isVisited) badgeDot = 'bg-go'

        return (
          <button
            key={station.id}
            type="button"
            aria-current={isCurrent ? 'step' : undefined}
            onClick={() => {
              audio.play('sfx.click')
              setDesignStep(station.id)
            }}
            className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-all duration-150 ${
              isCurrent
                ? 'bg-kapton text-ink-0 font-bold shadow-md shadow-kapton/20 scale-[1.02]'
                : 'text-paper-dim hover:text-paper hover:bg-ink-3/80'
            }`}
          >
            <span className="text-[11px] opacity-70">{station.num}.</span>
            <span className="font-semibold tracking-wide">{station.label}</span>
            <span
              className={`h-1.5 w-1.5 rounded-full transition-colors ${badgeDot} ${
                isCurrent && !hasBlocker ? 'bg-ink-0' : ''
              }`}
            />

            {/* Hover station facility tooltip */}
            <div className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-ink-0 border border-rule text-[10px] font-mono text-paper-dim opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl z-50">
              {station.stationName}
            </div>
          </button>
        )
      })}
    </nav>
  )
}
