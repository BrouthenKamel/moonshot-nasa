import { describe, expect, it } from 'vitest'
import { computeBudgets, createDefaultDesign } from '../../sim/budgets'
import { COVERAGE_TARGET } from '../../sim/evaluate'
import type { Design } from '../../sim/types'
import { AREAS, TARGET_PCT, afterLine, autoplay, setupFromDesign, summarize } from './logic'

const design = (patch: Partial<Design>): Design => ({ ...createDefaultDesign(), ...patch })
/** Sees only sunlit ground: nothing aboard reads permanently shadowed craters */
const blind = design({ instruments: ['inst-ir-spec'], battery: 'battery-large' })
/** The laser sees into shadow */
const seeing = design({ instruments: ['inst-laser'], battery: 'battery-large' })

describe('Ice Mapper agrees with the sim', () => {
  it('uses the mission coverage target, not a number of its own', () => {
    expect(TARGET_PCT).toBe(COVERAGE_TARGET)
    expect(setupFromDesign(seeing).target).toBe(COVERAGE_TARGET)
  })

  it('a design the sim forecasts at 0% cannot reach the target in the pass', () => {
    expect(computeBudgets(blind, 'engineer').projectedCoverage).toBe(0)
    const r = summarize(autoplay(setupFromDesign(blind)))
    expect(r.win).toBe(false)
    // however well it is flown: the shadowed craters alone hold more than the slack
    expect(r.unreachable).toBeGreaterThan(100 - COVERAGE_TARGET)
  })

  it('a design whose forecast meets the target can reach it in the pass', () => {
    expect(computeBudgets(seeing, 'engineer').projectedCoverage).toBeGreaterThanOrEqual(COVERAGE_TARGET)
    const r = summarize(autoplay(setupFromDesign(seeing)))
    expect(r.win).toBe(true)
    expect(r.mapped).toBeGreaterThanOrEqual(COVERAGE_TARGET)
  })

  it('crater ice shares add up to the whole pass', () => {
    expect(AREAS.reduce((s, a) => s + a.value, 0)).toBe(100)
  })
})

describe('afterLine', () => {
  const r = (mapped: number) => ({ ...summarize(autoplay(setupFromDesign(seeing))), mapped })
  it('pairs the pass with the forecast', () => {
    expect(afterLine(setupFromDesign(seeing), r(62.4), 71.2)).toBe('Your pass mapped 62% · full-mission forecast 71%')
  })
  it('shows only the forecast for a skipped pass', () => {
    expect(afterLine(setupFromDesign(seeing), null, 71.2)).toBe('Full-mission forecast 71%')
  })
  it('says why a shadow-blind design is forecast at 0%', () => {
    expect(afterLine(setupFromDesign(blind), r(18), 0)).toBe('Your pass mapped 18% · full-mission forecast 0% · nothing aboard sees into shadow')
  })
})
