import { describe, expect, it } from 'vitest'
import { computeBudgets, createDefaultDesign } from '../sim/budgets'
import { computeDesignDelta, formatDelta, type DeltaLine } from './designDelta'

describe('computeDesignDelta', () => {
  it('returns no lines for identical budgets', () => {
    const a = computeBudgets(createDefaultDesign(), 'engineer')
    const b = computeBudgets(createDefaultDesign(), 'engineer')
    expect(computeDesignDelta(a, b)).toEqual([])
  })

  it('lists only changed keys when the solar part changes', () => {
    const base = createDefaultDesign()
    const before = computeBudgets(base, 'engineer')
    const after = computeBudgets({ ...base, solar: 'solar-body' }, 'engineer')
    const lines = computeDesignDelta(before, after)
    const power = lines.find((l) => l.key === 'powerMargin')
    expect(power).toBeDefined()
    expect(power!.diff).toBeLessThan(0)
    expect(power!.before).toBe(before.powerMargin)
    expect(power!.after).toBe(after.powerMargin)
    for (const l of lines) {
      expect(Math.abs(after[l.key] - before[l.key])).toBeGreaterThan(1e-9)
    }
    const costChanged = Math.abs(after.totalCost - before.totalCost) > 1e-9
    expect(lines.some((l) => l.key === 'totalCost')).toBe(costChanged)
  })
})

describe('formatDelta', () => {
  const base: DeltaLine = {
    key: 'totalMass', label: 'Mass', unit: 'kg', before: 0, after: 0, diff: 0, betterWhenHigher: false,
  }
  it('formats positive and negative diffs', () => {
    expect(formatDelta({ ...base, diff: 1.234 })).toBe('Mass +1.2 kg')
    expect(formatDelta({ ...base, key: 'totalCost', label: 'Cost', unit: '$M', diff: -0.5 })).toBe('Cost -0.5 $M')
  })
})
