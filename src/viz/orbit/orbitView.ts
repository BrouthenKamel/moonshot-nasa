import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { lunarOrbits } from '../../data/orbits'
import { getPartById, type InstrumentPart } from '../../data/parts'
import type { Difficulty } from '../../data/brief'
import type { BarStatus, CheckResult, Design } from '../../sim/types'

/**
 * Everything the orbit view shows, computed once per design from the game's own
 * rules (computeBudgets and goNoGo on a trial design per orbit). No React, no three.js.
 */

export type Tone = 'good' | 'warn' | 'bad'
/** How the passes paint the polar cap: lighting ice | too high (amber) | no ice instrument (grey). */
export type StripTone = 'ice' | 'blind' | 'none'

export interface OrbitCheck {
  resource: string
  status: BarStatus
  reason: string
}

export interface IceInstrument {
  id: string
  name: string
  maxAltitudeKm: number | null
  inRange: boolean
}

export interface OrbitOption {
  id: string
  shortName: string
  color: string
  description: string
  altitudeKm: number
  passesPerTurn: number
  passesLine: string
  sunlitPct: number
  eclipseHours: number
  earthPct: number
  holdDeltaV: number
  captureDeltaV: number | null
  deltaVAvailable: number
  upkeepTurns: number
  reachable: boolean
  batteryNeedWh: number
  batteryUsableWh: number
  batteryOk: boolean
  projectedCoverage: number
  bestIceRate: number
  iceInstruments: IceInstrument[]
  iceInRange: boolean
  stripTone: StripTone
  verdict: { tone: Tone; text: string }
  checks: OrbitCheck[]
}

export interface OrbitView {
  options: OrbitOption[]
  selectedId: string
  selected: OrbitOption
}

export const COVERAGE_GOAL = 70
export const MISSION_MONTHS = 12

export const ORBIT_LOOK: Record<string, { shortName: string; color: string }> = {
  'orbit-halo': { shortName: 'Halo Loop', color: '#a78bfa' },
  'orbit-elliptical': { shortName: 'Elliptical Polar', color: '#a3e635' },
  'orbit-100km': { shortName: 'Low Circular', color: '#38bdf8' },
}

const SHOWN_ALWAYS = ['Delta-v', 'Power', 'Science'] as const
const SHOWN_WHEN_NOT_GREEN = ['Budget', 'Data Link'] as const

function passesLine(passes: number): string {
  if (passes < 10) return 'About one pass a week.'
  if (passes < 200) return 'About five passes a day.'
  return 'One pass every two hours.'
}

interface VerdictInput {
  status: Record<string, BarStatus | undefined>
  captureDeltaV: number | null
  thrustLevel: number
  deltaVAvailable: number
  scienceDuty: number
  hasIce: boolean
  iceInRange: boolean
  projectedCoverage: number
}

/** The design doc's verdict table, first match wins. Red rows follow goNoGo's own order of tests. */
function verdictOf(v: VerdictInput): { tone: Tone; text: string } {
  const s = v.status
  if (s['Delta-v'] === 'red') {
    if (v.captureDeltaV === null) return { tone: 'bad', text: 'CANNOT REACH THIS ORBIT' }
    if (v.thrustLevel === 0) return { tone: 'bad', text: 'NO POWER TO FLY THERE' }
    if (v.deltaVAvailable < v.captureDeltaV) return { tone: 'bad', text: 'NOT ENOUGH FUEL TO GET IN' }
    return { tone: 'bad', text: 'CANNOT HOLD THE ORBIT' }
  }
  if (s['Power'] === 'red') {
    if (v.scienceDuty <= 0) return { tone: 'bad', text: 'NO POWER FOR THE INSTRUMENTS' }
    return { tone: 'bad', text: 'BATTERY TOO SMALL FOR THE SHADOW' }
  }
  if (s['Budget'] === 'red') return { tone: 'bad', text: 'OVER BUDGET WITH THIS ORBIT' }
  if (s['Data Link'] === 'red') return { tone: 'bad', text: 'NOTHING CAN BE SENT HOME' }
  if (!v.hasIce) return { tone: 'warn', text: 'NO ICE INSTRUMENT ON BOARD' }
  if (!v.iceInRange) return { tone: 'warn', text: 'TOO HIGH FOR THE ICE INSTRUMENTS' }
  if (v.projectedCoverage < COVERAGE_GOAL) return { tone: 'warn', text: 'MAPS TOO SLOWLY' }
  if (s['Science'] === 'yellow') return { tone: 'warn', text: 'TOO LITTLE DATA SENT HOME' }
  if (s['Delta-v'] === 'yellow') return { tone: 'warn', text: 'LITTLE FUEL TO SPARE' }
  if (s['Power'] === 'yellow') return { tone: 'warn', text: 'POWER LIMITS THE SCIENCE' }
  if (s['Budget'] === 'yellow') return { tone: 'warn', text: 'EATS INTO THE RESERVE' }
  if (s['Data Link'] && s['Data Link'] !== 'green') return { tone: 'warn', text: 'DATA LINK NEARLY FULL' }
  return { tone: 'good', text: 'GOOD MAPPING ORBIT' }
}

function pickChecks(all: CheckResult[]): OrbitCheck[] {
  const out: OrbitCheck[] = []
  const add = (c: CheckResult | undefined) => c && out.push({ resource: c.resource, status: c.status, reason: c.reason })
  for (const name of SHOWN_ALWAYS) add(all.find((c) => c.resource === name))
  for (const name of SHOWN_WHEN_NOT_GREEN) {
    const c = all.find((x) => x.resource === name)
    if (c && c.status !== 'green') add(c)
  }
  return out
}

export function buildOrbitView(design: Design, difficulty: Difficulty): OrbitView {
  const instruments = design.instruments
    .map((id) => getPartById(id) as InstrumentPart | undefined)
    .filter((i): i is InstrumentPart => !!i && i.category === 'instrument')
  const ice = instruments.filter((i) => i.seesShadow)

  const options: OrbitOption[] = lunarOrbits.map((orbit) => {
    const trial: Design = { ...design, orbit: orbit.id }
    const b = computeBudgets(trial, difficulty)
    const all = goNoGo(trial, b).checks
    const status: Record<string, BarStatus | undefined> = {}
    for (const c of all) status[c.resource] = c.status

    const iceInstruments: IceInstrument[] = ice.map((i) => ({
      id: i.id,
      name: i.name,
      maxAltitudeKm: i.maxAltitudeKm,
      inRange: i.maxAltitudeKm === null || orbit.altitude <= i.maxAltitudeKm,
    }))
    const iceInRange = iceInstruments.some((i) => i.inRange)
    const bestIceRate = ice.reduce((m, i) => Math.max(m, b.coverageRate[i.id] ?? 0), 0)
    const reachable = b.captureDeltaV !== null && b.thrustLevel > 0 && b.deltaVAvailable >= b.captureDeltaV
    const look = ORBIT_LOOK[orbit.id] ?? { shortName: orbit.name, color: '#e2e8f0' }

    return {
      id: orbit.id,
      shortName: look.shortName,
      color: look.color,
      description: orbit.description,
      altitudeKm: orbit.altitude,
      passesPerTurn: orbit.passesPerTurn,
      passesLine: passesLine(orbit.passesPerTurn),
      sunlitPct: Math.round(orbit.sunlitShare * 100),
      eclipseHours: orbit.eclipseHours,
      earthPct: Math.round(orbit.earthVisible * 100),
      holdDeltaV: b.deltaVStationKeeping,
      captureDeltaV: b.captureDeltaV,
      deltaVAvailable: b.deltaVAvailable,
      upkeepTurns: b.upkeepTurns,
      reachable,
      batteryNeedWh: b.batteryNeedWh,
      batteryUsableWh: b.batteryUsableWh,
      batteryOk: b.batteryOk,
      projectedCoverage: b.projectedCoverage,
      bestIceRate,
      iceInstruments,
      iceInRange,
      stripTone: iceInstruments.length === 0 ? 'none' : iceInRange ? 'ice' : 'blind',
      verdict: verdictOf({
        status,
        captureDeltaV: b.captureDeltaV,
        thrustLevel: b.thrustLevel,
        deltaVAvailable: b.deltaVAvailable,
        scienceDuty: b.scienceDuty,
        hasIce: iceInstruments.length > 0,
        iceInRange,
        projectedCoverage: b.projectedCoverage,
      }),
      checks: pickChecks(all),
    }
  })

  const selected = options.find((o) => o.id === design.orbit) ?? options[0]
  return { options, selectedId: selected.id, selected }
}

const clampMonths = (m: number) => Math.max(0, Math.min(MISSION_MONTHS, m))

/**
 * Ice mapped (%) after `months` of the time-lapse. An illustration scaled so that
 * month 12 equals the game's projectedCoverage; not a second simulation.
 */
export function coverageAt(o: OrbitOption, months: number): number {
  const m = clampMonths(months)
  if (!o.reachable || o.bestIceRate <= 0 || m <= 0) return 0
  if (o.bestIceRate >= 1) return o.projectedCoverage
  const keep = 1 - o.bestIceRate
  return (o.projectedCoverage * (1 - keep ** m)) / (1 - keep ** MISSION_MONTHS)
}

/** How many pass strips the polar cap shows after `months`. */
export function stripCount(o: OrbitOption, months: number): number {
  if (!o.reachable) return 0
  const m = clampMonths(months)
  if (o.stripTone === 'ice') {
    const c = Math.min(coverageAt(o, m), 99.5)
    return Math.min(600, Math.round(-Math.log(1 - c / 100) / 0.02))
  }
  return Math.min(300, Math.round(o.passesPerTurn * m))
}
