import { useRideView } from '../../viz/ride/useRideView'
import { timelineLayout } from '../../viz/ride/rideView'
import { DesignDeltaLine } from '../../viz/DesignDeltaLine'
import type { BarStatus } from '../../sim/types'
import { ROCKET_X, SKY_W } from '../../viz/ride/skyPath'
import { Eng, Sheet, Stamp, type StampVerdict } from '../kit'
import { SceneTitle } from './launch/SceneTitle'

/**
 * Text laid over the launch pad scene: the step title, the one verdict (when the craft arrives and
 * whether the fuel is enough), the four Go / No-Go swatches this step can turn red, the rocket's
 * name and the timeline. Engineer view adds the reasons, payload and plan cost. HTML, so it stays
 * sharp and readable by screen readers.
 */

const SWATCH: Record<BarStatus, string> = { green: 'bg-go', yellow: 'bg-caution', red: 'bg-nogo' }
const SWATCH_TEXT: Record<BarStatus, string> = { green: 'text-paper-dim', yellow: 'text-caution', red: 'text-nogo' }
const STAMP: Record<'go' | 'caution' | 'nogo', StampVerdict> = { go: 'go', caution: 'caution', nogo: 'nogo' }

/** The one plain verdict of the step: "Arrives month N · enough fuel" */
export function RideVerdict({ className = '' }: { className?: string }) {
  const view = useRideView()
  const arrival = view.timeline.arrivalTurn
  const fuelOk = view.reach === 'ok' && view.bars.find((b) => b.resource === 'Delta-v')?.status !== 'red'
  const where =
    view.reach === 'noWay'
      ? 'Cannot get to the Moon'
      : view.reach === 'noPower'
        ? 'The engine has no power'
        : view.reach === 'flyPast'
          ? 'Flies past the Moon'
          : arrival === null
            ? 'Never arrives'
            : `Arrives month ${arrival}`
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} aria-live="polite">
      <Stamp key={view.statusLabel} verdict={STAMP[view.status]} size="sm" animate>
        {view.statusLabel}
      </Stamp>
      <span className="text-sm font-semibold text-paper">
        {where} <span className="text-paper-faint">·</span>{' '}
        <span className={fuelOk ? 'text-go' : 'text-nogo'}>{fuelOk ? 'enough fuel' : 'not enough fuel'}</span>
      </span>
    </div>
  )
}

export function RideOverlay({ maxWidth }: { maxWidth?: number }) {
  const view = useRideView()
  return (
    <div className="pointer-events-none absolute top-14 left-4 max-w-[38%] space-y-1.5 select-none" style={maxWidth ? { maxWidth } : undefined}>
      <SceneTitle step="ride" title="Ride & Transfer" />
      <Sheet className="p-3">
        <RideVerdict />
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-rule pt-2">
          {view.bars.map((b) => (
            <li key={b.resource} className="inline-flex items-center gap-1.5" title={b.reason}>
              <span className={`h-2.5 w-2.5 ${SWATCH[b.status]}`} aria-hidden />
              <span className={`fp-label text-[0.68rem] ${SWATCH_TEXT[b.status]}`}>{b.resource}</span>
              <span className="sr-only">{b.status}</span>
            </li>
          ))}
        </ul>
        <Eng as="div" className="mt-2 space-y-1 text-xs leading-snug">
          {view.reasons.map((r) => (
            <p key={r.resource} className={`line-clamp-3 ${SWATCH_TEXT[r.status]}`} title={r.reason}>
              {r.resource}: {r.reason}
            </p>
          ))}
          <p className="pt-1 fp-data text-paper-faint">{view.costLine}</p>
        </Eng>
        <DesignDeltaLine className="mt-2" />
      </Sheet>
    </div>
  )
}

const BLOCK_CLASS = {
  design: 'justify-start bg-ink-3 pl-2 text-paper',
  transit: 'justify-center bg-paper/15 text-paper',
  mapping: 'justify-center bg-ice/20 text-ice',
}

export function RideTimeline() {
  const view = useRideView()
  const { blocks, flags } = timelineLayout(view.timeline)
  const tone = { good: 'var(--color-go)', bad: 'var(--color-nogo)', plain: 'var(--color-paper)', orbit: view.orbit.colour }
  const pct = (share: number) => `${share * 100}%`
  return (
    <div className="pointer-events-none absolute right-4 bottom-0 left-4 select-none">
      <div className="absolute bottom-[6.75rem] text-center" style={{ left: `${(ROCKET_X / SKY_W) * 100}%`, transform: 'translateX(-50%)' }}>
        <div className="fp-display text-sm text-paper">{view.rideName}</div>
        <Eng as="div" className={`fp-data text-xs font-semibold ${view.payload.over ? 'text-nogo' : 'text-paper-dim'}`}>
          PAYLOAD {view.payload.mass.toFixed(1)} kg · LIMIT {view.payload.limit} kg
        </Eng>
      </div>
      <div className="relative mb-7 h-7 border border-rule bg-ink-1 fp-data text-[11px] font-semibold">
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
