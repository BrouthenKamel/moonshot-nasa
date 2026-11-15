import { describe, it, expect } from 'vitest'
import { createDefaultDesign } from '../sim/budgets'
import { lostForWantOfReserve } from '../sim/evaluate'
import { archetypes } from '../sim/fixtures'
import { flyUntilDecision, getDefaultAction, initSim, isSimComplete, stepTurn } from '../sim/simulate'
import type { Design, SimState } from '../sim/types'
import { decisionTiming } from './decisionTiming'

/** Fly until the first card of `key` comes up (null if none in the flight) */
function firstCard(d: Design, seed: number, key: string): SimState | null {
  let s = initSim(d, 'engineer', seed)
  let guard = 0
  while (!isSimComplete(s) && guard++ < 300) {
    s = flyUntilDecision(s, getDefaultAction())
    if (!s.pendingDecision) return null
    if (s.pendingDecision.key === key) return s
    s = stepTurn(s, { ...getDefaultAction(), choices: { [s.pendingDecision.key]: s.pendingDecision.options[0].id } })
  }
  return null
}

describe('the top bar names the day of a launch-day card (QC, 15 Nov)', () => {
  it('a no-signal card on launch day: "Deployment day", while the craft still counts as not launched', () => {
    const s = firstCard(createDefaultDesign(), 3, 'no-signal')!
    expect(s.flight.launchedTurn).toBeNull() // why the mission panel still reads "Building"
    expect(decisionTiming(s)).toBe('Deployment day')
  })

  it('a build delay during the build: no label (the panel is right)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = firstCard(archetypes.ambitious, seed, 'build-delay')
      if (s && s.pendingDecision!.turn < s.flight.launchTurn) {
        expect(decisionTiming(s)).toBeNull()
        return
      }
    }
    throw new Error('no build-delay card before launch in 300 seeds')
  })

  it('a thruster card in transfer: no label', () => {
    const s = firstCard(createDefaultDesign(), 4, 'thruster')!
    expect(s.flight.launchedTurn).not.toBeNull()
    expect(decisionTiming(s)).toBeNull()
  })

  it('no card, no label', () => {
    expect(decisionTiming(initSim(createDefaultDesign(), 'engineer', 1))).toBeNull()
    expect(decisionTiming(null)).toBeNull()
  })
})

describe('lost for want of a reserve', () => {
  it('only when the no-signal card offered nothing but "Accept the loss"', () => {
    const lost = firstCard(createDefaultDesign(), 3, 'no-signal')!
    const ended = stepTurn(lost, { ...getDefaultAction(), choices: { 'no-signal': 'accept' } })
    expect(ended.flight.end).toBe('lost contact after deployment')
    expect(lostForWantOfReserve(ended)).toBe(true)
    // A reserve that could pay: the player chose, so it is not "for want of a reserve"
    for (let seed = 1; seed <= 300; seed++) {
      const s = firstCard(archetypes.flashlight, seed, 'no-signal')
      if (!s) continue
      const gaveUp = stepTurn(s, { ...getDefaultAction(), choices: { 'no-signal': 'give-up' } })
      expect(lostForWantOfReserve(gaveUp)).toBe(false)
      return
    }
    throw new Error('no no-signal card in 300 seeds')
  })
})
