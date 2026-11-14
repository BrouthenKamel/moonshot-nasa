import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { turnConstants } from '../../data/brief'
import { percent } from '../../sim/odds'
import { usePlanningOdds } from '../useOdds'
import { canUseWebGL } from '../../scene/webgl'
import type { ControlFocus } from '../../scene/ControlRoom'

const ControlRoom = lazy(() => import('../../scene/ControlRoom').then((m) => ({ default: m.ControlRoom })))

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
    return <div className="mt-2 text-xs text-slate-500">Working out the chance of full success…</div>
  const others = Object.keys(byValue)
    .map(Number)
    .filter((v) => v !== current)
    .sort((a, b) => a - b)
  return (
    <div className="mt-2 text-sm text-slate-300" aria-live="polite">
      <div className="font-medium text-slate-100">{`Chance of full success: about ${percent(byValue[current])}`}</div>
      <div className="text-xs text-slate-400">
        {others.map((v) => `${label(v)}: about ${percent(byValue[v])}`).join(' · ')}
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
  const budgets = getBudgets()
  const odds = usePlanningOdds(design, difficulty)
  const p = design.planning
  const set = (patch: Partial<typeof p>) => updateDesign({ planning: { ...p, ...patch } })

  return (
    <div className={hidden ? 'sr-only' : 'mx-auto max-w-3xl space-y-6'}>
      <div className="rounded-lg bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-blue-400">1. Mission Planning</h1>
        <p className="mt-2 text-slate-400">
          Comms Center, mission control. Set how long to test and how much budget to hold back for surprises.
        </p>
      </div>

      <div className="rounded-lg bg-slate-900 p-6">
        <h2 className="mb-2 font-semibold text-slate-200">Build Time</h2>
        <p className="text-sm text-slate-400">
          Set by what you build: {budgets.buildEffort} effort points = {budgets.buildTurns} months. Simpler parts build faster.
        </p>
      </div>

      <div className="rounded-lg bg-slate-900 p-6">
        <label htmlFor="planning-test" className="mb-2 block font-semibold text-slate-200">
          Test Time: {p.testTurns} months
        </label>
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
          className="w-full"
        />
        <div className="mt-2 text-xs text-slate-500">0.4 M per test month</div>
        <OddsRow
          byValue={odds?.test}
          current={p.testTurns}
          label={(v) => `${v} test month${v === 1 ? '' : 's'}`}
        />
      </div>

      <div className="rounded-lg bg-slate-900 p-6">
        <label htmlFor="planning-reserve" className="mb-2 block font-semibold text-slate-200">
          Budget Reserve: {p.reservePercent}%
        </label>
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
          className="w-full"
        />
        <datalist id="planning-reserve-ticks">
          {[0, 5, 10, 15, 20].map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        {/* The CubeSat 101 advice, marked under its place on the slider (QC #57) */}
        <div className="relative h-4 text-[11px] font-semibold text-amber-400" aria-hidden="true">
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${(turnConstants.recommendedReservePercent / 20) * 100}%` }}
          >
            ▲ {turnConstants.recommendedReservePercent}% recommended (CubeSat 101)
          </span>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          Recommended: {turnConstants.recommendedReservePercent}%. Reserve ${budgets.reserveAmount.toFixed(1)}M, spendable $
          {budgets.spendable.toFixed(1)}M, plan costs ${budgets.totalCost.toFixed(1)}M of the ${budgets.budgetCap}M cap.
        </div>
        <OddsRow byValue={odds?.reserve} current={p.reservePercent} label={(v) => `${v}% reserve`} />
      </div>

      <div className="rounded-lg bg-yellow-950 p-4 text-sm text-yellow-200" aria-live="polite">
        Ready in month {budgets.readyTurn} (design 1 + build {budgets.buildTurns} + test {p.testTurns} + fitting 1). Ride leaves in month{' '}
        {budgets.rideTurn}.{' '}
        {budgets.timeMarginTurns >= 0 ? (
          <span className="text-green-400">{budgets.timeMarginTurns} month(s) spare.</span>
        ) : (
          <span className="text-red-400">Will miss the ride by {-budgets.timeMarginTurns} month(s)!</span>
        )}
      </div>
    </div>
  )
}

function StepButtons({ overlay }: { overlay: boolean }) {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const back = (
    <button
      onClick={() => setDesignStep('brief')}
      className="rounded-lg bg-slate-700/90 px-6 py-2 font-medium text-slate-200 backdrop-blur hover:bg-slate-600"
    >
      ← Back
    </button>
  )
  const next = (
    <button
      onClick={() => setDesignStep('instruments')}
      className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white shadow-lg shadow-blue-900/50 hover:bg-blue-500"
    >
      Select Instruments →
    </button>
  )
  if (overlay)
    return (
      <>
        <div className="absolute top-3 left-3">{back}</div>
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
      <StepButtons overlay />
    </div>
  )
}
