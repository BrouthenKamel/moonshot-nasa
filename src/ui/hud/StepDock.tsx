import { useMemo } from 'react'
import { useGameStore } from '../../state/gameStore'
import type { DesignStep } from '../../sim/types'
import { audio } from '../../assets/audio'

interface StationItem {
  id: DesignStep
  num: string
  label: string
  icon: string
  stationName: string
}

const STATIONS: StationItem[] = [
  { id: 'planning', num: '1', label: 'Plan', icon: '📋', stationName: 'Communications Center' },
  { id: 'instruments', num: '2', label: 'Science', icon: '🔬', stationName: 'Research Laboratory' },
  { id: 'spacecraft', num: '3', label: 'Craft', icon: '🛰️', stationName: 'Integration Cleanroom' },
  { id: 'rocket', num: '4', label: 'Rocket', icon: '🚀', stationName: 'Launch Bay Hall' },
  { id: 'orbit', num: '5', label: 'Orbit', icon: '🌐', stationName: 'Trajectory Navigation' },
  { id: 'go-nogo', num: '6', label: 'Launch', icon: '🚦', stationName: 'Flight Control Center' },
]

export function StepDock({
  compact = false,
  className = '',
}: {
  compact?: boolean
  className?: string
}) {
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

  if (compact) {
    return (
      <nav
        aria-label="Mission Sequencer"
        className={`flex items-center gap-1 rounded-xl bg-ink-2/70 p-1 border border-rule/50 select-none ${className}`}
      >
        {STATIONS.map((station) => {
          const isCurrent = station.id === designStep
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

  return (
    <nav
      aria-label="Mission Navigation Dock"
      className={`flex items-center gap-1.5 p-1.5 rounded-2xl bg-ink-1/90 border border-rule/80 backdrop-blur-md shadow-2xl select-none ${className}`}
    >
      {STATIONS.map((station) => {
        const isCurrent = station.id === designStep
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
            onClick={() => {
              audio.play('sfx.click')
              setDesignStep(station.id)
            }}
            className={`group relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono transition-all duration-200 ${
              isCurrent
                ? 'bg-kapton text-ink-0 font-bold shadow-lg shadow-kapton/20 scale-105'
                : 'text-paper-dim hover:text-paper hover:bg-ink-2/80'
            }`}
          >
            <span className="text-sm">{station.icon}</span>
            <span className="tracking-wide">{station.label}</span>
            <span
              className={`h-1.5 w-1.5 rounded-full transition-colors ${badgeDot} ${
                isCurrent && !hasBlocker ? 'bg-ink-0' : ''
              }`}
            />

            {/* Hover tooltip */}
            <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-ink-0 border border-rule text-[10px] font-mono text-paper-dim opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg">
              {station.stationName}
            </div>
          </button>
        )
      })}
    </nav>
  )
}
