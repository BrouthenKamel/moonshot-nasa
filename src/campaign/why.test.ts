import { describe, expect, it } from 'vitest'
import { CAMPAIGN, missionById, planOf, type Picks } from './missions'
import { flyMission } from './flight'
import { chanceLine, chanceParts, chancePercent, retryCost, riskSentence } from './why'

const landing = missionById('moon-landing')
const risky: Picks = { engine: 'pressure-fed', site: 'shackleton', payload: 'station' }
const safe: Picks = { engine: 'hypergolic', site: 'mare', payload: 'station' }

function seedFor(picks: Picks, test: (f: ReturnType<typeof flyMission>) => boolean) {
  for (let s = 1; s < 5000; s++) if (test(flyMission(landing, picks, s))) return s
  throw new Error('no seed')
}

describe('chanceParts', () => {
  it('gives each pick its signed share of the chance, in the order of the choices', () => {
    const parts = chanceParts(landing, risky)
    expect(parts.map((p) => p.short)).toEqual(['Engine', 'Site', 'Payload'])
    expect(parts[0]).toMatchObject({ option: 'Cheap pressure-fed', points: -8 })
    expect(parts[1].points).toBe(-10)
    expect(parts[2].points).toBe(3)
  })

  it('has a short label on every choice of every mission', () => {
    for (const m of CAMPAIGN.slice(1)) for (const c of m.choices) expect(c.short.length).toBeGreaterThan(2)
  })

  it('counts the cap: a pick that would push past the ceiling only adds what it really adds', () => {
    // Base 0.9 with three helpful picks sits at the 0.95 ceiling: dropping any one of them still
    // leaves it at the ceiling, so none of them really adds anything
    const veryEasy = { ...landing, baseReliability: 0.9 }
    expect(planOf(veryEasy, safe).landing).toBe(0.95)
    for (const p of chanceParts(veryEasy, safe)) expect(p.points).toBe(0)
  })
})

describe('chanceLine', () => {
  it('reads like the Go screen line', () => {
    expect(chanceLine(landing, risky)).toBe('Engine −8 · Site −10 · Payload +3')
    expect(chancePercent(landing, risky)).toBe(Math.round(planOf(landing, risky).success * 100))
  })
})

describe('riskSentence', () => {
  it('names the two biggest risks with their deltas, worst first', () => {
    const f = flyMission(landing, risky, seedFor(risky, (x) => x.outcome === 'failed' && x.failedAt === 'landing'))
    expect(riskSentence(landing, f, risky)).toBe('Biggest risks: Shackleton crater rim: −10 points of your chance; Cheap pressure-fed: −8 points of your chance.')
  })

  it('blames no choice when the rocket failed', () => {
    const f = flyMission(landing, risky, seedFor(risky, (x) => x.failedAt === 'launch'))
    expect(riskSentence(landing, f, risky)).toMatch(/^The rocket failed on the way up: a 2% risk/)
  })

  it('says so when no choice lowered the chance', () => {
    const f = flyMission(landing, safe, seedFor(safe, (x) => x.failedAt === 'landing'))
    expect(riskSentence(landing, f, safe)).toMatch(/^No choice lowered your chance: at \d+%/)
  })
})

describe('retryCost', () => {
  it('compares funds with the share for the same and the cheapest choices', () => {
    const rich = retryCost(landing, safe, 100, 80)
    expect(rich.canSame).toBe(true)
    expect(rich.text).toMatch(/^You can afford to try again/)
    const mid = retryCost(landing, { engine: 'methalox', site: 'shackleton', payload: 'drill' }, 20, 80)
    expect(mid.canSame).toBe(false)
    expect(mid.canCheapest).toBe(true)
    expect(mid.text).toMatch(/^Not with the same choices/)
    const poor = retryCost(landing, safe, 1, 80)
    expect(poor.canCheapest).toBe(false)
    expect(poor.text).toMatch(/^You can't afford to try again yet/)
    expect(poor.cheapest).toBeLessThanOrEqual(poor.same)
  })
})
