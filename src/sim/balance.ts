import { computeBudgets } from './budgets'
import { goNoGo } from './checks'
import { runSimulation } from './simulate'
import { buildReport } from './evaluate'
import {
  solarPanels,
  batteries,
  radios,
  computers,
  attitudeControls,
  propulsionSystems,
  instruments,
} from '../data/parts'
import { lunarOrbits } from '../data/orbits'
import { rides } from '../data/rides'
import { transfers } from '../data/transfers'
import { groundStations } from '../data/ground'
import type { Design } from './types'

export { archetypes } from './fixtures'

/**
 * Headless balance harness (docs/superpowers/specs/2026-11-14-balance-redesign.md).
 *
 * Enumerates every hardware combination, keeps the ones the Go / No-Go check lets fly with a
 * green Science bar ("viable": the plan can meet the brief on paper), then flies the viable
 * ones over many seeds. A design "wins" when it fully succeeds in at least WIN_RATE of its
 * flights. Reports win rates per option and the distinct winning architectures.
 *
 * Light run (in the normal suite): src/sim/balance.test.ts.
 * Full run: BALANCE_FULL=1 pnpm vitest run src/sim/balance.test.ts
 */

/** A design wins when it fully succeeds in at least this share of its flights */
export const WIN_RATE = 0.6

/** The option slots a player chooses, and the choices in each */
export type Slot =
  | 'instruments'
  | 'solar'
  | 'battery'
  | 'radio'
  | 'computer'
  | 'attitude'
  | 'propulsion'
  | 'orbit'
  | 'ride'
  | 'transfer'
  | 'groundStation'
  | 'testTurns'
  | 'reservePercent'

const ids = <T extends { id: string }>(list: T[]) => list.map((x) => x.id)

/** Instrument sets: each single instrument and each pair (three or more never fit the box) */
export function instrumentSets(): string[][] {
  const all = ids(instruments)
  const sets: string[][] = all.map((i) => [i])
  for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) sets.push([all[a], all[b]])
  return sets
}

export const slotOptions = (): Record<Exclude<Slot, 'instruments'>, (string | number)[]> => ({
  solar: ids(solarPanels),
  battery: ids(batteries),
  radio: ids(radios),
  computer: ids(computers),
  attitude: ids(attitudeControls),
  propulsion: ids(propulsionSystems),
  orbit: ids(lunarOrbits),
  ride: ids(rides),
  transfer: ids(transfers),
  groundStation: ids(groundStations),
  testTurns: [0, 1, 2, 3],
  reservePercent: [0, 5, 10, 15, 20],
})

/** The value a design takes in a slot, as a label */
export function slotValue(d: Design, slot: Slot): string {
  if (slot === 'instruments') return [...d.instruments].sort().join('+')
  if (slot === 'testTurns') return String(d.planning.testTurns)
  if (slot === 'reservePercent') return String(d.planning.reservePercent)
  return String(d[slot])
}

/** The architecture: what makes two winning designs genuinely different missions */
export function architecture(d: Design): string {
  const ice: string[] = d.instruments.filter((i) => i === 'inst-laser' || i === 'inst-neutron').sort()
  const extra = d.instruments.filter((i) => !ice.includes(i)).sort()
  const prop = d.propulsion.startsWith('prop-ion') ? 'ion' : d.propulsion.startsWith('prop-chemical') ? 'chem' : d.propulsion
  return [
    ice.map((i) => i.replace('inst-', '')).join('+') + (extra.length ? `(+${extra.map((i) => i.replace('inst-', '')).join('+')})` : ''),
    prop,
    d.orbit.replace('orbit-', ''),
    d.ride.replace('ride-', ''),
    d.transfer.replace('transfer-', ''),
  ].join(' / ')
}

/** Every hardware design, with the ground station's own best hours and a given plan */
export function* hardwareDesigns(planning: { testTurns: number; reservePercent: number }): Generator<Design> {
  const o = slotOptions()
  for (const inst of instrumentSets())
    for (const solar of o.solar)
      for (const battery of o.battery)
        for (const radio of o.radio)
          for (const computer of o.computer)
            for (const attitude of o.attitude)
              for (const propulsion of o.propulsion)
                for (const orbit of o.orbit)
                  for (const ride of o.ride)
                    for (const transfer of o.transfer)
                      for (const station of groundStations)
                        for (const hours of contactHourChoices(station.id))
                          yield {
                            planning: { buildTurns: 0, ...planning },
                            instruments: inst,
                            structure: 'bus-6u',
                            solar: String(solar),
                            battery: String(battery),
                            radio: String(radio),
                            computer: String(computer),
                            attitude: String(attitude),
                            propulsion: String(propulsion),
                            orbit: String(orbit),
                            ride: String(ride),
                            transfer: String(transfer),
                            groundStation: station.id,
                            contactHours: hours,
                          }
}

/** Contact hours worth trying on a station: its default and its most */
export function contactHourChoices(stationId: string): number[] {
  const s = groundStations.find((g) => g.id === stationId)!
  return [...new Set([s.defaultHours, s.contactHoursPerDay])]
}

/** Can fly and can meet the brief on paper */
export function viable(d: Design): boolean {
  const b = computeBudgets(d, 'engineer')
  const r = goNoGo(d, b)
  return r.canGo && r.checks.find((c) => c.resource === 'Science')?.status === 'green'
}

/** Every design one choice away from `d` (each other option in each hardware slot, and each instrument set) */
export function singleChanges(d: Design): Design[] {
  const o = slotOptions()
  const out: Design[] = []
  for (const inst of instrumentSets()) if (slotValue({ ...d, instruments: inst }, 'instruments') !== slotValue(d, 'instruments')) out.push({ ...d, instruments: inst })
  const hw = ['solar', 'battery', 'radio', 'computer', 'attitude', 'propulsion', 'orbit', 'ride', 'transfer', 'groundStation'] as const
  for (const s of hw) for (const v of o[s]) if (v !== d[s]) out.push({ ...d, [s]: String(v), ...(s === 'groundStation' ? { contactHours: undefined } : {}) })
  return out
}

/** How many single changes from `d` still fly (Go), and how many there are */
export function singleChangeGo(d: Design): { go: number; total: number } {
  const all = singleChanges(d)
  return { go: all.filter((x) => goNoGo(x, computeBudgets(x, 'engineer')).canGo).length, total: all.length }
}

/** Share of flights that fully succeed, over seeds 1..n */
export function winRate(d: Design, n: number, seed0 = 1): number {
  let ok = 0
  for (let s = seed0; s < seed0 + n; s++) if (buildReport(runSimulation(d, 'engineer', s)).outcome === 'success') ok++
  return ok / n
}

export interface BalanceReport {
  hardware: number
  viable: number
  winners: number
  architectures: Map<string, { count: number; best: number }>
  /** per slot, per option: viable designs, winning designs and the best win rate */
  options: Record<Slot, Record<string, { viable: number; winners: number; best: number }>>
  best: { rate: number; design?: Design }
}

/**
 * Every viable hardware design at the given plans, flown `seeds` times each.
 * `keep` can thin the viable set (e.g. every k-th design) to keep a run short.
 */
export function balanceRun(opts: {
  plans: { testTurns: number; reservePercent: number }[]
  seeds: number
  /** Fly each viable design this many times first; only the promising ones get the full `seeds` */
  screenSeeds?: number
  keep?: (index: number) => boolean
}): BalanceReport {
  const slots: Slot[] = ['instruments', 'solar', 'battery', 'radio', 'computer', 'attitude', 'propulsion', 'orbit', 'ride', 'transfer', 'groundStation', 'testTurns', 'reservePercent']
  const options = Object.fromEntries(slots.map((s) => [s, {}])) as BalanceReport['options']
  const o = slotOptions()
  for (const s of slots) {
    const values = s === 'instruments' ? instrumentSets().map((i) => [...i].sort().join('+')) : o[s].map(String)
    for (const v of values) options[s][v] = { viable: 0, winners: 0, best: 0 }
  }
  const report: BalanceReport = { hardware: 0, viable: 0, winners: 0, architectures: new Map(), options, best: { rate: 0 } }
  let index = 0
  for (const plan of opts.plans) {
    for (const d of hardwareDesigns(plan)) {
      report.hardware++
      if (!viable(d)) continue
      if (opts.keep && !opts.keep(index++)) continue
      report.viable++
      const screen = opts.screenSeeds ? winRate(d, opts.screenSeeds) : 1
      const rate = screen >= WIN_RATE - 0.25 ? winRate(d, opts.seeds) : screen
      const won = rate >= WIN_RATE
      if (won) report.winners++
      if (rate > report.best.rate) report.best = { rate, design: d }
      for (const s of slots) {
        const cell = options[s][slotValue(d, s)]
        if (!cell) continue
        cell.viable++
        if (won) cell.winners++
        cell.best = Math.max(cell.best, rate)
      }
      if (won) {
        const a = architecture(d)
        const prev = report.architectures.get(a) ?? { count: 0, best: 0 }
        report.architectures.set(a, { count: prev.count + 1, best: Math.max(prev.best, rate) })
      }
    }
  }
  return report
}

export function formatReport(r: BalanceReport): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`
  const lines = [
    `hardware designs ${r.hardware}, viable ${r.viable}, winners ${r.winners} (win = full success in >= ${pct(WIN_RATE)} of flights)`,
    `best win rate ${pct(r.best.rate)}`,
    `distinct winning architectures: ${r.architectures.size}`,
    ...[...r.architectures.entries()].sort((a, b) => b[1].count - a[1].count).map(([a, v]) => `  ${a}: ${v.count} designs, best ${pct(v.best)}`),
    'per option (viable / winners / best win rate):',
  ]
  for (const [slot, opts] of Object.entries(r.options)) {
    lines.push(`  ${slot}`)
    for (const [v, c] of Object.entries(opts)) lines.push(`    ${v.padEnd(36)} ${String(c.viable).padStart(6)} ${String(c.winners).padStart(6)}  ${pct(c.best)}`)
  }
  return lines.join('\n')
}
