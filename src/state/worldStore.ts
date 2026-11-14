import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAgencyStore } from './agencyStore'
import { DEMO_START_DAY } from '../data/agency'
import { DAYS_PER_TURN, advanceDays, approveMission, initialWorld, missionTurned, type World } from '../game/world'
import { research } from '../game/research'
import { MISSION_NAME, missionBudget, onMissionChange, snapshotOf } from '../game/missionLink'
import type { SimState } from '../sim/types'

/**
 * The agency layer on top of the mission: money, popularity, the news feed and
 * research (rules in src/game). It only listens: the mission and its clock stay
 * in the game store and the agency store, which this file never changes.
 *
 * - Launching a mission (a new flight at month 0) is the government's Go: the
 *   agency pays its share of the budget.
 * - Every mission month is 30 agency days: funding comes in, data reaches the
 *   Research Lab, papers come out.
 * - "Reset demo" (the base clock going back) resets the agency too.
 */
export interface WorldState extends World {
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

export const useWorldStore = create<WorldState>()(
  persist(
    (set) => ({
      ...initialWorld(),
      resetWorld: () => set(initialWorld()),
    }),
    {
      name: 'moonshot-agency-world',
      version: 1,
      partialize: (s) => pickWorld(s),
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
    store.setState(approveMission(world, { name: MISSION_NAME, budget: missionBudget(), snapshot: snap }))
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
