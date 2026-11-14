import { useGameStore } from '../../state/gameStore'
import type { Report } from '../../sim/types'
import { STEP_NAMES } from '../../viz/missionMap'
import { topCauses } from './fixIt'

/**
 * "What to fix": the one or two decisions behind a failed or partial mission,
 * each with a button into the building and step that holds it, and a
 * "Relaunch with changes" that keeps the design and walks into the first one.
 * Nothing shows after a full success.
 */
export function FixItPanel({ report }: { report: Report }) {
  const reviseAt = useGameStore((s) => s.reviseAt)
  const causes = topCauses(report)
  if (causes.length === 0) return null

  return (
    <section aria-labelledby="fixit-title" className="hud-panel rounded-2xl border-l-4 border-l-orange-500 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-orange-400">
            Engineering Action Order
          </div>
          <h2 id="fixit-title" className="mt-0.5 font-display text-lg font-bold text-orange-200">
            What to fix
          </h2>
        </div>
        <span className="rounded-md border border-orange-400/30 bg-orange-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-orange-300">
          {causes.length} {causes.length === 1 ? 'priority change' : 'priority changes'}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-slate-300">
        {causes.length === 1 ? 'This decision' : 'These decisions'} cost the mission most. Your design is kept: change{' '}
        {causes.length === 1 ? 'it' : 'them'} and launch again.
      </p>
      <ol className="mt-3 space-y-3">
        {causes.map((c, i) => (
          <li key={c.step} className="rounded-xl border border-white/10 bg-slate-900/75 p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-orange-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-orange-300">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="font-medium text-slate-100">
                    {i + 1}. {c.decision}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                    {c.buildingName} · {STEP_NAMES[c.step]}
                  </span>
                </div>
                <div className="mt-1.5 text-sm text-slate-300">{c.why}</div>
              </div>
              <button
                type="button"
                onClick={() => reviseAt(c.step)}
                className="shrink-0 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300"
                aria-label={`Fix ${c.decision} at the ${c.buildingName}, ${STEP_NAMES[c.step]} step`}
              >
                {`Fix at ${c.buildingName}`}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** The report's "Relaunch with changes": keeps the design and opens the first decision to fix */
export function RelaunchButton({ report }: { report: Report }) {
  const reviseAt = useGameStore((s) => s.reviseAt)
  const first = topCauses(report)[0]
  return (
    <button
      type="button"
      onClick={() => reviseAt(first?.step ?? 'brief')}
      className="tactical-btn-back flex-1 justify-center py-3 text-sm"
      title={first ? `Keeps your design and opens the ${first.buildingName} (${STEP_NAMES[first.step]})` : 'Keeps your design'}
    >
      Relaunch with changes
    </button>
  )
}
