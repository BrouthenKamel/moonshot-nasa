import type { Difficulty } from '../../data/brief'
import { modelConstants as C, turnConstants } from '../../data/brief'
import { getOrbitById } from '../../data/orbits'
import { getPartById, type InstrumentPart } from '../../data/parts'
import { computeBudgets } from '../../sim/budgets'
import { estimateSuccess } from '../../sim/odds'
import type { Design } from '../../sim/types'

/**
 * Eclipse Survival: pure energy model of the thermal-vac chamber.
 *
 * Mirrors src/sim/budgets.ts `computeBudgets`:
 *  - generation = powerGenerated (solar part, full sun)
 *  - load       = busPower (heater + computer + attitude + radio listen) + the instruments' |power|
 *                 (the same `eclipsePowerConsumed` the Go / No-Go battery check uses)
 *  - eclipse    = orbit.eclipseHours per orbit (the `batteryNeedWh` window)
 *  - battery    = capacity Wh, of which only `usableBatteryShare` (C.usableBatteryShare = 0.8) may be used,
 *                 so the floor is 20% state of charge (`batteryUsableWh`).
 * The sim only checks one eclipse, so the chamber time-steps three orbits with the same numbers.
 * The orbit period is not in the data: it follows from sunlitShare (period = eclipseHours / (1 - sunlitShare)).
 */

export const ORBITS = 3
/** Orbit period when the orbit has no eclipse (halo loop) */
export const FALLBACK_PERIOD_H = 4
/** Chamber clock: seconds of play per simulated hour. Sunlit time fast-forwards, the eclipse runs slow. */
export const SEC_PER_HOUR_SUN = 1.5
export const SEC_PER_HOUR_ECLIPSE = 10

export interface Load {
  id: string
  label: string
  watts: number
  /** Switched on when the test starts */
  startsOn: boolean
}

export interface EnergyModel {
  generationW: number
  /** Always-on bus draw (heater, computer, attitude, radio listen) */
  busW: number
  loads: Load[]
  capacityWh: number
  /** Floor as % of capacity: (1 - usable share) * 100 */
  floorPct: number
  periodH: number
  eclipseH: number
  orbits: number
  orbitName: string
}

export function buildModel(design: Design, difficulty: Difficulty): EnergyModel {
  const b = computeBudgets(design, difficulty)
  const orbit = getOrbitById(design.orbit)
  const eclipseH = orbit?.eclipseHours ?? 0
  const sunlit = orbit?.sunlitShare ?? 1
  const periodH = eclipseH > 0 && sunlit < 1 ? eclipseH / (1 - sunlit) : FALLBACK_PERIOD_H
  const loads: Load[] = []
  for (const id of design.instruments) {
    const inst = getPartById(id) as InstrumentPart | undefined
    if (inst) loads.push({ id, label: inst.name, watts: Math.abs(inst.power), startsOn: true })
  }
  if (b.transmitExtraPower > 0) {
    loads.push({ id: 'downlink', label: 'Downlink burst', watts: b.transmitExtraPower, startsOn: false })
  }
  return {
    generationW: b.powerGenerated,
    busW: b.busPower,
    loads,
    capacityWh: b.batteryCapacity,
    floorPct: (1 - C.usableBatteryShare) * 100,
    periodH,
    eclipseH,
    orbits: ORBITS,
    orbitName: orbit?.name ?? 'Unknown orbit',
  }
}

export interface EnergyState {
  tH: number
  energyWh: number
  /** Lowest state of charge reached so far, % of capacity */
  minPct: number
  /** Battery fell under the floor */
  dead: boolean
  /** Three orbits survived */
  done: boolean
}

export const totalHours = (m: EnergyModel) => m.orbits * m.periodH
export const sunlitHours = (m: EnergyModel) => m.periodH - m.eclipseH

export function initialState(m: EnergyModel): EnergyState {
  return { tH: 0, energyWh: m.capacityWh, minPct: 100, dead: false, done: false }
}

/** Each orbit starts sunlit, then the eclipse. */
export function phaseAt(m: EnergyModel, tH: number): { orbit: number; eclipse: boolean; nextBoundaryH: number } {
  const orbit = Math.min(m.orbits - 1, Math.floor(tH / m.periodH + 1e-9))
  const local = tH - orbit * m.periodH
  const sun = sunlitHours(m)
  if (local < sun - 1e-9) return { orbit, eclipse: false, nextBoundaryH: orbit * m.periodH + sun }
  return { orbit, eclipse: true, nextBoundaryH: (orbit + 1) * m.periodH }
}

export function loadWatts(m: EnergyModel, on: Readonly<Record<string, boolean>>): number {
  return m.busW + m.loads.reduce((s, l) => s + (on[l.id] ? l.watts : 0), 0)
}

/** Advance the battery by dtH simulated hours, splitting at lamp changes so the answer is exact. */
export function stepEnergy(m: EnergyModel, s: EnergyState, dtH: number, on: Readonly<Record<string, boolean>>): EnergyState {
  if (s.dead || s.done) return s
  let { tH, energyWh, minPct } = s
  const end = Math.min(totalHours(m), tH + dtH)
  const floorWh = (m.capacityWh * m.floorPct) / 100
  const load = loadWatts(m, on)
  let dead = false
  while (tH < end - 1e-12) {
    const ph = phaseAt(m, tH)
    const seg = Math.min(end, ph.nextBoundaryH) - tH
    if (seg <= 1e-12) {
      tH = end
      break
    }
    const net = (ph.eclipse ? 0 : m.generationW) - load
    const next = Math.min(m.capacityWh, energyWh + net * seg)
    if (next < floorWh) {
      // dies at the moment it crosses the floor
      const crossH = net < 0 ? (energyWh - floorWh) / -net : 0
      tH += Math.max(0, crossH)
      energyWh = floorWh
      minPct = Math.min(minPct, m.floorPct)
      dead = true
      break
    }
    energyWh = next
    tH += seg
    minPct = Math.min(minPct, (energyWh / m.capacityWh) * 100)
  }
  return { tH, energyWh, minPct, dead, done: !dead && tH >= totalHours(m) - 1e-9 }
}

export const socPct = (m: EnergyModel, s: EnergyState) => (m.capacityWh > 0 ? (s.energyWh / m.capacityWh) * 100 : 0)

/** Simulated hours that pass in `dtSec` of play in the given phase */
export function hoursForSeconds(eclipse: boolean, dtSec: number): number {
  return dtSec / (eclipse ? SEC_PER_HOUR_ECLIPSE : SEC_PER_HOUR_SUN)
}

/** Why it died, in numbers: what the dark needed against what the battery could give */
export function shortfall(m: EnergyModel, on: Readonly<Record<string, boolean>>) {
  const loadW = loadWatts(m, on)
  return {
    needWh: loadW * m.eclipseH,
    usableWh: (m.capacityWh * (100 - m.floorPct)) / 100,
    loadW,
  }
}

// ---- testing ---------------------------------------------------------------

/** Latent bugs in an untested craft; each campaign finds the share the sim's testFactor removes */
export const LATENT_BUGS = 10

/** Bugs found after n campaigns: testFactor (src/data/brief.ts) is the sim's failure-odds factor; 2.5 = nothing found */
export function bugsFound(testTurns: number): number {
  const t = Math.max(turnConstants.minTestTurns, Math.min(turnConstants.maxTestTurns, testTurns))
  const worst = C.testFactor[0]
  return Math.round(LATENT_BUGS * (1 - C.testFactor[t] / worst))
}

export interface TestOutcome {
  testTurns: number
  bugs: number
  /** Months until the craft is ready (computeBudgets.readyTurn * monthsPerTurn) */
  readyMonths: number
  /** Month the ride leaves */
  rideMonths: number
  /** Positive = slack, negative = late */
  marginMonths: number
  /** Chance of a full-success mission (src/sim/odds.ts estimateSuccess), 0-1 */
  success: number
}

export function withTestTurns(design: Design, testTurns: number): Design {
  return { ...design, planning: { ...design.planning, testTurns } }
}

/** Schedule cost from computeBudgets (readyTurn includes testTurns); odds from estimateSuccess (200 fixed-seed flights). */
export function testOutcome(design: Design, difficulty: Difficulty, testTurns: number, withOdds = true): TestOutcome {
  const d = withTestTurns(design, testTurns)
  const b = computeBudgets(d, difficulty)
  const mpt = turnConstants.monthsPerTurn
  return {
    testTurns,
    bugs: bugsFound(testTurns),
    readyMonths: b.readyTurn * mpt,
    rideMonths: b.rideTurn * mpt,
    marginMonths: b.timeMarginTurns * mpt,
    success: withOdds ? estimateSuccess(d, difficulty).success : 0,
  }
}
