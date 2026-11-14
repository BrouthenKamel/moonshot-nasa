import { describe, it, expect } from 'vitest'
import { computeBudgets } from './budgets'
import { goNoGo } from './checks'
import { flashlightDesign } from './fixtures'
import type { Budgets } from './types'

const base = computeBudgets(flashlightDesign, 'engineer')
const reasonOf = (b: Budgets, resource: string) => goNoGo(flashlightDesign, b).checks.find((c) => c.resource === resource)!

describe('Go/No-Go wording (QC #17, #45)', () => {
  it('says how much data is lost when the instruments make more than the link carries', () => {
    const c = reasonOf({ ...base, dataPerTurn: 200, downlinkPerTurn: 90 }, 'Data Link')
    expect(c.status).toBe('yellow')
    expect(c.reason).toContain('The instruments make 200 MB a turn but the link carries 90: 110 MB a turn is lost')
    expect(c.reason).not.toContain('to spare')
  })

  it('keeps "less than 15% to spare" for a link that carries everything with little room', () => {
    const c = reasonOf({ ...base, dataPerTurn: 100, downlinkPerTurn: 105 }, 'Data Link')
    expect(c.status).toBe('yellow')
    expect(c.reason).toContain('less than 15% to spare')
    expect(c.reason).not.toContain('MB a turn is lost')
  })

  it('says how long the build takes in months, not effort points', () => {
    const c = reasonOf({ ...base, readyTurn: base.rideTurn + 2, timeMarginTurns: -2, buildTurns: 4, buildEffort: 37 }, 'Time')
    expect(c.status).toBe('red')
    expect(c.reason).toContain('4 months of building')
    expect(c.reason).not.toContain('points')
  })
})
