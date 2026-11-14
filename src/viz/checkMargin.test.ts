import { describe, it, expect } from 'vitest'
import { computeBudgets } from '../sim/budgets'
import { goNoGo } from '../sim/checks'
import { flashlightDesign, lunahMapDesign } from '../sim/fixtures'
import type { Design } from '../sim/types'
import { checkFigures } from './checkMargin'

const figures = (d: Design, resource: string) => {
  const b = computeBudgets(d, 'engineer')
  return { b, f: checkFigures(goNoGo(d, b).checks.find((c) => c.resource === resource)!, b) }
}

describe('Go/No-Go and dashboard margins (QC #1, #12, #50)', () => {
  it('counts the budget against what is spendable and names the locked reserve', () => {
    const { b, f } = figures(flashlightDesign, 'Budget')
    expect(f.limit).toBeCloseTo(b.spendable)
    expect(f.margin).toBe(`+${(b.spendable - b.totalCost).toFixed(1)} $M spendable left`)
    expect(f.note).toBe(`reserve locked: ${b.reserveAmount.toFixed(1)} M`)
  })

  it('a budget over the spendable line shows how far over, not a plus margin', () => {
    const big: Design = { ...flashlightDesign, planning: { ...flashlightDesign.planning, reservePercent: 40 } }
    const { b, f } = figures(big, 'Budget')
    expect(b.totalCost).toBeGreaterThan(b.spendable)
    expect(f.margin).toBe(`${(b.spendable - b.totalCost).toFixed(1)} $M over what is spendable`)
  })

  it('a red row with room left shows its blocking reason instead of "+ margin"', () => {
    // An ion engine on a one-wing array: plenty of delta-v on paper, no power to thrust
    const weak: Design = { ...lunahMapDesign, solar: 'solar-1wing' }
    const { f } = figures(weak, 'Delta-v')
    expect(f.margin).not.toContain('+')
    expect(f.margin).toMatch(/^Blocked: The ion engine needs \d+ W/)
  })

  it('a green row keeps its margin', () => {
    expect(figures(flashlightDesign, 'Mass').f.margin).toMatch(/^\+\d+\.\d kg margin$/)
  })
})
