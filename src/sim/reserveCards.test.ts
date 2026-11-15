import { describe, it, expect } from 'vitest'
import { createDefaultDesign } from './budgets'
import { archetypes } from './fixtures'
import { initSim, flyUntilDecision, getDefaultAction, isSimComplete, runSimulation, stepTurn } from './simulate'
import type { Design, SimState } from './types'

/**
 * Reserve cards (Jakob, 15 Nov): a no-signal or thruster event with no reserve to pay for the fix used to
 * play as a silent notice. It now stops on a one-button card that says what the reserve would have bought.
 * The outcome is the same as before.
 */

/** Fly like the game: stop at every card, answer it with its first option, until the end */
function flyAnswering(d: Design, seed: number) {
  const cards: NonNullable<SimState['pendingDecision']>[] = []
  let s = initSim(d, 'engineer', seed)
  let guard = 0
  while (!isSimComplete(s) && guard++ < 300) {
    s = flyUntilDecision(s, getDefaultAction())
    if (s.pendingDecision) {
      cards.push(s.pendingDecision)
      s = stepTurn(s, { ...getDefaultAction(), choices: { [s.pendingDecision.key]: s.pendingDecision.options[0].id } })
    }
  }
  return { s, cards }
}

const starting = createDefaultDesign() // 0% reserve

describe('no reserve: a one-button card instead of a silent notice', () => {
  it('lost contact with no reserve: the card says what the reserve would have bought', () => {
    const { s, cards } = flyAnswering(starting, 3)
    const card = cards.find((c) => c.key === 'no-signal')!
    expect(card.options).toEqual([{ id: 'accept', label: 'Accept the loss' }])
    expect(card.text).toBe(
      'No signal after deployment, and there is no reserve to book emergency tracking: the craft is lost. A reserve would have paid for this (about $1.0M).'
    )
    expect(s.flight.end).toBe('lost contact after deployment')
  })

  it('a weak thruster with no reserve: the card names the cost and the effect', () => {
    const card = flyAnswering(starting, 4).cards.find((c) => c.key === 'thruster')!
    expect(card.options.map((o) => o.label)).toEqual(['Accept the delay'])
    expect(card.text).toMatch(/^The thruster underperforms, and there is no reserve to pay for a fix: .+\. A reserve would have paid for this \(about \$1\.5M\)\.$/)
  })

  it('the button names the consequence: an impulsive engine loses delta-v, not time', () => {
    const chemical: Design = { ...archetypes.shoestring, planning: { ...archetypes.shoestring.planning, reservePercent: 0 } }
    for (let seed = 1; seed <= 400; seed++) {
      const card = flyAnswering(chemical, seed).cards.find((c) => c.key === 'thruster')
      if (card) {
        expect(card.options.map((o) => o.label)).toEqual(['Accept the weaker engine'])
        expect(card.text).toContain('the delta-v on board is halved')
        return
      }
    }
    throw new Error('no thruster card in 400 seeds')
  })

  it('the outcome is the same as the standing order (odds runs answer every card the same way)', () => {
    for (const seed of [3, 4, 8, 10, 21, 37]) {
      const played = flyAnswering(starting, seed).s
      const standing = runSimulation(starting, 'engineer', seed)
      expect(played.flight.end, `seed ${seed}`).toBe(standing.flight.end)
      expect(played.flight.coverage).toBeCloseTo(standing.flight.coverage, 6)
      expect(played.flight.main).toBeCloseTo(standing.flight.main, 6)
    }
  })

  it('a reserve that can pay still offers the real choice', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const card = flyAnswering(archetypes.flashlight, seed).cards.find((c) => c.key === 'no-signal' || c.key === 'thruster')
      if (card) {
        expect(card.options.length).toBe(2)
        return
      }
    }
    throw new Error('no no-signal or thruster card in 300 seeds')
  })
})
