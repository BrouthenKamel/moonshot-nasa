import { describe, it, expect, beforeEach } from 'vitest'
import { useAgencyStore, missionDay, migrateAgencyState, mergeAgencyState, type AgencyState } from './agencyStore'

describe('agency clock and the mission', () => {
  beforeEach(() => useAgencyStore.getState().resetAgency())

  // Jakob, 14 Nov: the base clock waits until the player acts
  it('starts paused: the clock does not run until the player presses play', () => {
    const before = useAgencyStore.getState().day
    expect(useAgencyStore.getState().speed).toBe('paused')
    useAgencyStore.getState().tick(10)
    expect(useAgencyStore.getState().day).toBe(before)
    useAgencyStore.getState().setSpeed('normal')
    useAgencyStore.getState().tick(1)
    expect(useAgencyStore.getState().day).toBeGreaterThan(before)
  })

  it('comes back paused after a reload, even if it was playing', () => {
    const merged = mergeAgencyState({ day: 200, speed: 'fast' }, useAgencyStore.getState())
    expect(merged.day).toBe(200)
    expect(merged.speed).toBe('paused')
  })

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

  it('runs freely again once the flight is over, keeping the start day for the feed', () => {
    const a = useAgencyStore.getState()
    a.setSpeed('normal')
    a.startMissionClock()
    a.syncToMissionTurn(20)
    a.endMissionClock()
    const ended = useAgencyStore.getState().day
    a.tick(1)
    expect(useAgencyStore.getState().day).toBeGreaterThan(ended)
    expect(useAgencyStore.getState().missionStartDay).toBe(112)
  })

  it('loads state saved by version 1', () => {
    const migrated: AgencyState = migrateAgencyState({ day: 130, funds: 18, support: 70 }, 1)
    expect(migrated.missionStartDay).toBeNull()
    expect(migrated.day).toBe(130)
  })
})
