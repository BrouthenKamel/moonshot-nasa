import { describe, it, expect, beforeEach } from 'vitest'
import { useAgencyStore, missionDay, migrateAgencyState, type AgencyState } from './agencyStore'

describe('agency clock and the mission', () => {
  beforeEach(() => useAgencyStore.getState().resetAgency())

  it('maps turns to days', () => {
    expect(missionDay(112, 0)).toBe(112)
    expect(missionDay(112, 8)).toBe(352)
  })

  it('follows the turns once the mission clock runs, and stops ticking by itself', () => {
    const a = useAgencyStore.getState()
    a.setSpeed('normal')
    a.startMissionClock()
    a.tick(5)
    expect(useAgencyStore.getState().day).toBe(112)
    a.syncToMissionTurn(3)
    expect(useAgencyStore.getState().day).toBe(202)
    a.syncToMissionTurn(2) // never rewinds
    expect(useAgencyStore.getState().day).toBe(202)
  })

  it('runs freely again after the mission clock is reset', () => {
    const a = useAgencyStore.getState()
    a.startMissionClock()
    a.resetMissionClock()
    a.setSpeed('normal')
    const before = useAgencyStore.getState().day
    a.tick(1)
    expect(useAgencyStore.getState().day).toBeGreaterThan(before)
  })

  it('loads state saved by version 1', () => {
    const migrated: AgencyState = migrateAgencyState({ day: 130, funds: 18, support: 70 }, 1)
    expect(migrated.missionStartDay).toBeNull()
    expect(migrated.day).toBe(130)
  })
})
