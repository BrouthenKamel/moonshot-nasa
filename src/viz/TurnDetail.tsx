import { getEventById } from '../data/events'
import { choiceResultText } from './eventChoice'
import type { Design, TurnEvent, TurnLog } from '../sim/types'
import { failedLabelOfNotes } from '../sim/evaluate'
import { Eng, Tag } from '../ui/kit'

interface TurnDetailProps {
  log: TurnLog
  design: Design
}

function describeEvent(ev: TurnEvent) {
  const def = getEventById(ev.eventId)
  const choice = def?.choices.find((c) => c.id === ev.choiceId)
  const impacts: string[] = []
  if (ev.impact.deltavLost) impacts.push(`delta-v -${ev.impact.deltavLost.toFixed(0)} m/s`)
  if (ev.impact.powerLost) impacts.push(`power -${ev.impact.powerLost.toFixed(0)} W`)
  if (ev.impact.dataLost) impacts.push(`data -${ev.impact.dataLost.toFixed(0)} MB`)
  if (ev.impact.turnsLost) impacts.push(`${ev.impact.turnsLost} month(s) lost`)
  if (ev.impact.reserveSpent) impacts.push(`reserve -$${ev.impact.reserveSpent.toFixed(2)}M`)
  return { name: def?.name ?? ev.eventId, choice: choice?.name ?? ev.choiceId, impacts }
}

const PHASE_NAME: Record<TurnLog['phase'], string> = {
  build: 'Build',
  test: 'Test',
  wait: 'On the pad',
  transfer: 'Transfer',
  capture: 'Capture',
  orbit: 'Science orbit',
  complete: 'Complete',
  failed: 'Failed',
}

function Stat({ label, value, tone = 'text-paper' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-rule py-1">
      <dt className="fp-label text-[0.65rem]">{label}</dt>
      <dd className={`fp-data text-sm ${tone}`}>{value}</dd>
    </div>
  )
}

/** One month of the flight as a log entry: the timestamp, the readings, then each note and event as a tagged line */
export function TurnDetail({ log }: TurnDetailProps) {
  return (
    <article className="fp-sheet p-4" data-tone="raised">
      <header className="flex items-baseline justify-between gap-3 border-b border-rule-strong pb-1.5">
        <div className="fp-data text-base font-semibold text-kapton">
          MONTH {String(log.turn).padStart(2, '0')}
          <span className="sr-only"> (Month {log.turn})</span>
        </div>
        <Tag tone={log.phase === 'failed' ? 'nogo' : log.phase === 'complete' ? 'go' : 'neutral'}>{log.phase === 'failed' ? failedLabelOfNotes(log.notes) : PHASE_NAME[log.phase]}</Tag>
      </header>

      <dl className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-3">
        <Stat label="Ice mapped" value={`${log.coveragePercent.toFixed(1)}%`} tone="text-ice" />
        <Stat label="Science home" value={`${log.totalDataReturned.toFixed(0)} MB`} />
        <Stat label="Data sent" value={`${log.dataSent.toFixed(0)} MB`} />
        <Eng className="contents">
          <Stat label="Data made" value={`${log.dataGenerated.toFixed(0)} MB`} />
          <Stat label="Data lost" value={`${log.dataLost.toFixed(0)} MB`} tone={log.dataLost > 0 ? 'text-nogo' : 'text-paper-dim'} />
          <Stat label="Fuel" value={`${log.fuelRemaining.toFixed(0)} m/s`} />
          <Stat label="Reserve" value={`$${log.reserveRemaining.toFixed(2)}M`} tone={log.reserveRemaining < 0 ? 'text-nogo' : 'text-paper'} />
        </Eng>
      </dl>

      {(log.notes.length > 0 || log.events.length > 0) && (
        <ul className="mt-3 space-y-1.5">
          {log.notes.map((n, i) => (
            <li key={`n${i}`} className="flex items-baseline gap-2 text-sm text-paper">
              <Tag className="shrink-0">Log</Tag>
              <span className="min-w-0">{n}</span>
            </li>
          ))}
          {log.events.map((ev, i) => {
            const d = describeEvent(ev)
            const result = choiceResultText(ev)
            return (
              <li key={`e${i}`} className="flex items-baseline gap-2 border-l-2 border-caution pl-2 text-sm">
                <Tag tone="caution" className="shrink-0">
                  Event
                </Tag>
                <div className="min-w-0">
                  <div className="font-semibold text-paper">{d.name}</div>
                  <div className="text-paper-dim">
                    {d.choice ? `Choice: ${d.choice}` : 'No choice to make'}
                    {result && <span className={ev.choiceSucceeded ? 'text-go' : 'text-nogo'}>{result}</span>}
                  </div>
                  <Eng as="div" className="fp-data text-xs text-paper-faint">
                    {d.impacts.length ? d.impacts.join(', ') : 'No impact'}
                  </Eng>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}
