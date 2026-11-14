import { useRideView } from '../../viz/ride/useRideView'
import type { BarStatus } from '../../sim/types'
import { ROCKET_X, SKY_W } from '../../viz/ride/skyPath'

/**
 * Text laid over the launch pad scene: the title line, the overall status, the
 * four Go / No-Go bars this step can turn red with their reasons, the rocket's
 * name and payload, and the timeline. HTML, so it stays sharp and readable by
 * screen readers.
 */

const BAR_TEXT: Record<BarStatus, string> = { green: 'text-green-400', yellow: 'text-amber-300', red: 'text-red-400' }
const BAR_BORDER: Record<BarStatus, string> = { green: 'border-green-400/70', yellow: 'border-amber-300/80', red: 'border-red-400/80' }
const BAR_DOT: Record<BarStatus, string> = { green: 'bg-green-400', yellow: 'bg-amber-300', red: 'bg-red-400' }
const RED = '#f87171'
const GREEN = '#4ade80'
const CHIP = { go: 'bg-green-400', caution: 'bg-amber-300', nogo: 'bg-red-400' }

export function RideOverlay() {
  const view = useRideView()
  return (
    <div className="pointer-events-none absolute top-14 left-4 max-w-[38%] select-none">
      <div className="text-[13px] font-bold whitespace-nowrap text-slate-200">LAUNCH SITE · LUNAR ICE MAPPER · RIDE &amp; TRANSFER</div>
      <div className="mt-2 flex items-center gap-1.5 whitespace-nowrap">
        <span className={`rounded-md px-2 py-0.5 text-xs font-extrabold text-[#03050a] ${CHIP[view.status]}`}>{view.statusLabel}</span>
        {view.bars.map((b) => (
          <span
            key={b.resource}
            className={`flex items-center gap-1 rounded-full border bg-[#03050a]/60 px-2 py-0.5 text-[11px] font-bold ${BAR_BORDER[b.status]} ${BAR_TEXT[b.status]}`}
          >
            <span className={`h-2 w-2 rounded-full ${BAR_DOT[b.status]}`} />
            {b.resource.toUpperCase()}
          </span>
        ))}
      </div>
      <div className="mt-2 space-y-1 text-[13px] leading-[17px] font-medium" aria-live="polite">
        {view.reasons.map((r) => (
          <p key={r.resource} className={`line-clamp-2 ${BAR_TEXT[r.status]}`} title={r.reason}>
            {r.resource.toUpperCase()}: {r.reason}
          </p>
        ))}
        <p className="pt-1 text-xs font-semibold tracking-wide text-slate-400">{view.costLine}</p>
      </div>
    </div>
  )
}

export function RideTimeline() {
  const view = useRideView()
  const t = view.timeline
  const pos = (turn: number) => `${((turn - 1) / t.turns) * 100}%`
  const width = (turns: number) => `${(turns / t.turns) * 100}%`
  const arrived = t.arrivalTurn !== null
  const flag = (turn: number, label: string, colour: string, above: boolean) => (
    <div className="absolute top-0 bottom-0" style={{ left: pos(turn) }}>
      <div className={`absolute ${above ? '-top-5' : 'top-0'} h-[calc(100%+1.25rem)] w-0.5`} style={{ background: colour }} />
      <div className={`absolute left-1.5 text-xs font-bold whitespace-nowrap ${above ? '-top-6' : '-bottom-5'}`} style={{ color: colour }}>
        {label}
      </div>
    </div>
  )
  const launchNote = t.direct ? (t.showMapping ? ' · AT THE MOON 5 DAYS LATER' : t.flyPast ? ' · FLIES PAST THE MOON 5 DAYS LATER' : '') : ''
  return (
    <div className="pointer-events-none absolute right-4 bottom-0 left-4 select-none">
      <div className="absolute bottom-[6.75rem] text-center" style={{ left: `${(ROCKET_X / SKY_W) * 100}%`, transform: 'translateX(-50%)' }}>
        <div className="text-sm font-bold tracking-wide text-slate-200">{view.rideName}</div>
        <div className={`text-xs font-semibold ${view.payload.over ? 'text-red-400' : 'text-slate-400'}`}>
          PAYLOAD {view.payload.mass.toFixed(1)} kg · LIMIT {view.payload.limit} kg
        </div>
      </div>
      <div className="relative mb-7 h-7 rounded bg-slate-900/90 text-[11px] font-semibold">
        <div className="absolute inset-y-0 flex items-center bg-slate-700/90 pl-2 text-slate-100" style={{ left: 0, width: width(t.readyTurn) }}>
          <span className="truncate">DESIGN · BUILD · TEST</span>
        </div>
        {arrived && t.transferTurns !== null && t.transferTurns > 0 && (
          <div
            className="absolute inset-y-0 flex items-center justify-center bg-blue-200/30 text-white"
            style={{ left: pos(t.rideTurn), width: width(t.transferTurns) }}
          >
            <span className="truncate px-1">{t.transferTurns} TURNS IN TRANSIT</span>
          </div>
        )}
        {t.showMapping && t.arrivalTurn !== null && (
          <div
            className="absolute inset-y-0 flex items-center justify-center bg-indigo-400/35 text-indigo-100"
            style={{ left: pos(t.arrivalTurn), width: width(12) }}
          >
            <span className="truncate px-1">12 TURNS OF MAPPING</span>
          </div>
        )}
        {flag(t.readyTurn, `READY · TURN ${t.readyTurn}`, t.late ? RED : GREEN, false)}
        {flag(t.rideTurn, `LAUNCH · TURN ${t.rideTurn}${launchNote}`, '#ffffff', true)}
        {t.arrivalTurn !== null &&
          !t.direct &&
          flag(
            t.arrivalTurn,
            t.flyPast ? `FLIES PAST · TURN ${t.arrivalTurn}` : `ARRIVE · TURN ${t.arrivalTurn}`,
            t.flyPast ? RED : view.orbit.colour,
            true
          )}
      </div>
    </div>
  )
}
