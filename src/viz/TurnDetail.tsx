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
    <div className="rounded-xl border border-white/10 bg-[#040812]/90 p-2.5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)]">
      <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  )
}

export function TurnDetail({ log }: TurnDetailProps) {
  return (
    <div className="hud-panel space-y-3 rounded-2xl p-4">
      <div className="flex items-baseline justify-between border-b border-white/10 pb-2">
        <div className="font-mono text-sm font-bold uppercase tracking-wider text-slate-100 tabular-nums">
          Month {log.turn}
        </div>
        <div className="font-mono text-xs uppercase tracking-wider text-slate-300">
          Phase: <span className="text-[var(--role-accent)] capitalize">{log.phase}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Coverage" value={`${log.coveragePercent.toFixed(1)}%`} tone={log.coveragePercent >= 70 ? 'text-[#22d3ee]' : 'text-blue-400'} />
        <Stat label="Data made" value={`${log.dataGenerated.toFixed(0)} MB`} tone="text-emerald-300" />
        <Stat label="Data sent" value={`${log.dataSent.toFixed(0)} MB`} tone="text-emerald-300" />
        <Stat label="Data lost" value={`${log.dataLost.toFixed(0)} MB`} tone={log.dataLost > 0 ? 'text-rose-300' : 'text-slate-300'} />
        <Stat label="Science home" value={`${log.totalDataReturned.toFixed(0)} MB`} tone="text-emerald-300" />
        <Stat label="Fuel" value={`${log.fuelRemaining.toFixed(0)} m/s`} tone="text-orange-300" />
        <Stat label="Reserve" value={`$${log.reserveRemaining.toFixed(2)}M`} tone="text-purple-300" />
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
          <div key={i} className="rounded-xl border border-rose-500/35 bg-rose-950/35 p-3 text-sm">
            <div className="font-semibold text-rose-300">{d.name}</div>
            <div className="text-slate-200">
              {d.choice ? `Choice: ${d.choice}` : 'No choice to make'}
              {choiceResultText(ev) && (
                <span className={ev.choiceSucceeded ? 'text-emerald-400' : 'text-rose-400'}>{choiceResultText(ev)}</span>
              )}
            </div>
            <div className="font-mono text-xs text-slate-400 tabular-nums">{d.impacts.length ? d.impacts.join(', ') : 'No impact'}</div>
          </div>
        )
      })}
    </div>
  )
}
