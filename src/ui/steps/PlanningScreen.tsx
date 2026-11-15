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
import { Btn, Eng, LineItem, Sheet, STEP_QUESTION, StepHeader, stepNumber } from '../kit'

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
 * F2 (Jakob, 14 Nov): what a control really does to the chance of full success.
 * Story view: the one line for the current setting. Engineer view: every other setting too.
 */
function OddsRow({ byValue, current, label }: { byValue?: Record<number, number>; current: number; label: (v: number) => string }) {
  if (!byValue || byValue[current] === undefined)
    return <div className="mt-2 fp-data text-xs text-paper-faint">Working out the chance of full success…</div>
  const others = Object.keys(byValue)
    .map(Number)
    .filter((v) => v !== current)
    .sort((a, b) => a - b)
  return (
    <div className="mt-2.5 text-sm" aria-live="polite">
      <div className="fp-data text-sm font-medium text-paper">{`Chance of full success: about ${percent(byValue[current])}`}</div>
      <Eng as="div" className="mt-0.5 fp-data text-[11px] text-paper-faint">
        {others.map((v) => `${label(v)}: about ${percent(byValue[v])}`).join(' · ')}
      </Eng>
    </div>
  )
}

/** Flat segmented quick-picks: one row, the chosen segment in Kapton; win odds per option in Engineer view */
function Segmented({
  options,
  current,
  unit,
  recommended,
  oddsByValue,
  onPick,
  onHover,
  onFocusField,
  field,
  ariaLabel,
}: {
  options: number[]
  current: number
  unit: (v: number) => string
  recommended?: number
  oddsByValue?: Record<number, number>
  onPick: (v: number) => void
  onHover: (v: number | null) => void
  onFocusField?: (f: ControlFocus) => void
  field: 'test' | 'reserve'
  ariaLabel: string
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex w-fit border border-rule-strong" onMouseLeave={() => onHover(null)}>
      {options.map((v) => {
        const active = current === v
        const odd = oddsByValue?.[v]
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(v)}
            onMouseEnter={() => onHover(v)}
            onFocus={() => {
              onHover(v)
              onFocusField?.(field)
            }}
            onBlur={() => {
              onHover(null)
              onFocusField?.(null)
            }}
            className={`flex min-w-[3.25rem] flex-col items-center border-r border-rule px-2.5 py-1.5 last:border-r-0 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-kapton ${
              active ? 'bg-kapton text-kapton-ink' : 'text-paper-dim hover:bg-ink-3 hover:text-paper'
            }`}
          >
            <span className="fp-data text-xs font-semibold">
              {unit(v)}
              {v === recommended && (
                <span aria-hidden="true" title="CubeSat 101 recommended" className="ml-0.5">
                  ★
                </span>
              )}
            </span>
            <Eng className={`fp-data text-[10px] ${active ? 'text-kapton-ink' : 'text-paper-faint'}`}>
              {odd !== undefined ? percent(odd) : '…'}
            </Eng>
          </button>
        )
      })}
    </div>
  )
}

const N = stepNumber('planning')

/** The schedule and the money, as two ruled gauges: the shape tells the story, the figures are for engineers */
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
  const seg = 'flex items-center justify-center border-r border-ink-1 fp-data text-[10px] font-semibold'

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Sheet tone="flat" className="p-4">
        <LineItem
          n={`${N}.2`}
          label="Schedule"
          aside={
            <span className={active.timeMarginTurns >= 0 ? 'text-go' : 'text-nogo'}>
              {active.timeMarginTurns >= 0 ? 'Ready in time' : 'Misses the ride'}
              <Eng>{active.timeMarginTurns >= 0 ? ` · +${active.timeMarginTurns} mo margin` : ` · ${active.timeMarginTurns} mo late`}</Eng>
            </span>
          }
        />
        <div className="relative mt-3 h-7 overflow-hidden border border-rule bg-ink-1">
          <div className="flex h-full">
            <div style={{ width: pct(1) }} className={`${seg} bg-ink-3 text-paper-dim`} title="Design: 1 month">
              D
            </div>
            <div style={{ width: pct(active.buildTurns) }} className={`${seg} bg-rule-strong text-paper`} title={`Build: ${active.buildTurns} months`}>
              Build
            </div>
            {testMonths > 0 && (
              <div style={{ width: pct(testMonths) }} className={`${seg} bg-kapton-dim text-paper`} title={`Test: ${testMonths} months`}>
                Test
              </div>
            )}
            <div style={{ width: pct(1) }} className={`${seg} bg-ink-3 text-paper-dim`} title="Launch pad fitting: 1 month">
              Fit
            </div>
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-kapton"
            style={{ left: `${ridePct}%` }}
            title={`Ride departs Month ${active.rideTurn}`}
          />
        </div>
        <Eng as="div" className="mt-1.5 flex items-center justify-between fp-data text-[11px] text-paper-faint">
          <span>Ready: M{active.readyTurn}</span>
          <span className="text-kapton">Ride departs: M{active.rideTurn}</span>
        </Eng>
      </Sheet>

      <Sheet tone="flat" className="p-4">
        <LineItem
          n={`${N}.3`}
          label="Budget"
          aside={
            <span className={overBudget ? 'text-nogo' : 'text-go'}>
              {overBudget ? 'Over budget' : 'Within budget'}
              <Eng>{` · $${(active.spendable - active.totalCost).toFixed(1)}M free`}</Eng>
            </span>
          }
        />
        <div className="relative mt-3 h-7 overflow-hidden border border-rule bg-ink-1">
          <div className="flex h-full">
            <div
              style={{ width: `${planPct}%` }}
              className={`flex items-center justify-center fp-data text-[10px] font-semibold transition-all ${
                overBudget ? 'bg-nogo text-paper' : 'bg-rule-strong text-paper'
              }`}
            >
              Plan<Eng>{` $${active.totalCost.toFixed(1)}M`}</Eng>
            </div>
            {reservePct > 0 && (
              <div
                style={{ width: `${reservePct}%` }}
                className="flex items-center justify-center border-l border-ink-1 bg-kapton fp-data text-[10px] font-semibold text-kapton-ink transition-all"
              >
                Reserve<Eng>{` $${active.reserveAmount.toFixed(1)}M`}</Eng>
              </div>
            )}
          </div>
        </div>
        <Eng as="div" className="mt-1.5 flex items-center justify-between fp-data text-[11px] text-paper-faint">
          <span>Spendable: ${active.spendable.toFixed(1)}M</span>
          <span>Cap: ${active.budgetCap}M</span>
        </Eng>
      </Sheet>
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
    <div className={hidden ? 'sr-only' : 'mx-auto max-w-3xl space-y-4'}>
      <StepHeader step="planning" kicker="Comms Center · Lunar Ice Mapper" title="Mission planning" />

      <Eng as="div" className="block">
        <Sheet tone="flat" className="p-4">
          <LineItem n={`${N}.1`} label="Build time" aside={`${budgets.buildEffort} effort pts = ${budgets.buildTurns} months`} />
          <p className="mt-2 text-sm text-paper-dim">
            Set by what you build: {budgets.buildEffort} effort points = {budgets.buildTurns} months. Simpler parts build faster.
          </p>
        </Sheet>
      </Eng>

      <ScheduleAndReserveVisuals testMonths={p.testTurns} />

      <Sheet className="p-5">
        <LineItem n={`${N}.4`} label={<label htmlFor="planning-test">Test time</label>} aside={<Eng>0.4 M per test month</Eng>} />
        <p className="mt-2 text-sm text-paper-dim">Testing finds faults on the ground, where they are cheap to fix. It costs time before the ride.</p>
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
          className={hidden ? 'tactical-range' : 'tactical-range sr-only'}
        />
        {!hidden && (
          <div className="mt-3">
            <Segmented
              field="test"
              ariaLabel="Test months"
              options={TEST_MONTH_OPTIONS}
              unit={(v) => `${v} mo`}
              current={p.testTurns}
              oddsByValue={odds?.test}
              onPick={(v) => set({ testTurns: v })}
              onHover={(v) => setPreviewPatch(v === null ? null : { planning: { ...p, testTurns: v } })}
              onFocusField={onFocus}
            />
          </div>
        )}
        <OddsRow byValue={odds?.test} current={p.testTurns} label={(v) => `${v} test month${v === 1 ? '' : 's'}`} />
      </Sheet>

      <Sheet className="p-5">
        <LineItem
          n={`${N}.5`}
          label={<label htmlFor="planning-reserve">Budget reserve</label>}
          aside={<Eng>${budgets.reserveAmount.toFixed(1)}M held</Eng>}
        />
        <p className="mt-2 text-sm text-paper-dim">
          Money held back for surprises. CubeSat 101 recommends {turnConstants.recommendedReservePercent}% (★).
        </p>
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
          className={hidden ? 'tactical-range' : 'tactical-range sr-only'}
        />
        {!hidden && (
          <div className="mt-3">
            <Segmented
              field="reserve"
              ariaLabel="Budget reserve"
              options={RESERVE_OPTIONS}
              unit={(v) => `${v}%`}
              recommended={turnConstants.recommendedReservePercent}
              current={p.reservePercent}
              oddsByValue={odds?.reserve}
              onPick={(v) => set({ reservePercent: v })}
              onHover={(v) => setPreviewPatch(v === null ? null : { planning: { ...p, reservePercent: v } })}
              onFocusField={onFocus}
            />
          </div>
        )}
        <Eng as="div" className="mt-2.5 fp-data text-xs text-paper-faint">
          Recommended: {turnConstants.recommendedReservePercent}%. Reserve ${budgets.reserveAmount.toFixed(1)}M, spendable $
          {budgets.spendable.toFixed(1)}M, plan costs ${budgets.totalCost.toFixed(1)}M of the ${budgets.budgetCap}M cap.
        </Eng>
        <OddsRow byValue={odds?.reserve} current={p.reservePercent} label={(v) => `${v}% reserve`} />
      </Sheet>

      {!hidden && <DesignDeltaLine />}

      <div className="border-l-2 border-kapton pl-3 text-sm text-paper" aria-live="polite">
        {budgets.timeMarginTurns >= 0 ? (
          <span className="font-semibold text-go">Ready before the ride leaves.</span>
        ) : (
          <span className="font-semibold text-nogo">Will miss the ride by {-budgets.timeMarginTurns} month(s)!</span>
        )}{' '}
        <Eng className="fp-data text-xs text-paper-dim">
          Ready in month {budgets.readyTurn} (design 1 + build {budgets.buildTurns} + test {p.testTurns} + fitting 1). Ride leaves in month{' '}
          {budgets.rideTurn}. {budgets.timeMarginTurns >= 0 ? `${budgets.timeMarginTurns} month(s) spare.` : ''}
        </Eng>
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
  const chance = odds?.test?.[p.testTurns]

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col items-center gap-2">
      <DesignDeltaLine className="pointer-events-auto max-w-3xl" />
      <Sheet className="pointer-events-auto flex w-full max-w-4xl flex-wrap items-end justify-between gap-4 px-4 py-3">
        <div className="space-y-1.5">
          <div className="fp-label text-[10px] text-paper-faint">{N}.4 Test months</div>
          <Segmented
            field="test"
            ariaLabel="Test months"
            options={TEST_MONTH_OPTIONS}
            unit={(v) => `${v} mo`}
            current={p.testTurns}
            oddsByValue={odds?.test}
            onPick={(v) => set({ testTurns: v })}
            onHover={(v) => setPreviewPatch(v === null ? null : { planning: { ...p, testTurns: v } })}
            onFocusField={onFocus}
          />
        </div>
        <div className="space-y-1.5">
          <div className="fp-label text-[10px] text-paper-faint">{N}.5 Budget reserve</div>
          <Segmented
            field="reserve"
            ariaLabel="Budget reserve"
            options={RESERVE_OPTIONS}
            unit={(v) => `${v}%`}
            recommended={turnConstants.recommendedReservePercent}
            current={p.reservePercent}
            oddsByValue={odds?.reserve}
            onPick={(v) => set({ reservePercent: v })}
            onHover={(v) => setPreviewPatch(v === null ? null : { planning: { ...p, reservePercent: v } })}
            onFocusField={onFocus}
          />
        </div>
        {chance !== undefined && (
          <div aria-hidden="true" className="fp-data text-sm text-paper">
            {`Chance of full success: about ${percent(chance)}`}
          </div>
        )}
      </Sheet>
    </div>
  )
}

function StepButtons({ overlay }: { overlay: boolean }) {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const back = (
    <Btn type="button" onClick={() => setDesignStep('brief')}>
      ← Back
    </Btn>
  )
  const next = (
    <Btn variant="primary" type="button" onClick={() => setDesignStep('instruments')}>
      Select instruments →
    </Btn>
  )
  if (overlay)
    return (
      <>
        <div className="absolute top-3 left-3">{back}</div>
        <div className="pointer-events-none absolute top-3 left-1/2 hidden -translate-x-1/2 md:block">
          <Sheet tone="inset" className="px-4 py-2 text-center">
            <div className="flex items-baseline justify-center gap-2">
              <span className="fp-data text-xs text-paper-faint">{String(N).padStart(2, '0')}</span>
              <span className="fp-display text-base text-paper">Mission planning</span>
            </div>
            <div className="text-xs text-paper-dim">{STEP_QUESTION.planning}</div>
          </Sheet>
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
    <div className="relative h-full min-h-[480px] w-full overflow-hidden bg-ink-0">
      <RoomBoundary onError={() => setRoom(false)}>
        <Suspense fallback={<div className="flex h-full items-center justify-center text-paper-faint">Opening mission control…</div>}>
          <ControlRoom focus={focus} />
        </Suspense>
      </RoomBoundary>
      <PlanningControls hidden onFocus={setFocus} />
      <PlanningQuickHudOverlay onFocus={setFocus} />
      <StepButtons overlay />
    </div>
  )
}
