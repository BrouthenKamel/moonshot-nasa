import { describe, expect, it } from 'vitest'
import { buildReport } from '../../sim/evaluate'
import { archetypes, flashlightDesign, lunahMapDesign } from '../../sim/fixtures'
import { runSimulation } from '../../sim/simulate'
import type { Design } from '../../sim/types'
import { ICE_HUNTER_COVERAGE, medals } from './medals'

const reportOf = (design: Design, seed = 1) => buildReport(runSimulation(design, 'engineer', seed))
const earned = (r: ReturnType<typeof reportOf>) =>
  medals(r)
    .filter((m) => m.earned)
    .map((m) => m.id)

describe('medals: the payoff of a finished mission', () => {
  it('lists every medal in a fixed order, earned or not', () => {
    const ids = medals(reportOf(flashlightDesign)).map((m) => m.id)
    expect(ids).toEqual(['reached-orbit', 'ice-map', 'every-byte-home', 'full-year', 'reserve-intact', 'steady-hands', 'under-budget', 'ice-hunter'])
  })

  it('a full success earns the five requirement medals', () => {
    const r = reportOf(flashlightDesign)
    expect(r.outcome).toBe('success')
    expect(earned(r)).toEqual(expect.arrayContaining(['reached-orbit', 'ice-map', 'every-byte-home', 'full-year', 'reserve-intact']))
  })

  it('each requirement medal follows its requirement, across real flights', () => {
    const pairs: [string, string][] = [
      ['capture', 'reached-orbit'],
      ['coverage', 'ice-map'],
      ['data', 'every-byte-home'],
      ['lifetime', 'full-year'],
      ['budget', 'reserve-intact'],
    ]
    let missedOne = false
    for (const design of Object.values(archetypes))
      for (const seed of [1, 2, 3]) {
        const r = reportOf(design, seed)
        const m = medals(r)
        for (const [req, medal] of pairs) {
          const met = r.requirements.find((q) => q.id === req)!.met
          if (!met) missedOne = true
          expect(m.find((x) => x.id === medal)!.earned).toBe(met)
        }
        expect(m.find((x) => x.id === 'ice-hunter')!.earned).toBe(r.coverageAchieved >= ICE_HUNTER_COVERAGE)
        if (r.outcome === 'failed') expect(m.find((x) => x.id === 'under-budget')!.earned).toBe(false)
      }
    // The sweep covers at least one missed requirement, so "not earned" is exercised too
    expect(missedOne).toBe(true)
  })

  it('ice hunter needs 90% coverage', () => {
    const r = reportOf(lunahMapDesign)
    expect(earned({ ...r, coverageAchieved: 95 })).toContain('ice-hunter')
    expect(earned({ ...r, coverageAchieved: 74 })).not.toContain('ice-hunter')
  })

  it('steady hands needs every event handled well, and at least one event', () => {
    const r = reportOf(flashlightDesign)
    expect(earned({ ...r, eventsEncountered: 3, eventsHandledWell: 3 })).toContain('steady-hands')
    expect(earned({ ...r, eventsEncountered: 3, eventsHandledWell: 2 })).not.toContain('steady-hands')
    expect(earned({ ...r, eventsEncountered: 0, eventsHandledWell: 0 })).not.toContain('steady-hands')
  })

  it('under budget reads the money points, and never after a failure', () => {
    const r = reportOf(flashlightDesign)
    expect(earned({ ...r, score: { ...r.score, money: 20 } })).toContain('under-budget')
    expect(earned({ ...r, score: { ...r.score, money: 5 } })).not.toContain('under-budget')
    expect(earned({ ...r, outcome: 'failed', score: { ...r.score, money: 20 } })).not.toContain('under-budget')
  })
})
