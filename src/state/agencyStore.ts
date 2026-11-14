import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SPEEDS, type Speed } from '../data/agency'
import {
  advanceDays,
  approveMission,
  initialWorld,
  missionCanStep,
  missionTurned,
  nextMissionTurnDay,
  DAYS_PER_TURN,
  type World,
} from '../game/world'
import {
  MISSION_NAME,
  answerDecision,
  clearFlight,
  currentSim,
  missionBudget,
  onMissionChange,
  restoreFlight,
  saveFlightCopy,
  snapshotOf,
  startPlanning,
  stepMission,
} from '../game/missionLink'

/**
 * The agency base: one clock, one wallet. The clock runs in days while the
 * base screen is open and stands still during planning. The real mission
 * takes one turn every 30 days of agency time.
 */
export interface AgencyState extends World {
  speed: Speed
  /** Why the clock stopped by itself, shown as a banner */
  pauseReason: string | null
  /** Set while the player is in the planning steps for a new mission */
  planningSinceDay: number | null

  setSpeed: (speed: Speed) => void
  /** Advance the clock by real seconds at the current speed */
  tick: (seconds: number) => void
  /** Jump to the next thing worth seeing (up to a year) */
  skipToNextEvent: () => void
  /** Open the planning steps for a new mission */
  beginPlanning: () => void
  /** Give up a plan that was never approved */
  cancelPlanning: () => void
  /** Answer the mission's event card and let the clock run again */
  answer: (optionId: string) => void
  resetAgency: () => void
}

const pickWorld = (s: AgencyState): World => ({
  day: s.day,
  funds: s.funds,
  popularity: s.popularity,
  history: s.history,
  feed: s.feed,
  mission: s.mission,
  research: s.research,
})

/** Set by the mission listener so a running loop knows what the last turn did */
let lastTurn = { notable: false, pause: false }

/**
 * Run the clock to `target`, stepping the mission on its turn days.
 * In skip mode, stops at the first notable thing.
 */
function runUntil(target: number, skip: boolean) {
  const store = useAgencyStore
  for (let guard = 0; guard < 2000; guard++) {
    let world = pickWorld(store.getState())
    if (world.day >= target) return

    const m = world.mission
    const turnDay = missionCanStep(m) ? nextMissionTurnDay(m) : Infinity
    const stepTo = Math.min(target, turnDay)
    const r = advanceDays(world, stepTo)
    world = r.world
    store.setState(world)
    if (skip && r.notable) return

    if (m && world.day >= turnDay) {
      // The game store may have dropped the flight (reload, New Game): bring it back
      if (!currentSim()) restoreFlight(m.seed)
      lastTurn = { notable: false, pause: false }
      stepMission() // the mission listener below books the result
      const after = store.getState().mission
      const moved = !!after && (after.last.turn !== m.last.turn || !!after.last.decisionTitle || after.last.ended)
      if (!moved) return // the flight is gone: stop instead of spinning
      if (lastTurn.pause) return
      if (skip && lastTurn.notable) return
    }
  }
}

export const useAgencyStore = create<AgencyState>()(
  persist(
    (set, get) => ({
      ...initialWorld(),
      speed: 'normal' as Speed,
      pauseReason: null,
      planningSinceDay: null,

      setSpeed: (speed) => set({ speed, pauseReason: speed === 'paused' ? get().pauseReason : null }),

      tick: (seconds) => {
        const rate = SPEEDS[get().speed]
        if (rate === 0 || seconds <= 0) return
        runUntil(get().day + rate * seconds, false)
      },

      skipToNextEvent: () => {
        const m = get().mission
        if (m && m.last.decisionTitle && !m.last.ended) {
          set({ speed: 'paused', pauseReason: `Decision needed: ${m.last.decisionTitle}` })
          return
        }
        set({ pauseReason: null })
        runUntil(get().day + 365, true)
        set({ speed: 'paused' })
      },

      beginPlanning: () => {
        set({ planningSinceDay: Math.floor(get().day) })
        startPlanning()
      },

      cancelPlanning: () => set({ planningSinceDay: null }),

      answer: (optionId) => {
        answerDecision(optionId)
        const m = get().mission
        if (!m?.last.decisionTitle) set({ pauseReason: null, speed: m?.last.ended ? 'paused' : 'normal' })
      },

      resetAgency: () => {
        clearFlight()
        set({ ...initialWorld(), speed: 'normal', pauseReason: null, planningSinceDay: null })
      },
    }),
    {
      name: 'moonshot-agency',
      version: 2,
      // Older saves came from the first mockup: start fresh
      migrate: () => ({ ...initialWorld(), speed: 'normal', pauseReason: null, planningSinceDay: null }) as never,
      partialize: (s) => ({ ...pickWorld(s), speed: s.speed, pauseReason: s.pauseReason, planningSinceDay: s.planningSinceDay }),
    }
  )
)

/* ------------------------------------------------------------------ */
/* Listening to the mission model                                      */
/* ------------------------------------------------------------------ */

/**
 * Every change of the mission, whichever screen caused it (the base clock,
 * the mission team's own simulation screen, an answered event card), is
 * booked here. If the mission got ahead of the agency clock, the clock
 * catches up, paying the days in between.
 */
function bookMissionChange() {
  onMissionChange((sim) => {
    if (!sim) return
    const store = useAgencyStore
    let world = pickWorld(store.getState())
    const snap = snapshotOf(sim)

    if (!world.mission || world.mission.seed !== sim.seed) {
      // A new flight appeared: that is the Go of a mission plan
      if (sim.currentTurn !== 0 || snap.ended) return
      world = approveMission(world, { name: MISSION_NAME, budget: missionBudget(), snapshot: snap })
      store.setState({ ...world, planningSinceDay: null, speed: 'normal', pauseReason: null })
      saveFlightCopy(sim)
      return
    }

    const due = world.mission.approvedDay + snap.turn * DAYS_PER_TURN
    if (world.day < due) world = advanceDays(world, due).world

    const r = missionTurned(world, snap)
    lastTurn = { notable: r.notable, pause: r.pause }
    store.setState(r.world)
    if (r.pause) {
      store.setState({
        speed: 'paused',
        pauseReason: snap.decisionTitle
          ? `Decision needed: ${snap.decisionTitle}`
          : snap.ended
            ? `${MISSION_NAME} is over: see the report at Headquarters`
            : null,
      })
    }
    saveFlightCopy(sim)
  })
}

// Bring back a flight the game store lost on reload, then start listening
{
  const m = useAgencyStore.getState().mission
  if (m && !m.last.ended) restoreFlight(m.seed)
  bookMissionChange()
}
