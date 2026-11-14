import { useGameStore } from '../../state/gameStore'
import { lunarIceMapperBrief, difficultyPresets } from '../../data/brief'

export function BriefScreen() {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const difficulty = useGameStore((s) => s.difficulty)
  const preset = difficultyPresets[difficulty]
  const brief = lunarIceMapperBrief

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="hud-step-header">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--role-accent)]">
          COMMS CENTER · LUNAR ICE MAPPER · BRIEF
        </div>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-50">
          {brief.name}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{brief.description}</p>
      </header>

      {/* I5a: the starting IR spectrometer cannot see into the shadowed craters; send new players to the lesson first */}
      <div
        className="hud-panel border-emerald-400/35 bg-emerald-950/35 p-4"
        data-testid="brief-first-stop"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"
          />
          <p className="text-sm text-emerald-100">
            <span className="font-semibold">Your first stop: the Research Lab.</span> Check whether your instrument can see into the dark craters.
          </p>
        </div>
      </div>

      <section className="hud-panel p-5">
        <h2 className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-slate-400">
          Mission Objective
        </h2>
        <p className="text-sm leading-relaxed text-slate-200">{brief.objective}</p>
      </section>

      <section className="hud-panel p-5">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-slate-400">
          Requirements
        </h2>
        <div className="space-y-2.5">
          {brief.requirements.map((req) => (
            <div
              key={req.id}
              className="flex items-start gap-3 rounded-lg border border-slate-700/60 bg-slate-950/55 p-3"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--role-border)] bg-[var(--role-surface)] font-mono text-xs font-bold text-[var(--role-accent)]">
                {req.id === 'capture' ? 'C' : req.id === 'coverage' ? '%' : req.id === 'data' ? 'D' : req.id === 'lifetime' ? 'T' : '$'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-medium text-slate-100">{req.name}</div>
                  <div className="rounded border border-slate-700/70 bg-slate-900/80 px-2 py-0.5 font-mono text-xs tabular-nums text-[var(--role-accent)]">
                    Target: {req.id === 'data' ? preset.dataTarget : req.target} {req.unit}
                  </div>
                </div>
                <div className="mt-0.5 text-sm text-slate-400">{req.description}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="hud-panel p-5">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-slate-400">
          Envelope Constraints
        </h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border border-slate-700/70 bg-slate-950/70 p-4 shadow-inner">
            <div className="font-mono text-2xl font-bold tabular-nums text-cyan-300">
              {brief.constraints.maxVolume}U
            </div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-slate-400">
              CubeSat Size
            </div>
          </div>
          <div className="rounded-lg border border-slate-700/70 bg-slate-950/70 p-4 shadow-inner">
            <div className="font-mono text-2xl font-bold tabular-nums text-cyan-300">
              {brief.constraints.maxMass} kg
            </div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Maximum Mass
            </div>
          </div>
          <div className="rounded-lg border border-slate-700/70 bg-slate-950/70 p-4 shadow-inner">
            <div className="font-mono text-2xl font-bold tabular-nums text-cyan-300">
              ${preset.budgetCap}M
            </div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Budget Cap
            </div>
          </div>
        </div>
      </section>

      <section className="hud-panel p-5">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-slate-400">
          3-Stage Mission Timeline
        </h2>
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
          <div className="rounded-lg border border-sky-400/35 bg-sky-950/40 px-3 py-2.5">
            <div className="font-mono text-[10px] uppercase tracking-wider text-sky-400">Stage 01</div>
            <div className="text-sm font-semibold text-sky-100">Build &amp; Test</div>
            <div className="font-mono text-xs tabular-nums text-sky-300/80">Months 0–{brief.defaultRideTurn}</div>
          </div>
          <span aria-hidden="true" className="font-mono text-sm text-slate-500">
            ──▶
          </span>
          <div className="rounded-lg border border-orange-400/35 bg-orange-950/40 px-3 py-2.5">
            <div className="font-mono text-[10px] uppercase tracking-wider text-orange-400">Stage 02</div>
            <div className="text-sm font-semibold text-orange-100">
              Ride (Month {brief.defaultRideTurn})
            </div>
            <div className="font-mono text-xs tabular-nums text-orange-300/80">Launch &amp; Transfer</div>
          </div>
          <span aria-hidden="true" className="font-mono text-sm text-slate-500">
            ──▶
          </span>
          <div className="rounded-lg border border-emerald-400/35 bg-emerald-950/40 px-3 py-2.5">
            <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-400">Stage 03</div>
            <div className="text-sm font-semibold text-emerald-100">
              Lunar Ops ({brief.missionDurationTurns} months)
            </div>
            <div className="font-mono text-xs tabular-nums text-emerald-300/80">Ice Mapping</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          The mission clock counts months from month 0, when the mission starts. Be ready before your ride leaves!
        </p>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setDesignStep('planning')}
          className="tactical-btn-next"
        >
          Begin Planning →
        </button>
      </div>
    </div>
  )
}
