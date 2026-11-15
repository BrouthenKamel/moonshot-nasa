import { describe, expect, it } from 'vitest'
import { computeBudgets, createDefaultDesign } from '../../sim/budgets'
import { COVERAGE_TARGET } from '../../sim/evaluate'
import type { Design } from '../../sim/types'
import { AREAS, TARGET_PCT, passHours, autoplay, setupFromDesign, summarize } from './logic'

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

describe('the pass on screen', () => {
  it('says how many real hours of battery the pass stands for', () => {
    const su = setupFromDesign(seeing)
    expect(passHours(su)).toBe(Math.round(su.batteryWh / su.watts))
  })

  it('laser and neutron designs can read every crater, and reach the target on autopilot with a large battery', () => {
    for (const inst of ['inst-laser', 'inst-neutron']) {
      const r = summarize(autoplay(setupFromDesign(design({ instruments: [inst], battery: 'battery-large' }))))
      expect(r.unreachable).toBe(0)
      expect(r.perArea.every((a) => a.blocked === null)).toBe(true)
      expect(r.win).toBe(true)
    }
  })
})
