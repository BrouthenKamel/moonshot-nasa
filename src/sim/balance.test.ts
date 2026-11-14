import { describe, it, expect } from 'vitest'
import { computeBudgets } from './budgets'
import { goNoGo } from './checks'
import {
  archetypes,
  architecture,
  balanceRun,
  formatReport,
  instrumentSets,
  slotOptions,
  slotValue,
  winRate,
  WIN_RATE,
  type Slot,
} from './balance'
import { flashlightDesign, iceCubeDesign } from './fixtures'
import { runSimulation } from './simulate'
import { buildReport } from './evaluate'
import type { Design } from './types'

/**
 * Balance guard (docs/superpowers/specs/2026-11-14-balance-redesign.md; Jakob, 14 Nov: "a sensible
 * amount of designs wins"). The light checks run in the normal suite; the full enumeration runs with
 * BALANCE_FULL=1 pnpm vitest run src/sim/balance.test.ts (or `pnpm balance` for the report).
 */

const SEEDS = 200
const go = (d: Design) => goNoGo(d, computeBudgets(d, 'engineer'))
const science = (d: Design) => go(d).checks.find((c) => c.resource === 'Science')!

/** Options that are taught traps: picking them shows a plain reason and the craft cannot meet the brief */
const TRAPS: Partial<Record<Slot, string[]>> = {
  instruments: ['inst-ir-spec', 'inst-camera', 'inst-camera+inst-ir-spec'], // nothing that sees into shadow
  radio: ['radio-uhf'], // does not reach Earth from the Moon
  orbit: ['orbit-100km'], // too high for both ice instruments
}

const rates = new Map<string, number>()
const rateOf = (name: string) => {
  if (!rates.has(name)) rates.set(name, winRate(archetypes[name], SEEDS))
  return rates.get(name)!
}

describe('balance: the archetype designs', () => {
  it('each flies, can meet the brief on paper, and wins most of its flights', () => {
    for (const [name, d] of Object.entries(archetypes)) {
      expect(go(d).canGo, name).toBe(true)
      expect(science(d).status, name).toBe('green')
      // The ambitious craft is the top score at the highest risk: it only has to win half its flights
      expect(rateOf(name), name).toBeGreaterThanOrEqual(name === 'ambitious' ? 0.5 : WIN_RATE)
    }
  }, 60_000)

  it('the ambitious two-instrument craft scores highest on average: ambition is a trade, not a trap', () => {
    const mean = (d: Design) => {
      let total = 0
      for (let seed = 1; seed <= 150; seed++) total += buildReport(runSimulation(d, 'engineer', seed)).score.total
      return total / 150
    }
    const top = mean(archetypes.ambitious)
    for (const name of ['flashlight', 'lunahMap', 'shoestring']) expect(top, name).toBeGreaterThan(mean(archetypes[name]))
  }, 30_000)

  it('are at least 6 genuinely different architectures', () => {
    const archs = new Set(Object.values(archetypes).map(architecture))
    expect(archs.size).toBeGreaterThanOrEqual(6)
  })

  it('together use every option that is not a taught trap', () => {
    const o = slotOptions()
    const slots = Object.keys(o) as Exclude<Slot, 'instruments'>[]
    const missing: string[] = []
    for (const s of [...slots, 'instruments' as const]) {
      const values = s === 'instruments' ? instrumentSets().map((i) => [...i].sort().join('+')) : o[s].map(String)
      const used = new Set(Object.values(archetypes).map((d) => slotValue(d, s)))
      for (const v of values) if (!used.has(v) && !TRAPS[s]?.includes(v)) missing.push(`${s}=${v}`)
    }
    expect(missing).toEqual([])
  })
})

describe('balance: the traps say why', () => {
  it('no instrument that sees into shadow: Science names the two that do', () => {
    for (const inst of [['inst-ir-spec'], ['inst-camera'], ['inst-camera', 'inst-ir-spec']]) {
      const s = science({ ...flashlightDesign, instruments: inst })
      expect(s.status).not.toBe('green')
      expect(s.reason).toContain('laser reflectometer')
    }
    expect(science(iceCubeDesign).reason).toContain('shadowed craters')
  })

  it('UHF: Comms is red and says it does not reach the Moon', () => {
    const c = go({ ...flashlightDesign, radio: 'radio-uhf' }).checks.find((x) => x.resource === 'Comms')!
    expect(c.status).toBe('red')
    expect(c.reason).toMatch(/does not reach Earth from the Moon/)
  })

  it('100 km: the ice instruments map nothing there, so Science is not green', () => {
    for (const d of Object.values(archetypes)) {
      const x = { ...d, orbit: 'orbit-100km' }
      expect(computeBudgets(x, 'engineer').projectedCoverage).toBe(0)
      expect(science(x).status).not.toBe('green')
    }
  })
})

describe('balance: the planning dials matter', () => {
  const at = (testTurns: number, reservePercent: number) => ({
    ...flashlightDesign,
    planning: { ...flashlightDesign.planning, testTurns, reservePercent },
  })

  it('an untested craft fails clearly more often than a tested one', () => {
    expect(winRate(at(2, 10), 400) - winRate(at(0, 10), 400)).toBeGreaterThan(0.1)
  }, 20_000)

  it('no reserve costs win rate: the fixes in flight cannot be paid', () => {
    expect(winRate(at(2, 10), 400) - winRate(at(2, 0), 400)).toBeGreaterThan(0.03)
  }, 20_000)
})

describe.skipIf(!process.env.BALANCE_FULL)('balance: full enumeration', () => {
  it('many different designs win, every non-trap option wins somewhere, nothing wins always', () => {
    const o = slotOptions()
    const plans = o.testTurns.flatMap((t) => o.reservePercent.map((r) => ({ testTurns: Number(t), reservePercent: Number(r) })))
    const r = balanceRun({ plans, seeds: 30, screenSeeds: 8 })
    console.log(formatReport(r))
    expect(r.architectures.size).toBeGreaterThanOrEqual(6)
    for (const [slot, opts] of Object.entries(r.options) as [Slot, BalanceOptions][]) {
      for (const [v, c] of Object.entries(opts)) {
        if (TRAPS[slot]?.includes(v)) continue
        expect(c.winners, `${slot}=${v}`).toBeGreaterThan(0)
      }
    }
    // Bad luck never goes away: even the best design, flown 500 times, loses some
    expect(winRate(r.best.design!, 500)).toBeLessThan(0.99)
  }, 1_800_000)
})

type BalanceOptions = Record<string, { viable: number; winners: number; best: number }>
