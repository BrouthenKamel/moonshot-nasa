import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'
import { useWorldStore } from './worldStore'
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
