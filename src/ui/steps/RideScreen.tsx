import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'
import { canUseWebGL } from '../../scene/webgl'
import { LOW_ENERGY_DAYS, timedTransferDays, timedTransferId } from '../../data/transfers'
import { getRideById } from '../../data/rides'
import { choiceArt } from '../../assets/catalogueArt'
import { assetUrl } from '../../assets/url'
import { chooseRide, useRideView } from '../../viz/ride/useRideView'
import type { BoardRow } from '../../viz/ride/rideView'
import {
  TRANSFER_MAX_DAYS,
  TRANSFER_MIN_DAYS,
  daysAt,
  designDays,
  minDaysFor,
  positionOfDays,
  transferBlocker,
  transferPlan,
  type TransferPlan,
} from '../../viz/ride/transferPlan'
import { Details } from '../kit'
import { STEP_NAMES, nextLabel, stepTitle } from '../kit/stepNumbers'
import { CAPTURE_LABEL } from '../../viz/numbers'
import {
  PANEL_PX,
  SLIDER_PX,
  PlanChecks,
  PlanHeadline,
  PlanNav,
  PlanNote,
  PlanOdds,
  PlanPanel,
  PlanRow,
  PlanRows,
  PlanVSlider,
  type Tone,
} from './plan/PlanPanel'

const LaunchPad = lazy(() => import('../../scene/launch/LaunchPad').then((m) => ({ default: m.LaunchPad })))
const TransferPlannerScene = lazy(() =>
  import('../../scene/transferPlanner/TransferPlannerScene').then((m) => ({ default: m.TransferPlannerScene }))
)

/*
 * Step 06 · Ride & transfer, in two views:
 * 1. Launch: the rocket from the pad to the drop-off, the real Moon in the sky; the rides on the left.
 * 2. Transfer: from the drop-off to the Moon in space. A tall slider on the right sets the path,
 *    from a quick direct shot to a long low-energy loop; one dashboard on the right says when it
 *    leaves, how long it flies and what fuel it needs. Every number is the logic core's.
 */

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
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

const KIND_LINE: Record<TransferPlan['kind'], string> = {
  direct: 'A direct shot: there in days, then one big braking burn.',
  phasing: 'A few loops round Earth first: a smaller burn, more months on the way.',
  'low-energy': 'A long loop out past the Moon: the Sun does most of the braking.',
}

const months = (n: number) => `${n} month${n === 1 ? '' : 's'}`

/** The two real ways to the Moon, as ticks on the slider; a click snaps to the day count named */
const TRANSFER_MARKS = [
  { at: positionOfDays(TRANSFER_MIN_DAYS), label: 'Direct, 4–5 days (needs a chemical engine)' },
  { at: positionOfDays(LOW_ENERGY_DAYS), label: 'Low-energy, 90+ days (CAPSTONE took about 4 months)' },
]

/**
 * Arrow keys on the flight-time slider: a log scale moves less than a day per 1% below about 30 days, so there
 * the arrows step exactly one day and the keyboard reaches the same shortest flight as dragging does.
 */
const FINE_BELOW_DAYS = 30
function daysKeyStep(value: number, dir: 1 | -1): number | null {
  const d = daysAt(value)
  if (dir > 0 ? d >= FINE_BELOW_DAYS : d <= FINE_BELOW_DAYS) return null
  return positionOfDays(d + dir)
}

/** Room the slider and the dashboard take on the right, with their margins */
const RIGHT_PX = PANEL_PX + SLIDER_PX + 40

/* ------------------------------------------------------------------ */
/* Transfer                                                            */
/* ------------------------------------------------------------------ */

function TransferDashboard({ plan, onBack }: { plan: TransferPlan; onBack: () => void }) {
  const fuelTone: Tone = plan.capture === null || plan.capture > plan.tank ? 'red' : plan.capture > plan.tank * 0.85 ? 'yellow' : 'green'
  const holdTone: Tone = plan.monthsHeld >= 12 ? 'green' : plan.monthsHeld >= 6 ? 'yellow' : 'red'
  return (
    <PlanPanel>
      <PlanHeadline kicker={`${STEP_NAMES.ride}: the transfer to the Moon`} value={plan.tripHeadline.value} unit={plan.tripHeadline.unit} line={KIND_LINE[plan.kind]} />
      {plan.ionEngine &&
        (plan.days < plan.minDays ? (
          <PlanNote tone="red">An ion engine cannot brake from a fast arrival: it needs {plan.minDays} days or more.</PlanNote>
        ) : (
          <PlanNote tone="yellow">An ion engine can only brake from a slow arrival: {plan.minDays} days or more.</PlanNote>
        ))}
      <PlanRows>
        <PlanRow label="Leaves Earth" value={`Month ${plan.departureMonth}`} sub={`in ${months(plan.departureMonth)}`} />
        <PlanRow
          label="Reaches the Moon"
          value={plan.cruiseMonths === null ? 'never' : `Month ${plan.cruiseMonths === 0 ? plan.departureMonth : plan.arrivalMonth}`}
          tone={plan.cruiseMonths === null ? 'red' : undefined}
          sub={plan.cruiseMonths === null ? 'cannot capture' : `${plan.trip} on the way`}
        />
        <PlanRow
          className="col-span-2"
          label="Fuel left"
          value={plan.leftAfter === null ? '—' : `${Math.round(plan.leftAfter)} m/s`}
          tone={plan.leftAfter === null || plan.leftAfter < 0 ? 'red' : holdTone}
          sub={
            plan.capture === null
              ? 'never gets there'
              : plan.monthsHeld > 0
                ? `holds orbit ${plan.monthsHeld > 120 ? '10+ yrs' : months(plan.monthsHeld)}`
                : 'not enough'
          }
        />
      </PlanRows>
      {/* The rest of the figures wait behind the shared Details control (screen budget: three numbers) */}
      <Details id="transfer" label="Details: arrival, braking, ride">
        <PlanRows>
          <PlanRow label="Arrives at" value={`${plan.arrivalKms.toFixed(2)} km/s`} sub="over escape speed" />
          <PlanRow
            label={CAPTURE_LABEL}
            value={plan.capture === null ? 'cannot' : `${Math.round(plan.capture)} m/s`}
            tone={fuelTone}
            sub={`tank ${Math.round(plan.tank)} m/s`}
          />
          <PlanRow label="Ride" value={plan.rideName} />
        </PlanRows>
      </Details>
      <PlanChecks checks={plan.checks} />
      <PlanOdds />
      <PlanNav back={{ label: '← Back', to: onBack }} next={{ label: nextLabel('ride'), to: 'comms', blockedBy: transferBlocker(plan) ?? undefined }} />
    </PlanPanel>
  )
}

function useTransferControl() {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)

  // The view offers one adjustable path: a named transfer from before becomes the same flight time
  useEffect(() => {
    const d = useGameStore.getState().design
    if (timedTransferDays(d.transfer) !== null) return
    updateDesign({ transfer: timedTransferId(Math.max(minDaysFor(d), designDays(d))) })
  }, [updateDesign])

  // The whole range is open to every craft: a path this engine cannot fly shows as such in the
  // dashboard and the Go / No-Go, instead of the slider refusing to move
  const setDays = (t: number) => {
    const id = timedTransferId(daysAt(Math.min(1, Math.max(0, t))))
    if (id !== useGameStore.getState().design.transfer) updateDesign({ transfer: id })
  }
  // The position always comes from the design, so a change made elsewhere never desyncs the slider
  return { pos: positionOfDays(designDays(design)), setDays }
}

function TransferView({ onBack, webgl, onSceneError }: { onBack: () => void; webgl: boolean; onSceneError: () => void }) {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const plan = transferPlan(design, difficulty)
  const { pos, setDays } = useTransferControl()
  const slider = (
    <PlanVSlider
      label="Flight time to the Moon"
      value={pos}
      onChange={setDays}
      valueText={`${plan.days} days`}
      topText={`${TRANSFER_MAX_DAYS} days`}
      bottomText={`${TRANSFER_MIN_DAYS} days`}
      marks={TRANSFER_MARKS}
      keyStep={daysKeyStep}
    />
  )
  const dashboard = <TransferDashboard plan={plan} onBack={onBack} />
  if (!webgl)
    return (
      <div className="flex justify-center gap-3">
        {slider}
        {dashboard}
      </div>
    )
  return (
    <div className="relative h-full min-h-[480px] w-full overflow-hidden bg-black">
      <SceneBoundary onError={onSceneError}>
        <Suspense fallback={<div className="flex h-full items-center justify-center text-paper-faint">Plotting the way to the Moon…</div>}>
          <TransferPlannerScene days={plan.days} rightPx={RIGHT_PX} />
        </Suspense>
      </SceneBoundary>
      <div className="pointer-events-none absolute inset-y-4 right-4 flex gap-3">
        {slider}
        {dashboard}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Launch                                                              */
/* ------------------------------------------------------------------ */

const STATUS_TONE: Record<BoardRow['status'], string> = {
  onTime: 'text-go border-go/50',
  tooEarly: 'text-nogo border-nogo/50',
  tooHeavy: 'text-nogo border-nogo/50',
  wrongEngine: 'text-nogo border-nogo/50',
  cantReach: 'text-nogo border-nogo/50',
  overBudget: 'text-nogo border-nogo/50',
}

/** One ride as a compact card: picture, name, when it leaves and arrives, and whether it works */
function RideOption({ row }: { row: BoardRow }) {
  const ride = getRideById(row.id)
  const art = choiceArt(row.id)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={row.selected}
      onClick={() => chooseRide(row.id)}
      className={`flex w-full gap-2.5 rounded-lg border p-2 text-left transition ${
        row.selected ? 'border-kapton bg-kapton/10' : 'border-rule bg-ink-2/90 hover:border-rule-strong'
      }`}
    >
      {art?.card && <img src={assetUrl(art.card)} alt="" className="h-[68px] w-[92px] shrink-0 rounded object-cover" />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-2 font-display text-sm font-bold leading-tight text-paper">{ride?.name ?? row.name}</span>
        <span className="truncate text-[0.68rem] text-paper-faint">
          {row.dropWords} · {row.limitKg} kg max
        </span>
        <span className="fp-data mt-0.5 text-[0.72rem] text-paper-dim">
          Leaves M{row.turn} · arrives {row.arrivalTurn === null ? <span className="text-nogo">never</span> : `M${row.arrivalTurn}`}
        </span>
        <span className={`mt-1 self-start border px-1.5 text-[0.6rem] font-semibold uppercase tracking-wider ${STATUS_TONE[row.status]}`}>
          {row.statusLabel}
        </span>
      </span>
    </button>
  )
}

function RideList({ onNext }: { onNext: () => void }) {
  const view = useRideView()
  return (
    <div className="hud-panel pointer-events-auto flex w-[320px] flex-col gap-2 rounded-xl p-3">
      <div className="fp-label text-[0.66rem] tracking-[0.16em] text-kapton">{stepTitle('ride')}</div>
      <div className="text-[0.76rem] text-paper-dim">Pick a launch that drops the craft on its way.</div>
      <div role="radiogroup" aria-label="Rideshare launch" className="flex flex-col gap-2">
        {view.rows.map((r) => (
          <RideOption key={r.id} row={r} />
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onNext} className="tactical-btn-next flex-[2]">
          Next: Transfer →
        </button>
      </div>
    </div>
  )
}

function LaunchView({ onNext, webgl, onSceneError }: { onNext: () => void; webgl: boolean; onSceneError: () => void }) {
  if (!webgl) return <RideList onNext={onNext} />
  return (
    <div className="relative h-full min-h-[480px] w-full overflow-hidden bg-ink-0">
      <SceneBoundary onError={onSceneError}>
        <Suspense fallback={<div className="flex h-full items-center justify-center text-paper-faint">Opening the launch site…</div>}>
          <LaunchPad focus={null} clean />
        </Suspense>
      </SceneBoundary>
      <div className="pointer-events-none absolute inset-y-4 left-4 flex items-center">
        <RideList onNext={onNext} />
      </div>
    </div>
  )
}

export function RideScreen() {
  // Which view shows is the top bar's: its Ride and Transfer stages both open this step
  const view = useUiStore((s) => s.rideView)
  const setView = useUiStore((s) => s.setRideView)
  // The 3D views start only in a browser with WebGL; server rendering and tests take the plain path
  const [webgl, setWebgl] = useState(canUseWebGL)

  if (!webgl)
    return (
      <div className="h-full overflow-auto p-4">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6">
          <LaunchView onNext={() => setView('transfer')} webgl={false} onSceneError={() => setWebgl(false)} />
          <TransferView onBack={() => setView('launch')} webgl={false} onSceneError={() => setWebgl(false)} />
        </div>
      </div>
    )

  return view === 'launch' ? (
    <LaunchView onNext={() => setView('transfer')} webgl onSceneError={() => setWebgl(false)} />
  ) : (
    <TransferView onBack={() => setView('launch')} webgl onSceneError={() => setWebgl(false)} />
  )
}
