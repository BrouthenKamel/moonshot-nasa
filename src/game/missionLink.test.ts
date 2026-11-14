import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../state/gameStore'
import { archetypes } from '../sim/fixtures'
import { missionFunding } from './economy'
import { MISSION_NAME, answerDecision, currentSim, missionBudget, snapshotOf, stepMission } from './missionLink'
import { DAYS_PER_TURN, advanceDays, approveMission, initialWorld, missionTurned, type World } from './world'

/**
 * The agency rules booked against the real mission model: the flight is flown
 * through the game store, and every turn goes through missionTurned, one turn
 * every 30 agency days.
 */
function flyAndBook(): World {
  useGameStore.getState().startSimulation()
  const first = snapshotOf(currentSim()!)
  let world = approveMission(initialWorld(), { name: MISSION_NAME, budget: missionBudget(), snapshot: first })

  for (let i = 0; i < 200 && !world.mission!.last.ended; i++) {
    const decision = currentSim()!.pendingDecision
    if (decision) answerDecision(decision.options[0].id)
    else stepMission()
    const snap = snapshotOf(currentSim()!)
    world = advanceDays(world, world.mission!.approvedDay + snap.turn * DAYS_PER_TURN).world
    world = missionTurned(world, snap).world
  }
  // Let the lab finish the data that came home
  return advanceDays(world, world.day + 365).world
}

describe('agency rules on the real mission', () => {
  beforeEach(() => useGameStore.getState().resetDemo())

  for (const [name, design] of Object.entries(archetypes)) {
    it(`books a whole ${name} flight and settles it once`, () => {
      useGameStore.setState({ design, difficulty: 'engineer' })
      const start = initialWorld()
      const world = flyAndBook()
      const m = world.mission!

      expect(m.last.ended).toBe(true)
      expect(m.settled).toBe(true)
      expect(m.agencyPaid).toBeCloseTo(missionFunding(25, start.popularity).agencyPays, 5)
      expect(world.funds).toBeGreaterThanOrEqual(0)
      expect(world.popularity).toBeGreaterThanOrEqual(0)
      expect(world.popularity).toBeLessThanOrEqual(100)
      if (m.last.launched) expect(world.feed.some((f) => f.title.includes('launched'))).toBe(true)
    })
  }
})
