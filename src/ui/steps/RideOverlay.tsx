import { useRideView } from '../../viz/ride/useRideView'
import { timelineLayout } from '../../viz/ride/rideView'
import { DesignDeltaLine } from '../../viz/DesignDeltaLine'
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

export function RideOverlay({ maxWidth }: { maxWidth?: number }) {
  const view = useRideView()
  return (
    <div
      className="hud-panel pointer-events-none absolute top-14 left-4 max-w-[38%] p-3 backdrop-blur-md select-none"
      style={maxWidth ? { maxWidth } : undefined}
    >
      <div className="font-mono text-[11px] font-bold tracking-[0.18em] whitespace-nowrap text-[var(--role-accent)]">
        LAUNCH SITE · LUNAR ICE MAPPER · RIDE &amp; TRANSFER
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 whitespace-nowrap">
        <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-extrabold text-[#03050a] ${CHIP[view.status]}`}>
          {view.statusLabel}
        </span>
        {view.bars.map((b) => (
          <span
            key={b.resource}
            className={`flex items-center gap-1 rounded-full border bg-[#03050a]/75 px-2 py-0.5 font-mono text-[11px] font-bold ${BAR_BORDER[b.status]} ${BAR_TEXT[b.status]}`}
          >
            <span className={`h-2 w-2 rounded-full ${BAR_DOT[b.status]}`} />
            {b.resource.toUpperCase()}
          </span>
        ))}
      </div>
      <div className="mt-2 space-y-1 text-[13px] leading-[17px] font-medium" aria-live="polite">
        {view.reasons.map((r) => (
          <p key={r.resource} className={`line-clamp-3 ${BAR_TEXT[r.status]}`} title={r.reason}>
            {r.resource.toUpperCase()}: {r.reason}
          </p>
        ))}
        <p className="pt-1 font-mono text-xs font-semibold tracking-wide tabular-nums text-slate-400">
          {view.costLine}
        </p>
      </div>
      <DesignDeltaLine className="mt-2" />
    </div>
  )
}

const BLOCK_CLASS = {
  design: 'justify-start bg-slate-700/90 pl-2 text-slate-100',
  transit: 'justify-center bg-blue-200/30 text-white',
  mapping: 'justify-center bg-indigo-400/35 text-indigo-100',
}

export function RideTimeline() {
  const view = useRideView()
  const { blocks, flags } = timelineLayout(view.timeline)
  const tone = { good: GREEN, bad: RED, plain: '#ffffff', orbit: view.orbit.colour }
  const pct = (share: number) => `${share * 100}%`
  return (
    <div className="pointer-events-none absolute right-4 bottom-0 left-4 select-none">
      <div className="absolute bottom-[6.75rem] text-center" style={{ left: `${(ROCKET_X / SKY_W) * 100}%`, transform: 'translateX(-50%)' }}>
        <div className="font-display text-sm font-bold tracking-wide text-slate-100">{view.rideName}</div>
        <div className={`font-mono text-xs font-semibold tabular-nums ${view.payload.over ? 'text-rose-400' : 'text-slate-400'}`}>
          PAYLOAD {view.payload.mass.toFixed(1)} kg · LIMIT {view.payload.limit} kg
        </div>
      </div>
      <div className="relative mb-7 h-7 rounded border border-slate-700/70 bg-slate-950/90 font-mono text-[11px] font-semibold tabular-nums">
        {blocks.map((b) => (
          <div
            key={b.key}
            className={`absolute inset-y-0 flex items-center overflow-hidden ${BLOCK_CLASS[b.key]}`}
            style={{ left: pct(b.from), width: pct(b.to - b.from) }}
          >
            <span className="truncate px-1">{b.label}</span>
          </div>
        ))}
        <div className="hud-bar-segments pointer-events-none absolute inset-0" />
        {flags.map((f) => {
          const colour = tone[f.tone]
          const above = f.side === 'above'
          return (
            <div key={f.key} className="absolute top-0 bottom-0" style={{ left: pct(f.at) }}>
              <div className={`absolute ${above ? '-top-5' : 'top-0'} h-[calc(100%+1.25rem)] w-0.5`} style={{ background: colour }} />
              {f.label && (
                <div className={`absolute left-1.5 text-xs font-bold whitespace-nowrap ${above ? '-top-6' : '-bottom-5'}`} style={{ color: colour }}>
                  {f.label}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
