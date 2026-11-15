import { describe, expect, it } from 'vitest'
import { DECISION_CLOCK_MS, decisionClockFraction, shouldPauseDecisionClock, standingOrderOptionId } from './decisionClock'

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

  it('picks the first option as standing order', () => {
    expect(standingOrderOptionId({ options: [{ id: 'safe-mode' }, { id: 'ignore' }] })).toBe('safe-mode')
    expect(standingOrderOptionId({ options: [] })).toBeNull()
    expect(standingOrderOptionId(null)).toBeNull()
  })
})
