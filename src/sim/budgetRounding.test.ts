import { describe, expect, it } from 'vitest'
import { computeBudgets, createDefaultDesign } from './budgets'
import { goNoGo } from './checks'
import { orbitHeightText, getOrbitById } from '../data/orbits'
import { FIXED_DIFFICULTY } from '../state/gameStore'

const budgetReason = (totalCost: number, spendable: number) => {
  const design = createDefaultDesign()
  const b = { ...computeBudgets(design, FIXED_DIFFICULTY), totalCost, spendable, budgetCap: 99, reserveAmount: 3 }
  return goNoGo(design, b).checks.find((c) => c.resource === 'Budget')!.reason
}

describe('Budget wording', () => {
  it('shows two decimals and the overshoot when both round to the same figure', () => {
    const r = budgetReason(22.54, 22.5)
    expect(r).toContain('costs 22.54 M but only 22.50 M is spendable')
    expect(r).toContain('0.04 M over')
  })
  it('keeps one decimal when the figures differ', () => {
    const r = budgetReason(24.3, 22.5)
    expect(r).toContain('costs 24.3 M but only 22.5 M is spendable')
    expect(r).not.toContain('over)')
  })
})

describe('orbitHeightText', () => {
  it('names the chosen height, not an orbit family', () => {
    expect(orbitHeightText(getOrbitById('orbit-polar-15')!)).toBe('15 km over the pole (far side 3,150 km)')
    expect(orbitHeightText(getOrbitById('orbit-polar-200')!)).toBe('200 km over the pole (far side 3,150 km)')
    expect(orbitHeightText(getOrbitById('orbit-polar-4000')!)).toBe('4,000 km over the pole (a circle)')
  })
})
