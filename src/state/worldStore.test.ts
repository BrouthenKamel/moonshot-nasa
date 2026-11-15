import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'
import { useWorldStore } from './worldStore'
import { useUiStore } from './uiStore'
import { flashlightDesign } from '../sim/fixtures'
import { missionFunding } from '../game/economy'

/** Fly the current mission to its end through the game store, answering every card with its first option */
function flyToEnd() {
  for (let i = 0; i < 200; i++) {
    const sim = useGameStore.getState().simState!
    if (sim.phase === 'complete' || sim.phase === 'failed') return
    if (sim.pendingDecision) useGameStore.getState().answerEvent(sim.pendingDecision.options[0].id)
    else useGameStore.getState().advanceTurn()
  }
}

describe('agency layer follows the mission', () => {
  beforeEach(() => {
    useGameStore.getState().resetDemo()
    useWorldStore.getState().resetWorld()
    useGameStore.setState({ design: flashlightDesign })
  })

  it('pays the agency share when the mission launches', () => {
    const before = useWorldStore.getState()
    useGameStore.getState().startSimulation()
    const after = useWorldStore.getState()
    expect(after.mission).not.toBeNull()
    expect(after.funds).toBeCloseTo(before.funds - missionFunding(25, before.popularity).agencyPays, 5)
  })

  it('books the whole flight: news, money, popularity and settlement', () => {
    useGameStore.getState().startSimulation()
    flyToEnd()
    const w = useWorldStore.getState()
    expect(w.mission?.last.ended).toBe(true)
    expect(w.mission?.settled).toBe(true)
    expect(w.feed.length).toBeGreaterThan(3)
    expect(w.funds).toBeGreaterThanOrEqual(0)
    // The lab finishes the data that came home
    expect(w.research.processed).toBeCloseTo(w.research.received, 5)
  })

  it('resets with the demo', () => {
    useGameStore.getState().startSimulation()
    useGameStore.getState().advanceTurn()
    useGameStore.getState().resetDemo()
    expect(useWorldStore.getState().mission).toBeNull()
  })
})

describe('agency clock', () => {
  beforeEach(() => {
    useGameStore.getState().resetDemo()
    useWorldStore.getState().resetWorld()
    useGameStore.setState({ design: flashlightDesign })
    useWorldStore.getState().setSpeed('normal')
  })

  it('runs days and brings in government money', () => {
    const before = useWorldStore.getState()
    useWorldStore.getState().tick(1) // 1 day
    for (let i = 0; i < 29; i++) useWorldStore.getState().tick(1)
    const after = useWorldStore.getState()
    expect(after.day).toBeCloseTo(before.day + 30, 5)
    expect(after.funds).toBeGreaterThan(before.funds + 0.5)
  })

  it('stands still when paused', () => {
    const before = useWorldStore.getState().day
    useWorldStore.getState().setSpeed('paused')
    useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBe(before)
  })

  it('flies one mission month every 30 days and waits for event cards', () => {
    useGameStore.getState().startSimulation()
    const start = useWorldStore.getState().mission!.approvedDay
    useWorldStore.getState().setSpeed('fast')
    for (let i = 0; i < 400; i++) {
      const sim = useGameStore.getState().simState!
      if (sim.phase === 'complete' || sim.phase === 'failed') break
      if (sim.pendingDecision) {
        // The clock waits for the card
        const day = useWorldStore.getState().day
        useWorldStore.getState().tick(1)
        expect(useWorldStore.getState().day).toBe(day)
        useGameStore.getState().answerEvent(sim.pendingDecision.options[0].id)
        continue
      }
      useWorldStore.getState().tick(1) // 10 days
      const now = useGameStore.getState().simState!
      // The mission is never ahead of the clock
      expect(useWorldStore.getState().day).toBeGreaterThanOrEqual(start + now.currentTurn * 30 - 1e-6)
    }
    const w = useWorldStore.getState()
    expect(w.mission?.last.ended).toBe(true)
    expect(w.mission?.settled).toBe(true)
  })
})

describe('agency clock and the launch', () => {
  beforeEach(() => {
    useGameStore.getState().resetDemo()
    useWorldStore.getState().resetWorld()
    useUiStore.setState({ launchAt: null })
    useGameStore.setState({ design: flashlightDesign })
    useWorldStore.getState().setSpeed('fast')
  })

  it('stops at liftoff and holds while the launch animation plays', () => {
    useGameStore.getState().startSimulation()
    // Fly the build months on the clock until the craft launches
    for (let i = 0; i < 200 && useGameStore.getState().simState!.flight.launchedTurn === null; i++) {
      const sim = useGameStore.getState().simState!
      if (sim.pendingDecision) useGameStore.getState().answerEvent(sim.pendingDecision.options[0].id)
      else useWorldStore.getState().tick(1)
    }
    const sim = useGameStore.getState().simState!
    const w = useWorldStore.getState()
    const launchDay = w.mission!.approvedDay + sim.flight.launchedTurn! * 30
    // The tick that launched stopped on the launch day: no day of the trip has passed yet
    expect(w.day).toBeCloseTo(launchDay, 5)

    // While the rocket lifts off on the island, the clock waits
    useUiStore.getState().startLaunch()
    useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBeCloseTo(launchDay, 5)

    // Once it has gone, the trip starts
    useUiStore.getState().endLaunch()
    useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBeGreaterThan(launchDay)
  })
})
