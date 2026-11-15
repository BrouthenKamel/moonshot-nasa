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
        <span
          className="h-3 w-1 shrink-0 bg-[var(--role-accent)]"
          aria-hidden="true"
        />
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
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums">
            <span className="rounded-md border border-white/10 bg-[#040812] px-2.5 py-1 text-slate-100">
              Month {simState.currentTurn}
            </span>
            <span className="rounded-md border border-white/10 bg-[#040812] px-2.5 py-1 text-slate-300">
              Phase: <span className="capitalize text-white">{simState.phase}</span>
            </span>
            <span className="hidden rounded-md border border-cyan-500/30 bg-cyan-950/30 px-2.5 py-1 text-[#22d3ee] md:inline">
              Ice {simState.coveragePercent.toFixed(0)}%
            </span>
            <span className="hidden rounded-md border border-white/10 bg-[#040812] px-2.5 py-1 text-emerald-300 md:inline">
              {simState.totalDataReturned.toFixed(0)} MB
            </span>
            <span className="hidden rounded-md border border-white/10 bg-[#040812] px-2.5 py-1 text-orange-300 lg:inline">
              {Math.max(0, simState.fuelRemaining).toFixed(0)} m/s
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
