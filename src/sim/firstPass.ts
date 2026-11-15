import { getPartById, type InstrumentPart } from '../data/parts'
import type { Budgets, Design } from './types'

/**
 * The first mapping pass (the Ice Mapper mini game, played on arrival in lunar orbit) sets how well
 * the first science month maps, within physics:
 *
 *  - floor (the autopilot): today's month, unchanged. Each instrument lays x footprints of strips
 *    over the region a month, at random, so they overlap and the month maps 1 - e^-x of it.
 *  - ceiling (this design's best): the same strips laid with no overlap, min(1, x). x already holds
 *    everything physical: orbit passes, footprint, altitude limit, pointing, power and battery duty.
 *    An instrument blind in shadow adds nothing to ice coverage at either end.
 *  - the pass: `mix` 0..1 between them. Playing never does worse than the autopilot, and a great
 *    pass never maps more than the design can.
 *
 * Data still has to come home: the month's coverage is credited through the same downlink as any other.
 */
export interface FirstPass {
  /** 0 = the autopilot, 1 = the design's ceiling */
  mix: number
  /** How the player took the pass, for the line after it */
  how: 'flown' | 'autopilot' | 'skipped'
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

/** Where the player's game result sits between the game's autopilot and the game's best: 0..1 */
export function passMix(player: number, autopilot: number, best: number): number {
  if (!(best > autopilot)) return 0
  return clamp01((player - autopilot) / (best - autopilot))
}

/** One instrument's share of the region mapped in the first month, at a mix between autopilot and ceiling */
export function passRate(autoRate: number, mix: number): number {
  const r = clamp01(autoRate)
  const x = r >= 1 ? Infinity : -Math.log(1 - r)
  return r + clamp01(mix) * (Math.min(1, x) - r)
}

/** The month-1 coverage rates for every instrument at this mix (mix 0 gives the budgets' own rates) */
export function firstPassRates(b: Budgets, mix: number): Record<string, number> {
  return Object.fromEntries(Object.entries(b.coverageRate).map(([id, r]) => [id, passRate(r, mix)]))
}

/** Ice coverage of the first month at this mix, in %: instruments that see into shadow, combined as scienceTotals does */
export function firstPassCoverage(design: Design, b: Budgets, mix: number): number {
  let unmapped = 1
  for (const id of design.instruments) {
    const inst = getPartById(id) as InstrumentPart | undefined
    if (inst?.seesShadow) unmapped *= 1 - passRate(b.coverageRate[id] ?? 0, mix)
  }
  return 100 * (1 - unmapped)
}

/** "Pass 1: 31% mapped · autopilot 22% · this design's ceiling 61%": after the pass, and in the report */
export function firstPassLine(design: Design, b: Budgets, fp: FirstPass): string {
  const pct = (mix: number) => `${Math.round(firstPassCoverage(design, b, mix))}%`
  const ceiling = `this design's ceiling ${pct(1)}`
  if (fp.how !== 'flown') return `Pass 1 on autopilot: ${pct(0)} mapped · ${ceiling}`
  return `Pass 1: ${pct(fp.mix)} mapped · autopilot ${pct(0)} · ${ceiling}`
}
