import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'
import { turnConstants } from '../../data/brief'
import { percent } from '../../sim/odds'
import { usePlanningOdds } from '../useOdds'
import { useDesignPreview } from '../useDesignPreview'
import { DesignDeltaLine } from '../../viz/DesignDeltaLine'
import { canUseWebGL } from '../../scene/webgl'
import type { ControlFocus } from '../../scene/ControlRoom'

const ControlRoom = lazy(() => import('../../scene/ControlRoom').then((m) => ({ default: m.ControlRoom })))

const TEST_MONTH_OPTIONS = [0, 1, 2, 3]
const RESERVE_OPTIONS = [0, 5, 10, 15, 20]

/** Falls back to the plain controls if the 3D room throws. */
class RoomBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * F2 (Jakob, 14 Nov): what a control really does to the chance of full success,
 * at the current setting and at every other one.
 */
function OddsRow({ byValue, current, label }: { byValue?: Record<number, number>; current: number; label: (v: number) => string }) {
  if (!byValue || byValue[current] === undefined)
    return <div className="mt-2 font-mono text-xs text-slate-400">Working out the chance of full success…</div>
  const others = Object.keys(byValue)
    .map(Number)
    .filter((v) => v !== current)
    .sort((a, b) => a - b)
  return (
    <div className="mt-2.5 rounded border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-300" aria-live="polite">
      <div className="font-mono text-xs font-semibold tabular-nums text-cyan-300">
        {`Chance of full success: about ${percent(byValue[current])}`}
      </div>
      <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400">
        {others.map((v) => `${label(v)}: about ${percent(byValue[v])}`).join(' · ')}
      </div>
    </div>
  )
}

function QuickPickTestButtons({
  current,
  oddsByValue,
  onPick,
  onHover,
  onFocusField,
  compact = false,
}: {
  current: number
  oddsByValue?: Record<number, number>
  onPick: (v: number) => void
  onHover: (v: number | null) => void
  onFocusField?: (f: ControlFocus) => void
  compact?: boolean
}) {
  return (
    <div
      className={compact ? 'flex flex-wrap gap-1.5' : 'grid grid-cols-4 gap-2'}
      onMouseLeave={() => onHover(null)}
    >
      {TEST_MONTH_OPTIONS.map((v) => {
        const active = current === v
        const odd = oddsByValue?.[v]
        return (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            onMouseEnter={() => onHover(v)}
            onFocus={() => {
              onHover(v)
              onFocusField?.('test')
            }}
            onBlur={() => {
              onHover(null)
              onFocusField?.(null)
            }}
            className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 font-mono text-xs tabular-nums transition ${
              active
                ? 'border-[var(--role-accent)] bg-[var(--role-surface)] text-white shadow-[0_0_12px_var(--role-glow)]'
                : 'border-slate-700/70 bg-slate-950/70 text-slate-300 hover:border-slate-500 hover:bg-slate-800/80'
            }`}
          >
            <span className="font-semibold">{v} mo</span>
            <span className={active ? 'text-cyan-300' : 'text-slate-400'}>
              {odd !== undefined ? percent(odd) : '…'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function QuickPickReserveButtons({
  current,
  oddsByValue,
  onPick,
  onHover,
  onFocusField,
  compact = false,
}: {
  current: number
  oddsByValue?: Record<number, number>
  onPick: (v: number) => void
  onHover: (v: number | null) => void
  onFocusField?: (f: ControlFocus) => void
  compact?: boolean
}) {
  return (
    <div
      className={compact ? 'flex flex-wrap gap-1.5' : 'grid grid-cols-5 gap-2'}
      onMouseLeave={() => onHover(null)}
    >
      {RESERVE_OPTIONS.map((v) => {
        const active = current === v
        const odd = oddsByValue?.[v]
        const recommended = v === turnConstants.recommendedReservePercent
        return (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            onMouseEnter={() => onHover(v)}
            onFocus={() => {
              onHover(v)
              onFocusField?.('reserve')
            }}
            onBlur={() => {
              onHover(null)
              onFocusField?.(null)
            }}
            className={`flex flex-col items-center rounded-md border px-2 py-1.5 font-mono text-xs tabular-nums transition ${
              active
                ? 'border-[var(--role-accent)] bg-[var(--role-surface)] text-white shadow-[0_0_12px_var(--role-glow)]'
                : 'border-slate-700/70 bg-slate-950/70 text-slate-300 hover:border-slate-500 hover:bg-slate-800/80'
            }`}
          >
            <span className="flex items-center gap-1 font-semibold">
              {v}%
              {recommended && (
                <span aria-hidden="true" className="text-[10px] text-amber-400" title="CubeSat 101 recommended">
                  ★
                </span>
              )}
            </span>
            <span className={`text-[11px] ${active ? 'text-cyan-300' : 'text-slate-400'}`}>
              {odd !== undefined ? percent(odd) : '…'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ScheduleAndReserveVisuals({ testMonths }: { testMonths: number }) {
  const { budgets, previewBudgets } = useDesignPreview()
  const active = previewBudgets ?? budgets
  const scaleMax = Math.max(active.rideTurn + 1, active.readyTurn + 1, 8)
  const pct = (m: number) => `${(m / scaleMax) * 100}%`
  const ridePct = Math.min(100, (active.rideTurn / scaleMax) * 100)
  const cap = Math.max(active.budgetCap, 1)
  const planPct = Math.min(100, (active.totalCost / cap) * 100)
  const reservePct = Math.min(100 - planPct, (active.reserveAmount / cap) * 100)
  const overBudget = active.totalCost > active.spendable

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Pre-Launch Schedule Timeline Bar */}
      <div className="hud-panel p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-slate-400">
            Pre-Launch Schedule (Month 0–{active.rideTurn})
          </h2>
          <span
            className={`rounded px-2 py-0.5 font-mono text-[11px] tabular-nums ${
              active.timeMarginTurns >= 0
                ? 'bg-emerald-950/70 text-emerald-300'
                : 'bg-red-950/70 text-red-300'
            }`}
          >
            {active.timeMarginTurns >= 0
              ? `+${active.timeMarginTurns} mo margin`
              : `${active.timeMarginTurns} mo late`}
          </span>
        </div>

        <div className="relative mt-3 h-7 overflow-hidden rounded border border-slate-700/70 bg-slate-950">
          <div className="flex h-full">
            <div
              style={{ width: pct(1) }}
              className="flex items-center justify-center border-r border-slate-950 bg-sky-600/80 font-mono text-[10px] font-semibold text-white"
              title="Design: 1 month"
            >
              D
            </div>
            <div
              style={{ width: pct(active.buildTurns) }}
              className="flex items-center justify-center border-r border-slate-950 bg-indigo-500/85 font-mono text-[10px] font-semibold text-white"
              title={`Build: ${active.buildTurns} months`}
            >
              Build {active.buildTurns}m
            </div>
            {testMonths > 0 && (
              <div
                style={{ width: pct(testMonths) }}
                className="flex items-center justify-center border-r border-slate-950 bg-cyan-500/85 font-mono text-[10px] font-semibold text-slate-950"
                title={`Test: ${testMonths} months`}
              >
                T{testMonths}
              </div>
            )}
            <div
              style={{ width: pct(1) }}
              className="flex items-center justify-center border-r border-slate-950 bg-emerald-500/85 font-mono text-[10px] font-semibold text-slate-950"
              title="Launch pad fitting: 1 month"
            >
              Fit
            </div>
          </div>
          <div className="hud-bar-segments pointer-events-none absolute inset-0" />
          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-orange-400 shadow-[0_0_8px_#fb923c]"
            style={{ left: `${ridePct}%` }}
            title={`Ride departs Month ${active.rideTurn}`}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] tabular-nums text-slate-400">
          <span>Ready: M{active.readyTurn}</span>
          <span className="text-orange-300">Ride departs: M{active.rideTurn}</span>
        </div>
      </div>

      {/* Budget Allocation Tank */}
      <div className="hud-panel p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-slate-400">
            Budget Allocation Tank
          </h2>
          <span
            className={`rounded px-2 py-0.5 font-mono text-[11px] tabular-nums ${
              overBudget ? 'bg-red-950/70 text-red-300' : 'bg-sky-950/70 text-cyan-300'
            }`}
          >
            ${(active.spendable - active.totalCost).toFixed(1)}M free
          </span>
        </div>

        <div className="relative mt-3 h-7 overflow-hidden rounded border border-slate-700/70 bg-slate-950">
          <div className="flex h-full">
            <div
              style={{ width: `${planPct}%` }}
              className={`flex items-center justify-center font-mono text-[10px] font-semibold transition-all ${
                overBudget ? 'bg-red-500/85 text-white' : 'bg-sky-500/85 text-slate-950'
              }`}
            >
              Plan ${active.totalCost.toFixed(1)}M
            </div>
            {reservePct > 0 && (
              <div
                style={{ width: `${reservePct}%` }}
                className="flex items-center justify-center border-l border-slate-950 bg-amber-400/85 font-mono text-[10px] font-semibold text-slate-950 transition-all"
              >
                Res ${active.reserveAmount.toFixed(1)}M
              </div>
            )}
          </div>
          <div className="hud-bar-segments pointer-events-none absolute inset-0" />
        </div>
        <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] tabular-nums text-slate-400">
          <span>Spendable: ${active.spendable.toFixed(1)}M</span>
          <span>Cap: ${active.budgetCap}M</span>
        </div>
      </div>
    </div>
  )
}

/**
 * The plain planning controls. Always rendered: visible when there is no 3D
 * room, and kept for keyboard and screen-reader users (visually hidden) when there is.
 */
function PlanningControls({ hidden, onFocus }: { hidden: boolean; onFocus: (f: ControlFocus) => void }) {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const getBudgets = useGameStore((s) => s.getBudgets)
  const difficulty = useGameStore((s) => s.difficulty)
  const setPreviewPatch = useUiStore((s) => s.setPreviewPatch)
  const budgets = getBudgets()
  const odds = usePlanningOdds(design, difficulty)
  const p = design.planning
  const set = (patch: Partial<typeof p>) => updateDesign({ planning: { ...p, ...patch } })

  useEffect(() => () => setPreviewPatch(null), [setPreviewPatch])

  return (
    <div className={hidden ? 'sr-only' : 'mx-auto max-w-3xl space-y-5'}>
      <header className="hud-step-header">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--role-accent)]">
          COMMS CENTER · LUNAR ICE MAPPER · PLANNING
        </div>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-50">1. Mission Planning</h1>
        <p className="mt-1.5 text-sm text-slate-300">
          Comms Center, mission control. Set how long to test and how much budget to hold back for surprises.
        </p>
      </header>

      <div className="hud-panel p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-slate-400">Build Time</h2>
          <span className="font-mono text-sm font-semibold tabular-nums text-cyan-300">
            {budgets.buildEffort} effort pts = {budgets.buildTurns} months
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-300">
          Set by what you build: {budgets.buildEffort} effort points = {budgets.buildTurns} months. Simpler parts build faster.
        </p>
      </div>

      <ScheduleAndReserveVisuals testMonths={p.testTurns} />

      <div className="hud-panel p-5">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <label htmlFor="planning-test" className="font-semibold text-slate-100">
            Test Time: <span className="font-mono tabular-nums text-cyan-300">{p.testTurns} months</span>
          </label>
          <span className="font-mono text-xs tabular-nums text-slate-400">0.4 M per test month</span>
        </div>
        <input
          id="planning-test"
          type="range"
          aria-label="Test time in months"
          min={turnConstants.minTestTurns}
          max={turnConstants.maxTestTurns}
          value={p.testTurns}
          onChange={(e) => set({ testTurns: Number(e.target.value) })}
          onFocus={() => onFocus('test')}
          onBlur={() => onFocus(null)}
          className="tactical-range"
        />
        {!hidden && (
          <div className="mt-3">
            <QuickPickTestButtons
              current={p.testTurns}
              oddsByValue={odds?.test}
              onPick={(v) => set({ testTurns: v })}
              onHover={(v) => setPreviewPatch(v === null ? null : { planning: { ...p, testTurns: v } })}
              onFocusField={onFocus}
            />
          </div>
        )}
        <OddsRow
          byValue={odds?.test}
          current={p.testTurns}
          label={(v) => `${v} test month${v === 1 ? '' : 's'}`}
        />
      </div>

      <div className="hud-panel p-5">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <label htmlFor="planning-reserve" className="font-semibold text-slate-100">
            Budget Reserve: <span className="font-mono tabular-nums text-cyan-300">{p.reservePercent}%</span>
          </label>
          <span className="font-mono text-xs tabular-nums text-slate-400">
            ${budgets.reserveAmount.toFixed(1)}M held
          </span>
        </div>
        <input
          id="planning-reserve"
          type="range"
          aria-label="Budget reserve in percent"
          min={0}
          max={20}
          step={5}
          value={p.reservePercent}
          onChange={(e) => set({ reservePercent: Number(e.target.value) })}
          onFocus={() => onFocus('reserve')}
          onBlur={() => onFocus(null)}
          list="planning-reserve-ticks"
          className="tactical-range"
        />
        <datalist id="planning-reserve-ticks">
          {[0, 5, 10, 15, 20].map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        {/* The CubeSat 101 advice, marked under its place on the slider (QC #57) */}
        <div className="relative mt-1 h-4 font-mono text-[11px] font-semibold text-amber-400" aria-hidden="true">
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${(turnConstants.recommendedReservePercent / 20) * 100}%` }}
          >
            ▲ {turnConstants.recommendedReservePercent}% recommended (CubeSat 101)
          </span>
        </div>
        {!hidden && (
          <div className="mt-2">
            <QuickPickReserveButtons
              current={p.reservePercent}
              oddsByValue={odds?.reserve}
              onPick={(v) => set({ reservePercent: v })}
              onHover={(v) => setPreviewPatch(v === null ? null : { planning: { ...p, reservePercent: v } })}
              onFocusField={onFocus}
            />
          </div>
        )}
        <div className="mt-2.5 font-mono text-xs tabular-nums text-slate-400">
          Recommended: {turnConstants.recommendedReservePercent}%. Reserve ${budgets.reserveAmount.toFixed(1)}M, spendable $
          {budgets.spendable.toFixed(1)}M, plan costs ${budgets.totalCost.toFixed(1)}M of the ${budgets.budgetCap}M cap.
        </div>
        <OddsRow byValue={odds?.reserve} current={p.reservePercent} label={(v) => `${v}% reserve`} />
      </div>

      {!hidden && <DesignDeltaLine />}

      <div
        className="hud-panel border-amber-400/35 bg-amber-950/30 p-4 font-mono text-xs tabular-nums text-amber-100"
        aria-live="polite"
      >
        Ready in month {budgets.readyTurn} (design 1 + build {budgets.buildTurns} + test {p.testTurns} + fitting 1). Ride leaves in month{' '}
        {budgets.rideTurn}.{' '}
        {budgets.timeMarginTurns >= 0 ? (
          <span className="font-semibold text-emerald-400">{budgets.timeMarginTurns} month(s) spare.</span>
        ) : (
          <span className="font-semibold text-red-400">Will miss the ride by {-budgets.timeMarginTurns} month(s)!</span>
        )}
      </div>
    </div>
  )
}

function PlanningQuickHudOverlay({ onFocus }: { onFocus: (f: ControlFocus) => void }) {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const difficulty = useGameStore((s) => s.difficulty)
  const setPreviewPatch = useUiStore((s) => s.setPreviewPatch)
  const odds = usePlanningOdds(design, difficulty)
  const p = design.planning
  const set = (patch: Partial<typeof p>) => updateDesign({ planning: { ...p, ...patch } })

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col items-center gap-2">
      <DesignDeltaLine className="pointer-events-auto max-w-3xl" />
      <div className="hud-panel pointer-events-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-2.5 backdrop-blur">
        <div className="space-y-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
            Test Months · Win Odds
          </div>
          <QuickPickTestButtons
            compact
            current={p.testTurns}
            oddsByValue={odds?.test}
            onPick={(v) => set({ testTurns: v })}
            onHover={(v) => setPreviewPatch(v === null ? null : { planning: { ...p, testTurns: v } })}
            onFocusField={onFocus}
          />
        </div>
        <div className="space-y-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
            Budget Reserve · Win Odds
          </div>
          <QuickPickReserveButtons
            compact
            current={p.reservePercent}
            oddsByValue={odds?.reserve}
            onPick={(v) => set({ reservePercent: v })}
            onHover={(v) => setPreviewPatch(v === null ? null : { planning: { ...p, reservePercent: v } })}
            onFocusField={onFocus}
          />
        </div>
      </div>
    </div>
  )
}

function StepButtons({ overlay }: { overlay: boolean }) {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const back = (
    <button
      type="button"
      onClick={() => setDesignStep('brief')}
      className="tactical-btn-back"
    >
      ← Back
    </button>
  )
  const next = (
    <button
      type="button"
      onClick={() => setDesignStep('instruments')}
      className="tactical-btn-next"
    >
      Select Instruments →
    </button>
  )
  if (overlay)
    return (
      <>
        <div className="absolute top-3 left-3">{back}</div>
        <div className="pointer-events-none absolute top-3 left-1/2 hidden -translate-x-1/2 md:block">
          <div className="hud-panel px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--role-accent)]">
            COMMS CENTER · LUNAR ICE MAPPER · PLANNING
          </div>
        </div>
        <div className="absolute top-3 right-3">{next}</div>
      </>
    )
  return (
    <div className="mx-auto mt-6 flex max-w-3xl justify-between">
      {back}
      {next}
    </div>
  )
}

export function PlanningScreen() {
  // The 3D room starts only in a browser with WebGL; server rendering and tests take the plain path
  const [room, setRoom] = useState(canUseWebGL)
  const [focus, setFocus] = useState<ControlFocus>(null)

  if (!room)
    return (
      <div className="h-full overflow-auto p-4">
        <PlanningControls hidden={false} onFocus={() => {}} />
        <StepButtons overlay={false} />
      </div>
    )

  return (
    <div className="relative h-full min-h-[480px] w-full overflow-hidden bg-[#03050a]">
      <RoomBoundary onError={() => setRoom(false)}>
        <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">Opening mission control…</div>}>
          <ControlRoom focus={focus} />
        </Suspense>
      </RoomBoundary>
      <PlanningControls hidden onFocus={setFocus} />
      <PlanningQuickHudOverlay onFocus={setFocus} />
      <StepButtons overlay />
    </div>
  )
}
