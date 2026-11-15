import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '../../state/gameStore'
import { useCampaignStore } from '../../state/campaignStore'
import { markOpened } from '../../campaign/progress'
import { campaignCoversFlight, isLaunchDayPending, markLaunchDayPending } from './launchDayPending'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    key: () => null,
    length: 0,
    clear: () => data.clear(),
  }
}

// Integration review, 16 Nov: a pending Launch Day showed its intro over the campaign's Moon landing brief
describe('Launch Day stays on the main flight screen', () => {
  const idle = { active: null, ladderOpen: false, pendingPayoff: null }

  it('shows on the main flight screen', () => {
    expect(campaignCoversFlight(idle)).toBe(false)
  })

  it('waits while a campaign mission, the ladder or a payoff show is up', () => {
    expect(campaignCoversFlight({ ...idle, active: { missionId: 'moon-landing' } })).toBe(true)
    expect(campaignCoversFlight({ ...idle, ladderOpen: true })).toBe(true)
    expect(campaignCoversFlight({ ...idle, pendingPayoff: { kind: 'ice-map', outcome: 'success' } })).toBe(true)
  })
})

describe('a new mission drops an unflown Launch Day', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    markLaunchDayPending(42)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('when a new main mission starts', () => {
    useGameStore.getState().startNewMission()
    expect(isLaunchDayPending(42)).toBe(false)
  })

  it('when a new game starts', () => {
    useGameStore.getState().newGame()
    expect(isLaunchDayPending(42)).toBe(false)
  })

  it('when a campaign mission starts', () => {
    useCampaignStore.setState((s) => ({ progress: markOpened(s.progress, 'moon-landing'), active: null }))
    useCampaignStore.getState().startMission('moon-landing')
    expect(useCampaignStore.getState().active?.missionId).toBe('moon-landing')
    expect(isLaunchDayPending(42)).toBe(false)
  })
})
