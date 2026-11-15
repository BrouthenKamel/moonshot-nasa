import { useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useGameStore } from '../../../state/gameStore'
import { useSuccessEstimate } from '../../useOdds'
import type { DesignStep } from '../../../sim/types'

/*
 * The one dashboard of the Orbit and Transfer views: a compact panel on the right with the
 * figures for the value being set, the mission's chance and the way on. It never scrolls:
 * figures sit in small tiles, explanations are a line or two. The value itself is set with a
 * tall slider beside the view (PlanVSlider).
 */

export type Tone = 'green' | 'yellow' | 'red'

const TONE_TEXT: Record<Tone, string> = { green: 'text-go', yellow: 'text-caution', red: 'text-nogo' }
const TONE_BG: Record<Tone, string> = { green: 'bg-go', yellow: 'bg-caution', red: 'bg-nogo' }

/** Width of the dashboard in pixels; the 3D views leave this much room on the right */
export const PANEL_PX = 320

export function PlanPanel({ children }: { children: ReactNode }) {
  return (
    <aside
      style={{ width: PANEL_PX }}
      className="hud-panel pointer-events-auto flex max-h-full flex-col gap-2.5 overflow-hidden rounded-xl p-3.5 text-paper"
    >
      {children}
    </aside>
  )
}

/** Kicker, the big figure and a short line under it */
export function PlanHeadline({ kicker, value, unit, line }: { kicker: string; value: ReactNode; unit?: string; line?: ReactNode }) {
  return (
    <div>
      <div className="fp-label truncate text-[0.66rem] tracking-[0.16em] text-kapton">{kicker}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-display text-3xl font-bold leading-none text-paper">{value}</span>
        {unit && <span className="fp-data text-xs text-paper-dim">{unit}</span>}
      </div>
      {line && <div className="mt-1 line-clamp-2 text-[0.76rem] leading-snug text-paper-dim">{line}</div>}
    </div>
  )
}

/** A one- or two-line note in a tone */
export function PlanNote({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <p className={`line-clamp-2 text-[0.74rem] leading-snug ${TONE_TEXT[tone]}`}>{children}</p>
}

/** A small figure tile: label, value, a short note under it */
export function PlanRow({ label, value, tone, sub }: { label: string; value: ReactNode; tone?: Tone; sub?: ReactNode }) {
  return (
    <div className="min-w-0 bg-ink-1 px-2 py-1.5">
      <div className="truncate text-[0.64rem] uppercase tracking-wider text-paper-faint">{label}</div>
      <div className={`fp-data truncate text-[0.86rem] leading-tight ${tone ? TONE_TEXT[tone] : 'text-paper'}`}>{value}</div>
      {sub && <div className="truncate text-[0.62rem] text-paper-faint">{sub}</div>}
    </div>
  )
}

export function PlanRows({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-1">{children}</div>
}

/** A 0..1 bar with an optional goal mark */
export function PlanBar({ value, goal, tone }: { value: number; goal?: number; tone: Tone }) {
  return (
    <div className="relative h-1.5 w-full bg-ink-1">
      <div className={`h-full ${TONE_BG[tone]}`} style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
      {goal !== undefined && <div className="absolute -top-1 h-3.5 w-px bg-paper" style={{ left: `${goal * 100}%` }} />}
    </div>
  )
}

/** A labelled percentage with its bar */
export function PlanMeter({ label, pct, tone, goal }: { label: string; pct: number | null; tone: Tone; goal?: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="fp-label truncate text-[0.66rem] tracking-[0.14em] text-paper-dim">{label}</span>
        <span className={`fp-data text-base ${TONE_TEXT[tone]}`}>{pct === null ? '…' : `${Math.round(pct)}%`}</span>
      </div>
      <div className="mt-1">
        <PlanBar value={(pct ?? 0) / 100} goal={goal} tone={tone} />
      </div>
    </div>
  )
}

/** Go / No-Go rows that this view can turn red, with the reason of the worst one (two lines at most) */
export function PlanChecks({ checks }: { checks: { label: string; status: Tone; reason: string }[] }) {
  const worst = checks.find((c) => c.status === 'red') ?? checks.find((c) => c.status === 'yellow')
  return (
    <div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1">
        {checks.map((c) => (
          <span key={c.label} className="inline-flex items-center gap-1.5 fp-label text-[0.64rem] text-paper-dim">
            <span className={`h-2 w-2 ${TONE_BG[c.status]}`} aria-hidden />
            {c.label}
          </span>
        ))}
      </div>
      {worst && (
        <p title={worst.reason} className={`mt-1 line-clamp-2 text-[0.72rem] leading-snug ${TONE_TEXT[worst.status]}`}>
          {worst.reason}
        </p>
      )}
    </div>
  )
}

/** The chance the mission meets every goal with the design as it stands (200 of the core's own flights) */
export function PlanOdds() {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const odds = useSuccessEstimate(design, difficulty)
  const pct = odds ? odds.success * 100 : null
  const tone: Tone = pct === null ? 'yellow' : pct >= 60 ? 'green' : pct >= 30 ? 'yellow' : 'red'
  return (
    <div title={`Share of ${odds?.runs ?? 200} simulated flights that meet every goal`}>
      <PlanMeter label="Mission success" pct={pct} tone={tone} />
    </div>
  )
}

/** Back and on, at the foot of the panel */
export function PlanNav({ back, next }: { back?: { label: string; to: DesignStep | (() => void) }; next: { label: string; to: DesignStep | (() => void) } }) {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const go = (to: DesignStep | (() => void)) => (typeof to === 'function' ? to() : setDesignStep(to))
  return (
    <div className="mt-auto flex gap-2 pt-1">
      {back && (
        <button type="button" onClick={() => go(back.to)} className="tactical-btn-back flex-1 whitespace-nowrap bg-ink-1">
          {back.label}
        </button>
      )}
      <button type="button" onClick={() => go(next.to)} className="tactical-btn-next flex-[2] whitespace-nowrap">
        {next.label}
      </button>
    </div>
  )
}

/** Width of the tall slider in pixels; the 3D views leave this much room beside it */
export const SLIDER_PX = 76

/**
 * A tall slider beside the view: the top end is `topText`, the bottom `bottomText`; the dashboard
 * shows the value itself (and `valueText` reads it out). Pointer, keyboard (arrows, Page Up/Down, Home/End) and screen readers.
 * `value` and `min` are 0..1 positions; nothing below `min` can be chosen (e.g. engine limits).
 */
export function PlanVSlider({
  label,
  value,
  onChange,
  valueText,
  topText,
  bottomText,
  min = 0,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  valueText: string
  topText: string
  bottomText: string
  min?: number
}) {
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const at = (clientY: number) => {
    const r = track.current?.getBoundingClientRect()
    if (!r) return
    onChange(Math.max(min, Math.min(1, 1 - (clientY - r.top) / r.height)))
  }
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    dragging.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // capture is a nicety: the drag works without it
    }
    at(e.clientY)
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current) at(e.clientY)
  }
  const onUp = () => {
    dragging.current = false
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowUp: 0.01, ArrowRight: 0.01, ArrowDown: -0.01, ArrowLeft: -0.01, PageUp: 0.1, PageDown: -0.1 }[e.key]
    let next: number | null = step !== undefined ? value + step : e.key === 'Home' ? min : e.key === 'End' ? 1 : null
    if (next === null) return
    e.preventDefault()
    next = Math.max(min, Math.min(1, next))
    onChange(next)
  }
  const pct = (1 - value) * 100
  return (
    <div style={{ width: SLIDER_PX }} className="pointer-events-auto flex h-full flex-col items-center gap-2 py-1 select-none">
      <span className="fp-data text-center text-[0.68rem] text-paper-dim">{topText}</span>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={Math.round(min * 1000)}
        aria-valuemax={1000}
        aria-valuenow={Math.round(value * 1000)}
        aria-valuetext={valueText}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className="group relative w-10 flex-1 cursor-ns-resize touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-kapton"
      >
        {/* Track; the part nothing can reach (below min) is hatched out */}
        <div className="absolute inset-y-0 left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-ink-3 ring-1 ring-rule" />
        {min > 0 && (
          <div className="absolute inset-x-[42%] bottom-0 rounded-full bg-nogo/30" style={{ height: `${min * 100}%` }} title="Out of reach for this craft" />
        )}
        <div className="absolute bottom-0 left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-kapton/80" style={{ height: `${value * 100}%` }} />
        {/* Thumb with the value */}
        <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: `${pct}%` }}>
          <div className="h-5 w-5 rounded-full border-2 border-kapton bg-ink-0 shadow-[0_0_12px_rgba(232,163,61,0.6)] transition-transform group-active:scale-110" />
        </div>
      </div>
      <span className="fp-data text-center text-[0.68rem] text-paper-dim">{bottomText}</span>
    </div>
  )
}
