import { useGameStore } from '../../state/gameStore'
import type { Report } from '../../sim/types'
import { STEP_NAMES } from '../../viz/missionMap'
import { Sheet, Tag } from '../kit'
import { fixLabel, topCauses } from './fixIt'

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
    <Sheet as="section" aria-labelledby="fixit-title" className="border-t-2 border-t-kapton p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="fp-label text-kapton">Engineering Action Order</div>
          <h2 id="fixit-title" className="mt-0.5 fp-display text-lg text-paper">
            What to fix
          </h2>
        </div>
        <Tag tone="kapton">
          {causes.length} {causes.length === 1 ? 'priority change' : 'priority changes'}
        </Tag>
      </div>
      <p className="mt-1.5 text-sm text-paper-dim">
        {causes.length === 1 ? 'This decision' : 'These decisions'} cost the mission most. Your design is kept: change{' '}
        {causes.length === 1 ? 'it' : 'them'} and launch again.
      </p>
      <ol className="mt-3 space-y-3">
        {causes.map((c, i) => (
          <li key={c.step} className="border-b border-rule pb-3 last:border-b-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="fp-data text-[11px] text-kapton">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-medium text-paper">
                    {i + 1}. {c.decision}
                  </span>
                  <span className="fp-label text-[10px] text-paper-faint">
                    {c.buildingName} · {STEP_NAMES[c.step]}
                  </span>
                </div>
                <div className="mt-1.5 text-sm text-paper-dim">{c.why}</div>
              </div>
              <button
                type="button"
                onClick={() => reviseAt(c.step)}
                className="fp-btn-primary shrink-0"
                aria-label={`Fix ${c.decision} at the ${c.buildingName}, ${STEP_NAMES[c.step]} step`}
              >
                {fixLabel(c)}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </Sheet>
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
      className="fp-btn-secondary flex-1 justify-center py-3 text-sm"
      title={first ? `Keeps your design and opens the ${first.buildingName} (${STEP_NAMES[first.step]})` : 'Keeps your design'}
    >
      Relaunch with changes
    </button>
  )
}
