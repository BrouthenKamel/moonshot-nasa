import { describe, expect, it } from 'vitest'
import { computeBudgets, createDefaultDesign } from '../../sim/budgets'
import { COVERAGE_TARGET } from '../../sim/evaluate'
import type { Design } from '../../sim/types'
import { AREAS, TARGET_PCT, autoplay, craterState, newPass, passHours, passWhy, setupFromDesign, summarize } from './logic'

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

describe('passWhy: one sentence on the result', () => {
  it('names the locked craters for a design that cannot see into shadow', () => {
    const su = setupFromDesign(blind)
    const why = passWhy(su, summarize(autoplay(su)))
    expect(why).toMatch(/^Locked out of Shackleton, Faustini and \d+ more: the IR Spectrometer cannot see into permanent shadow\.$/)
  })

  it('names the missed craters and the footprint when a narrow beam misses some', () => {
    const su = setupFromDesign(seeing)
    const r = summarize(newPass(su)) // nothing flown: every crater missed, the pass went by
    const why = passWhy(su, { ...r, reason: 'passed' })
    expect(why).toMatch(/^Missed Shackleton, Faustini and 7 more: /)
    const narrow = su.scanners.every((s) => s.beam < 46)
    expect(why).toContain(narrow ? 'footprint is narrow, sweep slower' : 'slipped past')
  })

  it('blames the battery when it ran out', () => {
    const su = setupFromDesign(seeing)
    expect(passWhy(su, { ...summarize(newPass(su)), reason: 'battery' })).toContain('the battery ran out first')
  })

  it('says so when every crater is mapped, and classifies each crater', () => {
    const su = setupFromDesign(design({ instruments: ['inst-neutron'], battery: 'battery-large' }))
    const r = summarize(autoplay(su))
    expect(passWhy(su, r)).toBe('Every crater mapped.')
    expect(r.perArea.map(craterState).every((s) => s === 'reached')).toBe(true)
    expect(craterState({ name: 'x', value: 1, pct: 40, blocked: null })).toBe('missed')
    expect(craterState({ name: 'x', value: 1, pct: 0, blocked: 'dark' })).toBe('locked')
  })
})
