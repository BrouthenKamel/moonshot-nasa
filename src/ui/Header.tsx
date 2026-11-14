import { AudioControls } from './kit/AudioControls'
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
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#070c18]/95 px-4 py-2 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--role-accent)] shadow-[0_0_10px_var(--role-accent)]"
          aria-hidden="true"
        />
        <h1 className="font-display text-lg font-bold tracking-wide text-white">Moonshot</h1>
        {screen !== 'title' && (
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-slate-300">
            {lunarIceMapperBrief.name}
          </span>
        )}
        {screen === 'design' && (
          <span className="hidden items-center gap-1.5 rounded-full border border-[var(--role-border)] bg-[var(--role-surface)] px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--role-accent)] sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--role-accent)]" aria-hidden="true" />
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
            className="rounded-lg border border-orange-400/50 bg-orange-600 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-white shadow-[0_0_16px_rgba(234,88,12,0.35)] transition hover:bg-orange-500"
          >
            ← Agency base
          </button>
        )}
        <AudioControls />
      </div>
    </header>
  )
}
