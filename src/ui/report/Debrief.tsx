import { useMemo } from 'react'
import type { Insight } from '../../minigames/contract'
import type { Report } from '../../sim/types'
import { useCampusStore } from '../../state/campusStore'
import { isClassicMode } from '../../world/mode'
import { ROOM_TITLES, compareFlight, theRoom, explainOutcome, roomToRedesign, type FlightRecord, type SubsystemLine, type Verdict } from '../../world/debrief/compare'
import { flyAgain } from '../../world/debrief/flyAgain'
import type { RoomId } from '../../world/rooms/ids'
import { Sheet, Tag, type TagTone } from '../kit'

/**
 * WP-4B debrief: why the mission went the way it did, then predicted (the rooms'
 * experiments) against actual (the flight), one line per subsystem, and
 * "Fly again" back into the one room to redesign.
 */

const VERDICT: Record<Verdict, { label: string; tone: TagTone; edge: string }> = {
  held: { label: 'Held', tone: 'go', edge: 'border-l-go' },
  worse: { label: 'Short', tone: 'nogo', edge: 'border-l-nogo' },
  untested: { label: 'Not reached', tone: 'neutral', edge: 'border-l-rule' },
}

/** Rooms the player can walk back into to change a decision (Mission Control only launches) */
const REDESIGN_ROOMS: RoomId[] = ['briefing', 'science-lab', 'clean-room', 'thermal-vac', 'flight-dynamics', 'ground-station', 'launch-hangar']

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
/** "1 months late" reads "1 month late" */
const show = (m: { value: number; unit: string }) =>
  m.unit === '%' ? `${fmt(m.value)}%` : `${fmt(m.value)} ${Math.abs(m.value) === 1 ? m.unit.replace(/^months\b/, 'month') : m.unit}`.trim()

function Numbers({ line }: { line: SubsystemLine }) {
  return (
    <div className="flex shrink-0 items-baseline gap-2 fp-data text-xs" aria-label="Predicted, then actual">
      <span className="text-paper-faint">{line.predicted ? show(line.predicted) : 'no test'}</span>
      <span className="text-paper-faint">→</span>
      <span className="text-paper">{line.actual ? show(line.actual) : '—'}</span>
    </div>
  )
}

export function Debrief({ report, record }: { report: Report; record: FlightRecord | null }) {
  const insights: Insight[] = useCampusStore((s) => s.insights)
  const lines = useMemo(() => (record ? compareFlight(insights, record) : []), [insights, record])
  const why = useMemo(() => explainOutcome(report, lines), [report, lines])
  const target = roomToRedesign(report, lines)
  const classic = isClassicMode()
  const tested = lines.filter((l) => l.predicted !== null).length

  return (
    <Sheet as="section" aria-labelledby="debrief-title" className="p-5 sm:p-6" data-testid="debrief">
      <div className="fp-label text-kapton">Debrief · predicted vs actual</div>
      <h2 id="debrief-title" className="mt-1 fp-display text-xl text-paper">
        Why it went this way
      </h2>
      <p className="mt-2 text-paper" data-testid="debrief-headline">
        {why.headline}
      </p>
      {why.reasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-paper-dim">
          {why.reasons.slice(0, 4).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {lines.length > 0 && (
        <>
          <div className="mt-5 flex items-baseline justify-between gap-2 border-b border-rule pb-1">
            <div className="fp-label">Your experiments against the flight</div>
            <div className="fp-data text-[11px] text-paper-faint">
              {tested} of {lines.length} tested on the ground
            </div>
          </div>
          <ol className="mt-2 space-y-2">
            {lines.map((l) => {
              const v = VERDICT[l.verdict]
              return (
                <li key={l.id} className={`border-l-2 bg-ink-1 px-3.5 py-2.5 ${v.edge}`} data-subsystem={l.id} data-verdict={l.verdict}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-paper">{l.name}</span>
                      <Tag tone={v.tone}>{v.label}</Tag>
                    </div>
                    <Numbers line={l} />
                  </div>
                  <p className="mt-1 text-sm text-paper">{l.line}</p>
                  <p className="mt-0.5 text-xs text-paper-dim">{l.why}</p>
                </li>
              )
            })}
          </ol>
        </>
      )}

      {!classic && (
        <div className="mt-5 border-t border-rule pt-4" data-testid="fly-again">
          <div className="fp-label">Fly again</div>
          <p className="mt-1 text-sm text-paper-dim">
            Your craft stays as it is. Walk back into one room, change one decision, and launch again.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {target && (
              <button type="button" onClick={() => flyAgain(target)} className="fp-btn-primary" data-room={target}>
                {`Redesign in ${theRoom(target)}`}
              </button>
            )}
            {REDESIGN_ROOMS.filter((r) => r !== target).map((r) => (
              <button key={r} type="button" onClick={() => flyAgain(r)} className="fp-btn-secondary !px-2.5 !py-1 !text-[11px]" data-room={r}>
                {ROOM_TITLES[r]}
              </button>
            ))}
            <button type="button" onClick={() => flyAgain(null)} className="fp-btn-ghost !text-[11px]">
              Back to campus
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
