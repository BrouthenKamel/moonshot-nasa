import { useMemo } from 'react'
import { useGameStore } from '../state/gameStore'
import type { DesignStep } from '../sim/types'
import { STEP_ORDER, stepNumber } from './kit'
import { roleForStep } from './Shell'

const STEP_NAME: Record<DesignStep, string> = {
  brief: 'Brief',
  planning: 'Planning',
  instruments: 'Instruments',
  rocket: 'Rocket',
  spacecraft: 'Spacecraft',
  orbit: 'Orbit',
  ride: 'Ride & Transfer',
  comms: 'Communications',
  'go-nogo': 'Go/No-Go',
}

type Swatch = 'nogo' | 'caution' | 'go' | 'unvisited'

const SWATCH_CLASS: Record<Swatch, string> = {
  nogo: 'bg-nogo border-nogo',
  caution: 'bg-caution border-caution',
  go: 'bg-go border-go',
  unvisited: 'bg-transparent border-rule-strong',
}

const SWATCH_WORD: Record<Swatch, string> = {
  nogo: 'blocked',
  caution: 'warning',
  go: 'done',
  unvisited: 'not visited',
}

/** The mission sequence as a flight-plan list: step number, name, a square status swatch. */
export function StepRail() {
  const designStep = useGameStore((s) => s.designStep)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const visitedSteps = useGameStore((s) => s.visitedSteps)
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)

  const currentIndex = STEP_ORDER.indexOf(designStep)
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
    <nav aria-label="Mission Sequence" className="flex w-48 shrink-0 flex-col border-r border-rule bg-ink-1">
      <div className="border-b border-rule px-3 py-2.5">
        <div className="fp-label">Mission Sequence</div>
      </div>

      {/* Clear bottom padding leaves space for <Narrator /> in the lower rail without overlap */}
      <ol className="flex-1 overflow-y-auto py-1 pb-56">
        {STEP_ORDER.map((id, index) => {
          const isCurrent = id === designStep
          const isPast = index < currentIndex
          const isVisited = visitedSteps.includes(id)
          const swatch: Swatch = blockerSteps.has(id)
            ? 'nogo'
            : warningSteps.has(id)
              ? 'caution'
              : isVisited || isPast
                ? 'go'
                : 'unvisited'

          return (
            <li key={id} data-role={roleForStep(id)}>
              <button
                type="button"
                onClick={() => setDesignStep(id)}
                aria-current={isCurrent ? 'step' : undefined}
                style={{ borderLeftColor: isCurrent ? 'var(--role-accent)' : 'transparent' }}
                className={`flex w-full items-center gap-2 border-b border-l-2 border-b-rule px-2.5 py-2 text-left transition-colors ${
                  isCurrent
                    ? 'bg-ink-3 text-paper'
                    : `hover:bg-ink-2 ${isPast || isVisited ? 'text-paper' : 'text-paper-dim hover:text-paper'}`
                }`}
              >
                <span className={`fp-data w-5 shrink-0 text-[11px] ${isCurrent ? 'text-[var(--role-accent)]' : 'text-paper-faint'}`}>
                  {String(stepNumber(id)).padStart(2, '0')}
                </span>
                <span className="fp-label min-w-0 flex-1 truncate text-[0.72rem]" style={{ color: 'inherit' }}>
                  {STEP_NAME[id]}
                </span>
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 border ${SWATCH_CLASS[swatch]}`} />
                <span className="sr-only">({SWATCH_WORD[swatch]})</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
