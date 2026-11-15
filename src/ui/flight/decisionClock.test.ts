import { describe, expect, it } from 'vitest'
import { DECISION_CLOCK_MS, decisionClockFraction, decisionClockNote, shouldPauseDecisionClock, standingOrderOptionId } from './decisionClock'

describe('decisionClock helpers', () => {
  it('calculates remaining fraction clamped between 0 and 1', () => {
    expect(decisionClockFraction(0)).toBe(1)
    expect(decisionClockFraction(-500)).toBe(1)
    expect(decisionClockFraction(DECISION_CLOCK_MS / 2)).toBeCloseTo(0.5, 5)
    expect(decisionClockFraction(DECISION_CLOCK_MS)).toBe(0)
    expect(decisionClockFraction(DECISION_CLOCK_MS * 2)).toBe(0)
  })

  it('pauses on reduced motion, blur, or missing decision', () => {
    expect(shouldPauseDecisionClock({ reducedMotion: false, blurred: false, hasDecision: true })).toBe(false)
    expect(shouldPauseDecisionClock({ reducedMotion: true, blurred: false, hasDecision: true })).toBe(true)
    expect(shouldPauseDecisionClock({ reducedMotion: false, blurred: true, hasDecision: true })).toBe(true)
    expect(shouldPauseDecisionClock({ reducedMotion: false, blurred: false, hasDecision: false })).toBe(true)
  })

  it('does not start until the player acts, and pauses while they read the card', () => {
    const live = { reducedMotion: false, blurred: false, hasDecision: true, armed: true, reading: false }
    expect(shouldPauseDecisionClock(live)).toBe(false)
    expect(shouldPauseDecisionClock({ ...live, armed: false })).toBe(true)
    expect(shouldPauseDecisionClock({ ...live, reading: true })).toBe(true)
    expect(decisionClockNote(live)).toBeNull()
    expect(decisionClockNote({ ...live, armed: false })).toBe('Starts when you act')
    expect(decisionClockNote({ ...live, reading: true })).toBe('Paused')
    expect(decisionClockNote({ ...live, hasDecision: false })).toBeNull()
  })

  it('picks the first option as standing order', () => {
    expect(standingOrderOptionId({ options: [{ id: 'safe-mode' }, { id: 'ignore' }] })).toBe('safe-mode')
    expect(standingOrderOptionId({ options: [] })).toBeNull()
    expect(standingOrderOptionId(null)).toBeNull()
  })
})
