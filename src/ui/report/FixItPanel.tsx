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
    <section aria-labelledby="fixit-title" className="rounded-lg border border-orange-500/40 bg-slate-900 p-4">
      <h2 id="fixit-title" className="font-semibold text-orange-300">
        What to fix
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        {causes.length === 1 ? 'This decision' : 'These decisions'} cost the mission most. Your design is kept: change{' '}
        {causes.length === 1 ? 'it' : 'them'} and launch again.
      </p>
      <ol className="mt-3 space-y-3">
        {causes.map((c, i) => (
          <li key={c.step} className="rounded-md bg-slate-800 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-100">
                  {i + 1}. {c.decision}
                </div>
                <div className="mt-1 text-sm text-slate-300">{c.why}</div>
              </div>
              <button
                type="button"
                onClick={() => reviseAt(c.step)}
                className="shrink-0 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300"
                aria-label={`Fix ${c.decision} at the ${c.buildingName}, ${STEP_NAMES[c.step]} step`}
              >
                Fix at {c.buildingName}
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
      className="flex-1 rounded-lg bg-slate-700 py-3 font-medium text-slate-200 hover:bg-slate-600"
      title={first ? `Keeps your design and opens the ${first.buildingName} (${STEP_NAMES[first.step]})` : 'Keeps your design'}
    >
      Relaunch with changes
    </button>
  )
}
