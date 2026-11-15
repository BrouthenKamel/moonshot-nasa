import { useMemo } from 'react'
import { useGameStore } from '../../state/gameStore'
import type { DesignStep } from '../../sim/types'
import { audio } from '../../assets/audio'
import { useUiStore } from '../../state/uiStore'
import { STEP_NAMES, TAB_STEPS } from '../kit/stepNumbers'
import { buildingForStep, buildingName } from '../../viz/missionMap'
import { goToStep } from '../interaction/stepLeave'

/**
 * The mission design's stages as one bar across the screen, in play order: the current one is
 * highlighted, and each shows its state (red no-go, yellow risk, green go, grey not visited yet).
 */
interface Stage {
  id: DesignStep
  /** The Ride step's view this stage opens: Ride is the launch, Trip the flight time to the Moon (one idea: a ride, then the trip, not two launches) */
  view?: 'launch' | 'transfer'
  label: string
  stationName: string
}
const STATIONS: (Stage & { num: string })[] = TAB_STEPS.flatMap((id): Stage[] => {
  const stationName = buildingName(buildingForStep(id))
  return id === 'ride'
    ? [
        { id, view: 'launch', label: STEP_NAMES.ride, stationName },
        { id, view: 'transfer', label: 'Trip', stationName },
      ]
    : [{ id, label: STEP_NAMES[id], stationName }]
}).map((s, i) => ({ ...s, num: String(i + 1) }))

export function StepDock({ className = '' }: { className?: string }) {
  const designStep = useGameStore((s) => s.designStep)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)
  const visitedSteps = useGameStore((s) => s.visitedSteps)
  const rideView = useUiStore((s) => s.rideView)
  const setRideView = useUiStore((s) => s.setRideView)
  // The statuses follow the design as it changes, not only the step
  const design = useGameStore((s) => s.design)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- getGoNoGo reads the design from the store
  const checks = useMemo(() => getGoNoGo(), [getGoNoGo, design])
  const blockerSteps = useMemo(
    () => new Set(checks.blockers.map((b) => b.fixStep).filter((s): s is DesignStep => !!s)),
    [checks]
  )
  const warningSteps = useMemo(
    () => new Set(checks.warnings.map((w) => w.fixStep).filter((s): s is DesignStep => !!s)),
    [checks]
  )

  return (
    <nav aria-label="Mission design stages" className={`flex w-full items-stretch bg-ink-0/60 select-none ${className}`}>
      {STATIONS.map((station) => {
        const isCurrent = station.id === (designStep === 'rocket' ? 'spacecraft' : designStep) && (!station.view || station.view === rideView)
        // The Launch tab answers for the whole launch: red whenever anything blocks it, not only its own checks (QC, 16 Nov)
        const isLaunch = station.id === 'go-nogo'
        const hasBlocker = isLaunch ? !checks.canGo : blockerSteps.has(station.id)
        const hasWarning = isLaunch ? checks.warnings.length > 0 : warningSteps.has(station.id)
        const isVisited = visitedSteps.includes(station.id)

        // Red when a check fixed here is no-go, yellow when one is a risk, green once visited and clear
        const status = hasBlocker
          ? { bar: 'bg-nogo', dot: 'bg-nogo animate-pulse', word: 'No-go', text: 'text-nogo' }
          : hasWarning
            ? { bar: 'bg-caution', dot: 'bg-caution', word: 'Risk', text: 'text-caution' }
            : isVisited
              ? { bar: 'bg-go', dot: 'bg-go', word: 'Go', text: 'text-go' }
              : { bar: 'bg-rule', dot: 'bg-rule', word: 'Not yet', text: 'text-paper-faint' }

        return (
          <button
            key={station.label}
            type="button"
            aria-current={isCurrent ? 'step' : undefined}
            title={`${station.label} at the ${station.stationName}: ${status.word}`}
            onClick={() => {
              audio.play('sfx.click')
              if (station.view) setRideView(station.view)
              goToStep(station.id, setDesignStep)
            }}
            className={`group relative flex min-w-0 flex-1 items-center justify-center gap-2 border-r border-rule/60 px-2 py-2 last:border-r-0 transition-colors ${
              isCurrent ? 'bg-kapton/15 text-paper' : 'text-paper-dim hover:bg-ink-2 hover:text-paper'
            }`}
          >
            <span className={`fp-data text-[0.7rem] ${isCurrent ? 'text-kapton' : 'text-paper-faint'}`}>{station.num}</span>
            <span className={`truncate text-[0.8rem] font-semibold tracking-wide ${isCurrent ? 'text-kapton' : ''}`}>{station.label}</span>
            <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} aria-hidden />
            <span className="sr-only">{status.word}</span>
            {/* The stage's status along its foot; the current stage has a bright top edge too */}
            <span className={`absolute inset-x-0 bottom-0 h-[3px] ${status.bar} ${isCurrent ? '' : 'opacity-70'}`} aria-hidden />
            {isCurrent && <span className="absolute inset-x-0 top-0 h-[2px] bg-kapton" aria-hidden />}
          </button>
        )
      })}
    </nav>
  )
}
