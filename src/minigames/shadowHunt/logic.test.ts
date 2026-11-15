import { describe, expect, it } from 'vitest'
import { createDefaultDesign } from '../../sim/budgets'
import {
  AXIAL_TILT_DEG,
  PSR_GOAL,
  SITES,
  SWEEP_BINS,
  buildResult,
  clampLat,
  coinsFromPercent,
  emptySweep,
  initialTagState,
  isLit,
  isPsr,
  lonDelta,
  markArc,
  reservePercentFromCoins,
  siteById,
  spendableM,
  sunElevationDeg,
  sweepComplete,
  sweepCoverage,
  sweepSite,
  tagSite,
  updateSeenLit,
  wrapLon,
  type TagState,
} from './logic'

const fullSweep = (): TagState => ({ ...initialTagState(), swept: Array.from({ length: SWEEP_BINS }, () => true) })

describe('illumination', () => {
  it('designed PSR flags match the sweep, even at the most generous tilt', () => {
    for (const s of SITES) expect(isPsr(s), s.id).toBe(s.psr)
  })
  it('has at least three PSRs and some lit decoys', () => {
    expect(SITES.filter((s) => s.psr).length).toBeGreaterThanOrEqual(PSR_GOAL)
    expect(SITES.filter((s) => !s.psr).length).toBeGreaterThanOrEqual(2)
  })
  it('every decoy is lit with the Sun on the equator, so a plain sweep reveals it', () => {
    for (const s of SITES.filter((x) => !x.psr)) {
      let lit = false
      for (let lon = 0; lon < 360; lon += 2) lit ||= isLit(s, lon, 0)
      expect(lit, s.id).toBe(true)
    }
  })
  it('elevation is highest when the Sun is over the site longitude', () => {
    const s = siteById('malapert')!
    expect(sunElevationDeg(s, s.lonDeg, 0)).toBeGreaterThan(sunElevationDeg(s, s.lonDeg + 90, 0))
    expect(sunElevationDeg(s, s.lonDeg + 180, 0)).toBeLessThan(0)
  })
  it('a sun south of the equator lifts the sun at the south pole', () => {
    const s = siteById('shackleton')!
    expect(sunElevationDeg(s, 0, -1.5)).toBeGreaterThan(sunElevationDeg(s, 0, 1.5))
  })
  it('clamps latitude to the axial tilt', () => {
    expect(clampLat(9)).toBe(AXIAL_TILT_DEG)
    expect(clampLat(-9)).toBe(-AXIAL_TILT_DEG)
    expect(sunElevationDeg(SITES[0], 10, 50)).toBeCloseTo(sunElevationDeg(SITES[0], 10, AXIAL_TILT_DEG))
  })
  it('sweep reports a lit moment only for lit sites', () => {
    expect(sweepSite(siteById('cabeus')!).litLonDeg).toBeNull()
    expect(sweepSite(siteById('malapert')!).litLonDeg).not.toBeNull()
  })
})

describe('angles', () => {
  it('wraps and takes the short way round', () => {
    expect(wrapLon(-10)).toBe(350)
    expect(wrapLon(370)).toBe(10)
    expect(lonDelta(350, 10)).toBe(20)
    expect(lonDelta(10, 350)).toBe(-20)
  })
})

describe('sweep coverage', () => {
  it('fills bins along the short arc, across 360', () => {
    const b = markArc(emptySweep(), 350, 10)
    expect(b[0]).toBe(true)
    expect(b[SWEEP_BINS - 1]).toBe(true)
    expect(sweepCoverage(b)).toBeLessThan(0.3)
  })
  it('fast drags do not leave gaps', () => {
    let b = emptySweep()
    for (let lon = 0; lon < 360; lon += 90) b = markArc(b, lon, lon + 90)
    expect(sweepComplete(b)).toBe(true)
  })
  it('remembers sites that were lit and keeps the same array when nothing new', () => {
    const seen = updateSeenLit([], siteById('malapert')!.lonDeg, 0)
    expect(seen).toContain('malapert')
    expect(updateSeenLit(seen, siteById('malapert')!.lonDeg, 0)).toBe(seen)
  })
})

describe('tagging', () => {
  it('refuses before a full sweep', () => {
    const r = tagSite(initialTagState(), 'cabeus')
    expect(r.outcome).toBe('early')
    expect(r.state.tagged).toEqual([])
  })
  it('accepts a PSR after the sweep and completes at three', () => {
    let r = tagSite(fullSweep(), 'shackleton')
    expect(r.outcome).toBe('correct')
    r = tagSite(r.state, 'shackleton')
    expect(r.outcome).toBe('already')
    r = tagSite(r.state, 'haworth')
    expect(r.done).toBe(false)
    r = tagSite(r.state, 'cabeus')
    expect(r.done).toBe(true)
  })
  it('a lit site is a gentle no with the reason, and is not tagged', () => {
    const r = tagSite(fullSweep(), 'malapert')
    expect(r.outcome).toBe('wrong')
    expect(r.state.tagged).toEqual([])
    expect(r.state.wrong).toEqual(['malapert'])
    expect(r.message).toMatch(/saw sunlight/)
  })
  it('counts a wrong site once and ignores unknown ids', () => {
    let r = tagSite(fullSweep(), 'leibnitz')
    r = tagSite(r.state, 'leibnitz')
    expect(r.state.wrong).toEqual(['leibnitz'])
    expect(tagSite(fullSweep(), 'nope').outcome).toBe('unknown')
  })
})

describe('reserve', () => {
  it('coins map to the classic 0..20 percent in steps of 5', () => {
    expect(reservePercentFromCoins(3)).toBe(15)
    expect(reservePercentFromCoins(99)).toBe(20)
    expect(reservePercentFromCoins(-1)).toBe(0)
    expect(coinsFromPercent(10)).toBe(2)
  })
  it('reserve is not spendable', () => {
    expect(spendableM(25, 20)).toBe(20)
    expect(spendableM(25, 0)).toBe(25)
  })
})

describe('result', () => {
  const design = createDefaultDesign()
  it('patches only the reserve and keeps the rest of planning', () => {
    const state: TagState = { ...fullSweep(), tagged: ['shackleton', 'cabeus', 'haworth'] }
    const r = buildResult(design, { state, reservePercent: 15, budgetCapM: 25, durationS: 61.4 })
    expect(r.patch).toEqual({ planning: { ...design.planning, reservePercent: 15 } })
    expect(r.insights.map((i) => i.id)).toEqual(['psr-found', 'psr-water', 'reserve-set'])
    expect(r.insights[0].metric.value).toBe(3)
    expect(r.insights[2].metric).toEqual({ label: 'Reserve', value: 15, unit: '%' })
    expect(r.durationS).toBe(61)
  })
  it('handles zero reserve and no tags', () => {
    const r = buildResult(design, { state: initialTagState(), reservePercent: 0, budgetCapM: 25, durationS: 5 })
    expect(r.insights.map((i) => i.id)).toEqual(['reserve-set'])
    expect(r.insights[0].text).toMatch(/no reserve/)
  })
})
