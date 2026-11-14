import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'
import { useAgencyStore } from './agencyStore'
import { flashlightDesign } from '../sim/fixtures'
import { missionFunding } from '../game/economy'
import { DAYS_PER_TURN } from '../game/world'

/** Run the base clock until the mission ends, answering every event card with its first option */
function flyOnTheClock(maxMonths = 80) {
  for (let i = 0; i < maxMonths * 2; i++) {
    const a = useAgencyStore.getState()
    if (a.mission?.last.ended) return
    const decision = useGameStore.getState().simState?.pendingDecision
    if (decision) useGameStore.getState().answerEvent(decision.options[0].id)
    useAgencyStore.getState().setSpeed('fast')
    useAgencyStore.getState().tick(1.5) // 15 days
  }
}

describe('agency clock drives the real mission', () => {
  beforeEach(() => {
    useAgencyStore.getState().resetAgency()
    useGameStore.setState({ simState: null, currentReport: null, design: flashlightDesign, difficulty: 'engineer' })
  })

  it('pays the agency share when the plan is approved', () => {
    const before = useAgencyStore.getState()
    useAgencyStore.getState().beginPlanning()
    useGameStore.setState({ design: flashlightDesign })
    useGameStore.getState().startSimulation()
    const after = useAgencyStore.getState()
    expect(after.mission?.approvedDay).toBe(Math.floor(before.day))
    expect(after.funds).toBeCloseTo(before.funds - missionFunding(25, before.popularity).agencyPays, 5)
    expect(after.planningSinceDay).toBeNull()
  })

  it('flies a whole mission month by month and settles it once', () => {
    useGameStore.getState().startSimulation()
    flyOnTheClock()
    const a = useAgencyStore.getState()
    const m = a.mission!
    expect(m.last.ended).toBe(true)
    expect(m.settled).toBe(true)
    // The agency clock and the mission agree: one turn per 30 days
    expect(a.day).toBeGreaterThanOrEqual(m.approvedDay + m.last.turn * DAYS_PER_TURN)
    expect(a.feed.some((f) => f.title.includes('launched'))).toBe(true)
    expect(a.speed).toBe('paused')
    expect(a.funds).toBeGreaterThanOrEqual(0)
  })

  it('catches the clock up when the mission screen flies ahead', () => {
    useGameStore.getState().startSimulation()
    const approvedDay = useAgencyStore.getState().mission!.approvedDay
    useGameStore.getState().advanceTurn()
    useGameStore.getState().advanceTurn()
    const turn = useGameStore.getState().simState!.currentTurn
    expect(useAgencyStore.getState().day).toBeGreaterThanOrEqual(approvedDay + turn * DAYS_PER_TURN)
  })

  it('stops a skip at the next notable thing', () => {
    useGameStore.getState().startSimulation()
    const before = useAgencyStore.getState().feed.length
    useAgencyStore.getState().skipToNextEvent()
    const a = useAgencyStore.getState()
    expect(a.feed.length).toBeGreaterThan(before)
    expect(a.speed).toBe('paused')
  })
})
