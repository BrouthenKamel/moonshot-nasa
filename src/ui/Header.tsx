import { AudioControls } from './kit/AudioControls'
import { EngineerSwitch } from './kit/EngineerSwitch'
import { useGameStore } from '../state/gameStore'
import { lunarIceMapperBrief } from '../data/brief'
import { buildingForStep, buildingName, STEP_NAMES } from '../viz/missionMap'

export function Header() {
  const screen = useGameStore((s) => s.screen)
  const designStep = useGameStore((s) => s.designStep)
  const simState = useGameStore((s) => s.simState)
  const setScreen = useGameStore((s) => s.setScreen)

  const building = buildingForStep(designStep)
  const buildingLabel = buildingName(building)
  const stepLabel = STEP_NAMES[designStep]

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-ink-1 px-4 py-2">
      <div className="flex items-center gap-3">
        <span className="h-3 w-1 shrink-0 bg-[var(--role-accent)]" aria-hidden="true" />
        <h1 className="fp-display text-lg text-paper">Moonshot</h1>
        {screen !== 'title' && (
          <span className="fp-label">
            {lunarIceMapperBrief.name}
          </span>
        )}
        {screen === 'design' && (
          <span className="hidden items-center gap-1.5 border-l border-rule pl-3 fp-label text-[var(--role-accent)] sm:inline-flex">
            {buildingLabel} · {stepLabel}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {screen === 'simulation' && simState && (
          <div className="flex flex-wrap items-stretch text-xs">
            <span className="flex flex-col border-l border-rule px-2.5 leading-tight">
              <span className="fp-label text-[0.58rem] text-paper-faint">Clock</span>
              <span className="fp-data text-paper">{`Month ${simState.currentTurn}`}</span>
            </span>
            <span className="flex flex-col border-l border-rule px-2.5 leading-tight">
              <span className="fp-label text-[0.58rem] text-paper-faint">Phase</span>
              <span className="fp-data capitalize text-paper">{simState.phase}</span>
            </span>
            <span className="hidden flex-col border-l border-rule px-2.5 leading-tight md:flex">
              <span className="fp-label text-[0.58rem] text-paper-faint">Ice</span>
              <span className="fp-data text-ice">{simState.coveragePercent.toFixed(0)}%</span>
            </span>
            <span className="eng-only hidden flex-col border-l border-rule px-2.5 leading-tight md:flex">
              <span className="fp-label text-[0.58rem] text-paper-faint">Data</span>
              <span className="fp-data text-paper">{simState.totalDataReturned.toFixed(0)} MB</span>
            </span>
            <span className="eng-only hidden flex-col border-l border-rule px-2.5 leading-tight lg:flex">
              <span className="fp-label text-[0.58rem] text-paper-faint">Delta-v</span>
              <span className="fp-data text-paper">{Math.max(0, simState.fuelRemaining).toFixed(0)} m/s</span>
            </span>
          </div>
        )}

        {screen !== 'title' && (
          <button
            onClick={() => setScreen('base')}
            className="fp-btn-secondary"
          >
            ← Agency base
          </button>
        )}
        <EngineerSwitch />
        <AudioControls />
      </div>
    </header>
  )
}
