import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAgencyStore } from './agencyStore'
import { useUiStore } from './uiStore'
import { DEMO_START_DAY } from '../data/agency'
import { DAYS_PER_TURN, advanceDays, approveMission, initialWorld, missionTurned, type World } from '../game/world'
import { research } from '../game/research'
import { MISSION_NAME, currentSim, missionBudget, onMissionChange, snapshotOf, stepMission } from '../game/missionLink'
import { isSimComplete } from '../sim/simulate'
import type { SimState } from '../sim/types'
import { clockHeld, modalOpenOnPage } from './clockHold'

/**
 * The agency layer on top of the mission (rules in src/game): one clock in days,
 * money, popularity, news and research.
 *
 * - The clock runs on the base screen: 1 day a second, or 10 when fast.
 *   Government funding comes in every day and popularity drifts back toward 50.
 * - A flying mission takes one month (turn) every 30 days. The clock stops
 *   by itself while an event card waits for the player, and holds while the
 *   launch animation plays, so the trip starts once the rocket has gone.
 * - Launching a mission (a new flight at month 0) is the government's Go: the
 *   agency pays its share of the budget. The mission's own buttons ("Advance
 *   one month") still work: the clock catches up to the month they reach.
 * - "Reset demo" resets the agency too.
 * - A fresh game starts paused, so nothing changes while the player looks around: the clock
 *   starts with the first real action (New mission) or the Play button. It also holds while a
 *   modal is open over the base (src/state/clockHold.ts), so reading never costs days.
 */
export const SPEEDS = { paused: 0, normal: 1, fast: 10 } as const
export type Speed = keyof typeof SPEEDS

export interface WorldState extends World {
  speed: Speed
  /** The player chose a mission to work on (New mission) */
  missionOpen: boolean
  /** The finished mission whose result pop-up the player already closed (by seed) */
  resultSeenSeed: number | null
  /** The player has started the clock (first New mission, or any speed button); false in a fresh game */
  clockStarted: boolean
  setSpeed: (speed: Speed) => void
  /** Advance the clock by real seconds at the current speed */
  tick: (seconds: number) => void
  openMission: () => void
  markResultSeen: (seed: number) => void
  resetWorld: () => void
}

const pickWorld = (s: World): World => ({
  day: s.day,
  funds: s.funds,
  popularity: s.popularity,
  history: s.history,
  feed: s.feed,
  mission: s.mission,
  research: s.research,
})

/** The flight the clock may step: this agency's mission, not over, no card waiting */
function steppableFlight(world: World): SimState | null {
  const sim = currentSim()
  if (!sim || !world.mission || world.mission.seed !== sim.seed) return null
  if (isSimComplete(sim) || sim.pendingDecision) return null
  return sim
}

/** Run the clock to `target`, flying one mission month on each 30th day */
function runUntil(target: number) {
  const store = useWorldStore
  for (let guard = 0; guard < 500; guard++) {
    let world = pickWorld(store.getState())
    if (world.day >= target) return
    const sim = steppableFlight(world)
    const turnDay = sim && world.mission ? world.mission.approvedDay + (sim.currentTurn + 1) * DAYS_PER_TURN : Infinity
    world = advanceDays(world, Math.min(target, turnDay)).world
    store.setState(world)
    if (sim && world.day >= turnDay) {
      stepMission() // the listener below books the month
      const after = currentSim()
      if (!after || after.currentTurn === sim.currentTurn || after.pendingDecision) return
      // Liftoff: stop here so the launch animation plays before any day of the trip passes
      if (after.flight.launchedTurn !== null && sim.flight.launchedTurn === null) return
    }
  }
}

export const useWorldStore = create<WorldState>()(
  persist(
    (set, get) => ({
      ...initialWorld(),
      // A fresh game waits for the player (see clockStarted)
      speed: 'paused' as Speed,
      missionOpen: false,
      resultSeenSeed: null as number | null,
      clockStarted: false,
      setSpeed: (speed) => set({ speed, clockStarted: true }),
      tick: (seconds) => {
        const rate = SPEEDS[get().speed]
        if (rate === 0 || seconds <= 0) return
        const held = clockHeld({
          decisionWaiting: !!currentSim()?.pendingDecision, // waits for the event card
          // The launch plays on the island first: the craft leaves only once the rocket has gone
          launching: useUiStore.getState().launchAt !== null,
          modalOpen: modalOpenOnPage(),
        })
        if (held) return
        runUntil(get().day + rate * seconds)
      },
      // Choosing a mission is the first real action: a fresh game's clock starts here
      openMission: () => set((s) => (s.clockStarted ? { missionOpen: true } : { missionOpen: true, speed: 'normal', clockStarted: true })),
      markResultSeen: (seed) => set({ resultSeenSeed: seed }),
      resetWorld: () => set({ ...initialWorld(), missionOpen: false, resultSeenSeed: null, speed: 'paused', clockStarted: false }),
    }),
    {
      name: 'moonshot-agency-world',
      version: 2,
      // A save from before the paused start was already running: it keeps running
      migrate: (persisted) => ({ ...(persisted as object), speed: 'normal', missionOpen: false, clockStarted: true }) as never,
      partialize: (s) => ({
        ...pickWorld(s),
        speed: s.speed,
        missionOpen: s.missionOpen,
        resultSeenSeed: s.resultSeenSeed,
        clockStarted: s.clockStarted,
      }),
    }
  )
)

/** Book one change of the flight in the agency */
export function bookFlight(sim: SimState | null) {
  if (!sim) return
  const store = useWorldStore
  let world = pickWorld(store.getState())
  const snap = snapshotOf(sim)

  if (!world.mission || world.mission.seed !== sim.seed) {
    // A new flight at month 0: the plan was approved and launched into the build
    if (sim.currentTurn !== 0 || snap.ended) return
    store.setState({ ...approveMission(world, { name: MISSION_NAME, budget: missionBudget(), snapshot: snap }), missionOpen: true })
    return
  }

  const due = world.mission.approvedDay + snap.turn * DAYS_PER_TURN
  if (world.day < due) world = advanceDays(world, due).world
  world = missionTurned(world, snap).world

  // Once the flight is over, the lab works through the data that came home
  if (snap.ended) {
    const backlog = Math.max(0, world.research.received - world.research.processed)
    if (backlog > 0) world = advanceDays(world, Math.floor(world.day) + Math.ceil(backlog / research.processingPerDay) + 1).world
  }
  store.setState(world)
}

/* Start listening once, when the store is first imported */
onMissionChange(bookFlight)
// "Reset demo" puts the base back to its start: the day and a fresh funds history
useAgencyStore.subscribe((s, prev) => {
  const reset = s.day < prev.day || (s.fundsHistory !== prev.fundsHistory && s.day === DEMO_START_DAY)
  if (reset) useWorldStore.getState().resetWorld()
})
