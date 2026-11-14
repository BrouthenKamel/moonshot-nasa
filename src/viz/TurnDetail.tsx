import { getEventById } from '../data/events'
import { choiceResultText } from './eventChoice'
import type { Design, TurnEvent, TurnLog } from '../sim/types'

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

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded bg-slate-800 p-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-lg font-bold ${tone}`}>{value}</div>
    </div>
  )
}

export function TurnDetail({ log }: TurnDetailProps) {
  return (
    <div className="space-y-3 rounded-lg bg-slate-900 p-4">
      <div className="flex items-baseline justify-between">
        <div className="font-medium text-slate-200">Month {log.turn}</div>
        <div className="text-sm capitalize text-slate-400">Phase: {log.phase}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Coverage" value={`${log.coveragePercent.toFixed(1)}%`} tone="text-blue-400" />
        <Stat label="Data made" value={`${log.dataGenerated.toFixed(0)} MB`} tone="text-green-400" />
        <Stat label="Data sent" value={`${log.dataSent.toFixed(0)} MB`} tone="text-green-400" />
        <Stat label="Data lost" value={`${log.dataLost.toFixed(0)} MB`} tone="text-red-400" />
        <Stat label="Science home" value={`${log.totalDataReturned.toFixed(0)} MB`} tone="text-green-400" />
        <Stat label="Fuel" value={`${log.fuelRemaining.toFixed(0)} m/s`} tone="text-orange-400" />
        <Stat label="Reserve" value={`$${log.reserveRemaining.toFixed(2)}M`} tone="text-purple-400" />
      </div>

      {log.notes.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-300">
          {log.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      {log.events.map((ev, i) => {
        const d = describeEvent(ev)
        return (
          <div key={i} className="rounded border border-red-900 bg-red-950/40 p-3 text-sm">
            <div className="font-medium text-red-300">{d.name}</div>
            <div className="text-slate-300">
              {d.choice ? `Choice: ${d.choice}` : 'No choice to make'}
              {choiceResultText(ev) && (
                <span className={ev.choiceSucceeded ? 'text-green-400' : 'text-red-400'}>{choiceResultText(ev)}</span>
              )}
            </div>
            <div className="text-slate-400">{d.impacts.length ? d.impacts.join(', ') : 'No impact'}</div>
          </div>
        )
      })}
    </div>
  )
}
