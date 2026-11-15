import { describe, expect, it } from 'vitest'
import { passDue, useIcePassStore } from './passStore'

const sim = (phase: string, captured: boolean, scienceTurns = 0, firstPass?: object) => ({ phase, firstPass, flight: { captured, scienceTurns } })

describe('first mapping pass hand-off', () => {
  it('is due on arrival in the science orbit, not before', () => {
    expect(passDue(sim('transfer', false))).toBe(false)
    expect(passDue(sim('orbit', true))).toBe(true)
  })

  it('happens once, before the first science month only', () => {
    expect(passDue(sim('orbit', true, 0, { mix: 0, how: 'skipped' }))).toBe(false)
    expect(passDue(sim('orbit', true, 1))).toBe(false)
    expect(passDue(sim('failed', true))).toBe(false)
    expect(passDue(sim('complete', true))).toBe(false)
  })

  it('remembers that a pass was flown, so later flights can skip it', () => {
    useIcePassStore.setState({ played: false })
    useIcePassStore.getState().markPlayed()
    expect(useIcePassStore.getState().played).toBe(true)
  })
})
