import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { getOrbitById, polarOrbitId, polarOrbitKm } from '../../data/orbits'
import { canUseWebGL } from '../../scene/webgl'
import { Details } from '../kit'
import { COVERAGE_TARGET } from '../../sim/evaluate'
import { ORBIT_MAX_KM, ORBIT_MIN_KM, kmAt, orbitPlan, positionOf, type OrbitPlan } from '../../viz/orbit/orbitPlan'
import {
  PANEL_PX,
  SLIDER_PX,
  PlanChecks,
  PlanHeadline,
  PlanMeter,
  PlanNav,
  PlanNote,
  PlanOdds,
  PlanPanel,
  PlanRow,
  PlanRows,
  PlanVSlider,
  type Tone,
} from './plan/PlanPanel'

const OrbitPlannerScene = lazy(() =>
  import('../../scene/orbitPlanner/OrbitPlannerScene').then((m) => ({ default: m.OrbitPlannerScene }))
)

/*
 * Step 05 · Orbit: a tall slider on the right sets the orbit's height; one dashboard beside it
 * says what that height means. The height is the low point over the south pole, where the ice is;
 * the far side stays at 3,150 km (LunaH-Map's plan) until the orbit becomes a circle. Every number
 * is the logic core's.
 */

const GOAL = COVERAGE_TARGET // % of the ice map the brief asks for: the sim's one target
/**
 * Real missions' orbits on the slider (its height is the low point over the south pole); a click snaps to one.
 * - Lunar Prospector: 100 km circular polar mapping orbit, 1998-99 (NASA NSSDCA 1998-001A).
 * - LunaH-Map: planned elliptical polar orbit, 15 km low point over the south pole, 3,150 km far
 *   point (ASU / NASA mission plan; the same orbit as data/orbits.ts 'orbit-elliptical').
 * Lunar Flashlight's near-rectilinear halo orbit is not a low-point/far-point polar orbit this slider
 * draws, so it has no tick.
 */
const MISSION_TICKS = [
  { at: positionOf(100), label: 'Lunar Prospector', title: 'Lunar Prospector, 1998-99: 100 km circular polar orbit' },
  { at: positionOf(15), label: 'LunaH-Map', title: 'LunaH-Map (planned): 15 x 3,150 km elliptical polar orbit' },
]

/** Room on the right the slider and the dashboard take, with their margins */
const RIGHT_PX = PANEL_PX + SLIDER_PX + 40

const fmtKm = (km: number) => km.toLocaleString('en-US')

function hours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`
  return `${h < 10 ? h.toFixed(1) : Math.round(h)} h`
}

function heightLine(p: OrbitPlan): string {
  if (p.atFloor) return 'Lowest safe height: any lower and the craft hits the crater rims.'
  if (p.atCeiling) return "Highest it can go: any higher and Earth's pull breaks the orbit."
  return p.circular ? `A circle ${fmtKm(p.km)} km up.` : `Far side ${fmtKm(p.farKm)} km up, over the north pole.`
}

function iceNote(p: OrbitPlan): { text: string; tone: Tone } {
  if (p.iceLimitKm === null) return { text: 'No ice instrument on board: no height lets it see the ice.', tone: 'yellow' }
  return p.km <= p.iceLimitKm
    ? { text: `Low enough for the ice instruments: full signal below ${p.iceLimitKm} km.`, tone: 'green' }
    : p.iceMapped > 0
      ? { text: `Above ${p.iceLimitKm} km the ice signal fades: the higher, the less ice mapped.`, tone: 'yellow' }
      : { text: `Too high: the ice signal is lost this far above ${p.iceLimitKm} km.`, tone: 'red' }
}

function OrbitDashboard({ plan }: { plan: OrbitPlan }) {
  const ice = iceNote(plan)
  const iceTone: Tone = plan.iceMapped >= GOAL ? 'green' : plan.iceMapped >= GOAL / 2 ? 'yellow' : 'red'
  const fuelTone: Tone = plan.capture === null || plan.capture > plan.tank ? 'red' : plan.capture > plan.tank * 0.85 ? 'yellow' : 'green'
  const holdTone: Tone = plan.monthsHeld >= 12 ? 'green' : plan.monthsHeld >= 6 ? 'yellow' : 'red'
  return (
    <PlanPanel>
      <PlanHeadline kicker="Orbit · height over the south pole" value={fmtKm(plan.km)} unit="km" line={heightLine(plan)} />
      <PlanNote tone={ice.tone}>{ice.text}</PlanNote>
      <PlanMeter label="Ice mapped in 12 months" pct={plan.iceMapped} tone={iceTone} goal={GOAL / 100} />
      <PlanRows>
        <PlanRow
          label="Brake into it"
          value={plan.capture === null ? 'cannot' : `${Math.round(plan.capture)} m/s`}
          tone={fuelTone}
          sub={`tank ${Math.round(plan.tank)} m/s`}
        />
        <PlanRow
          label="Hold it"
          value={`${plan.holdPerMonth < 1 ? plan.holdPerMonth.toFixed(1) : Math.round(plan.holdPerMonth)} m/s / month`}
          tone={plan.capture === null ? 'red' : holdTone}
          sub={
            plan.capture === null
              ? 'cannot get there'
              : plan.monthsHeld > 0
                ? `lasts ${plan.monthsHeld > 120 ? '10+ years' : `${plan.monthsHeld} months`}`
                : 'nothing left'
          }
        />
      </PlanRows>
      {/* Screen budget: the orbit's shape waits behind the shared Details control */}
      <Details id="orbit" panelClassName="pt-2">
        <PlanRows>
          <PlanRow label="Once round" value={hours(plan.periodHours)} />
          <PlanRow label="Pole passes" value={`${plan.passesPerMonth} / month`} />
          <PlanRow label="Longest shadow" value={hours(plan.eclipseHours)} sub="on the battery" />
          <PlanRow label="Far side" value={`${fmtKm(plan.farKm)} km`} sub={plan.circular ? 'a circle' : 'over the north pole'} />
        </PlanRows>
      </Details>
      <PlanChecks checks={plan.checks} />
      <PlanOdds />
      <PlanNav next={{ label: 'Choose ride →', to: 'ride' }} />
    </PlanPanel>
  )
}

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

export function OrbitScreen() {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const [webgl, setWebgl] = useState(canUseWebGL)

  // The step offers one adjustable orbit: a named orbit from before becomes the same low point
  useEffect(() => {
    const orbit = useGameStore.getState().design.orbit
    if (polarOrbitKm(orbit) === null) updateDesign({ orbit: polarOrbitId(getOrbitById(orbit)?.altitude ?? 15) })
  }, [updateDesign])

  const plan = orbitPlan(design, difficulty)
  const setHeight = (t: number) => {
    const id = polarOrbitId(kmAt(Math.min(1, Math.max(0, t))))
    if (id !== useGameStore.getState().design.orbit) updateDesign({ orbit: id })
  }
  const slider = (
    <PlanVSlider
      label="Orbit height over the south pole"
      value={positionOf(plan.km)}
      onChange={setHeight}
      valueText={`${fmtKm(plan.km)} km`}
      topText={`${fmtKm(ORBIT_MAX_KM)} km`}
      bottomText={`${ORBIT_MIN_KM} km`}
      marks={MISSION_TICKS}
    />
  )

  if (!webgl)
    return (
      <div className="flex h-full justify-center gap-3 overflow-auto p-4">
        {slider}
        <OrbitDashboard plan={plan} />
      </div>
    )

  const iceOk = plan.iceLimitKm !== null && plan.km <= plan.iceLimitKm
  return (
    <div className="relative h-full min-h-[480px] w-full overflow-hidden bg-black">
      <SceneBoundary onError={() => setWebgl(false)}>
        <Suspense fallback={<div className="flex h-full items-center justify-center text-paper-faint">Finding the Moon…</div>}>
          <OrbitPlannerScene design={design} km={plan.km} farKm={plan.farKm} ice={plan.iceMapped / 100} iceOk={iceOk} rightPx={RIGHT_PX} />
        </Suspense>
      </SceneBoundary>
      <div className="pointer-events-none absolute inset-y-4 right-4 flex gap-3">
        {slider}
        <OrbitDashboard plan={plan} />
      </div>
    </div>
  )
}
