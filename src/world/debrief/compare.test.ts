import { describe, expect, it } from 'vitest'
import type { Insight } from '../../minigames/contract'
import { computeBudgets } from '../../sim/budgets'
import { buildReport } from '../../sim/evaluate'
import { archetypes, flashlightDesign, iceCubeDesign } from '../../sim/fixtures'
import { runSimulation } from '../../sim/simulate'
import type { Design, TurnLog } from '../../sim/types'
import { compareFlight, decisiveLine, explainOutcome, flightFacts, roomToRedesign, type FlightRecord, type SubsystemId } from './compare'

const fly = (design: Design, seed = 1): FlightRecord => {
  const s = runSimulation(design, 'engineer', seed)
  return { report: buildReport(s), turnLogs: s.turnLogs, events: s.allEvents }
}
const line = (lines: ReturnType<typeof compareFlight>, id: SubsystemId) => lines.find((l) => l.id === id)!
const insight = (id: string, room: Insight['room'], value: number, unit: string): Insight => ({ id, room, text: id, metric: { label: id, value, unit } })

/** Insights as the seven mini games write them for the flashlight design */
const FLASHLIGHT_INSIGHTS: Insight[] = [
  insight('reserve-set', 'briefing', 10, '%'),
  insight('bench-inst-laser', 'science-lab', 86, '%'),
  insight('power-margin', 'clean-room', 12, 'W'),
  insight('eclipse-min-charge', 'thermal-vac', 31, '%'),
  insight('test-campaigns', 'thermal-vac', 3, 'of 5'),
  insight('orbit-coverage', 'flight-dynamics', 80, '%'),
  insight('orbit-dv-margin', 'flight-dynamics', 246, 'm/s'),
  insight('transfer-time', 'flight-dynamics', 4, 'months'),
  insight('pass-downlink', 'ground-station', 3, 'MB/day'),
  insight('ride-wait', 'launch-hangar', 2, 'months'),
]

describe('compareFlight: predicted vs actual per subsystem', () => {
  it('gives one line per subsystem, in the order the craft meets them', () => {
    const lines = compareFlight(FLASHLIGHT_INSIGHTS, fly(flashlightDesign))
    expect(lines.map((l) => l.id)).toEqual(['schedule', 'reliability', 'fuel', 'transfer', 'power', 'data', 'coverage', 'reserve'])
  })

  it('a clean success: every prediction held, quoted back with the real number', () => {
    const rec = fly(flashlightDesign, 1)
    expect(rec.report.outcome).toBe('success')
    const lines = compareFlight(FLASHLIGHT_INSIGHTS, rec)
    expect(lines.every((l) => l.verdict === 'held')).toBe(true)
    const power = line(lines, 'power')
    expect(power.line).toBe('In the Thermal-Vac Chamber you kept 31% charge through the eclipse. In orbit the battery never ran flat in 12 months.')
    expect(power.predicted).toEqual({ value: 31, unit: '%' })
    const fuel = line(lines, 'fuel')
    expect(fuel.line).toMatch(/^In Flight Dynamics you predicted 246 m\/s of fuel to spare after the capture burn\. After the real capture burn you had \d+ m\/s left\.$/)
    expect(fuel.actual?.value).toBe(Math.round(rec.turnLogs.find((l) => l.phase === 'capture')!.fuelRemaining))
    const data = line(lines, 'data')
    expect(data.actual?.value).toBeCloseTo(rec.report.dataReturned / (rec.report.turnsInOrbit * 30), 1)
    expect(line(lines, 'coverage').actual?.value).toBe(Math.round(rec.report.coverageAchieved))
    expect(roomToRedesign(rec.report, lines)).toBeNull()
  })

  it('without the experiment there is no prediction, but the flight number is still shown', () => {
    const lines = compareFlight([], fly(flashlightDesign))
    for (const l of lines) expect(l.predicted).toBeNull()
    expect(line(lines, 'data').line).toMatch(/^You did not run the Ground Station experiment.*In orbit you averaged/)
    expect(line(lines, 'data').actual).not.toBeNull()
  })

  it('falls back to the Clean Room power margin when the Thermal-Vac was skipped', () => {
    const lines = compareFlight([insight('power-margin', 'clean-room', 12, 'W')], fly(flashlightDesign))
    expect(line(lines, 'power').room).toBe('clean-room')
    expect(line(lines, 'power').line).toMatch(/^In the Clean Room the bus ran with 12 W to spare/)
  })

  it('long eclipses show up as months in safe mode, and point to the battery', () => {
    const rec = fly(archetypes.express, 1)
    expect(rec.events.filter((e) => e.eventId === 'long-eclipse').length).toBe(3)
    const power = line(compareFlight([], rec), 'power')
    expect(power.verdict).toBe('worse')
    expect(power.actual).toEqual({ value: 3, unit: 'months in safe mode' })
    expect(power.line).toContain('3 long eclipses drained the battery')
  })

  it('a craft that cannot brake into orbit: fuel decides it, the rest was never tested', () => {
    const rec = fly({ ...flashlightDesign, propulsion: 'prop-coldgas' }, 1)
    expect(rec.report.outcome).toBe('failed')
    const lines = compareFlight([insight('orbit-dv-margin', 'flight-dynamics', -5, 'm/s')], rec)
    const fuel = line(lines, 'fuel')
    expect(fuel.verdict).toBe('worse')
    expect(fuel.actual!.value).toBeLessThan(0)
    expect(fuel.line).toContain('short, so the craft could not brake into orbit')
    for (const id of ['power', 'data', 'coverage'] as const) expect(line(lines, id).verdict).toBe('untested')
    expect(decisiveLine(rec.report, lines)?.id).toBe('fuel')
    expect(roomToRedesign(rec.report, lines)).toBe('flight-dynamics')
    const why = explainOutcome(rec.report, lines)
    expect(why.headline).toBe('It failed: not enough delta-v left to capture. The fuel decided it.')
    expect(why.reasons[0]).toMatch(/^Fuel \(Δv\): The capture burn needs more Δv/)
  })

  it('lost contact after deployment is blamed on testing, even when other things went wrong', () => {
    const rec = fly(iceCubeDesign, 3)
    expect(rec.report.outcomeReason).toMatch(/^Lost contact/)
    const lines = compareFlight([insight('test-campaigns', 'thermal-vac', 1, 'of 5')], rec)
    expect(line(lines, 'reliability').line).toContain('the craft went silent after deployment')
    expect(decisiveLine(rec.report, lines)?.id).toBe('reliability')
    expect(roomToRedesign(rec.report, lines)).toBe('thermal-vac')
    expect(line(lines, 'fuel').verdict).toBe('untested')
  })

  it('an instrument blind in the dark: the ice map decides it, with the sim cause as the why', () => {
    const rec = fly(iceCubeDesign, 1)
    const lines = compareFlight([insight('bench-inst-ir-spec', 'science-lab', 0, '%')], rec)
    const cov = line(lines, 'coverage')
    expect(cov.verdict).toBe('worse')
    expect(cov.room).toBe('science-lab')
    expect(cov.why).toContain('cannot see much ice in the dark')
    expect(cov.why).toContain('your best instrument found 0% of the ice in shadow')
    expect(explainOutcome(rec.report, lines).headline).toMatch(/The ice map decided it\.$/)
  })

  it('a missed ride: launched late, with the late parts named', () => {
    const rec = fly(flashlightDesign)
    const rideTurn = computeBudgets(flashlightDesign, 'engineer').rideTurn
    // The same flight, but every phase after the build shifted two months later
    const turnLogs: TurnLog[] = [
      ...rec.turnLogs.slice(0, rideTurn - 1).map((l) => ({ ...l, phase: 'build' as const })),
      { ...rec.turnLogs[0], turn: rideTurn, phase: 'wait' },
      { ...rec.turnLogs[0], turn: rideTurn + 1, phase: 'wait' },
      ...rec.turnLogs.slice(rideTurn - 1).map((l) => ({ ...l, turn: l.turn + 2 })),
    ]
    const events = [{ eventId: 'build-delay' as const, turn: 3, phase: 'build' as const, impact: { deltavLost: 0, powerLost: 0, dataLost: 0, turnsLost: 2, reserveSpent: 0 } }]
    const s = line(compareFlight([insight('ride-wait', 'launch-hangar', 1, 'months')], { ...rec, turnLogs, events }), 'schedule')
    expect(s.verdict).toBe('worse')
    expect(s.line).toBe(`In the Launch Hangar the craft was due 1 month before your ride left. It missed the ride and launched 2 months late, in month ${rideTurn + 2}.`)
    expect(s.why).toMatch(/^1 late part pushed the build/)
  })

  it('an overdrawn reserve is a miss, quoting what was spent', () => {
    const rec = fly(flashlightDesign)
    const turnLogs = rec.turnLogs.map((l, i, all) => (i === all.length - 1 ? { ...l, reserveRemaining: -1.5 } : l))
    const events = [{ eventId: 'thruster' as const, turn: 9, phase: 'transfer' as const, impact: { deltavLost: 0, powerLost: 0, dataLost: 0, turnsLost: 1, reserveSpent: 4 } }]
    const report = { ...rec.report, requirements: rec.report.requirements.map((r) => (r.id === 'budget' ? { ...r, met: false } : r)) }
    const r = line(compareFlight([insight('reserve-set', 'briefing', 5, '%')], { report, turnLogs, events }), 'reserve')
    expect(r.verdict).toBe('worse')
    expect(r.line).toBe('In the Briefing Room you locked 5% of the budget away for surprises. In flight you spent 4 M of it on rescues and overdrew it by 1.5 M.')
    expect(r.actual).toEqual({ value: -1.5, unit: 'M left' })
  })

  it('a success with a hiccup says why it still worked', () => {
    const rec = fly(archetypes.express, 7)
    expect(rec.report.outcome).toBe('success')
    const lines = compareFlight([], rec)
    const why = explainOutcome(rec.report, lines)
    expect(why.headline).toBe('It worked: the ice map, downlink and fuel came out the way your experiments said.')
    expect(why.reasons.some((r) => r.startsWith('Power:') && r.endsWith('It cost points, but not the mission.'))).toBe(true)
  })
})

describe('flightFacts', () => {
  it('reads launch, capture and trip length from the turn logs', () => {
    const rec = fly(flashlightDesign)
    const f = flightFacts(rec)
    expect(f.launched).toBe(true)
    expect(f.captured).toBe(true)
    expect(f.transferMonths).toBe(f.captureTurn! - f.launchTurn!)
    expect(f.scienceMonths).toBe(rec.report.turnsInOrbit)
  })

  it('a flight that never left the ground has nothing to compare', () => {
    const rec = fly(flashlightDesign)
    const turnLogs = rec.turnLogs.slice(0, 3)
    const report = { ...rec.report, turnsInOrbit: 0, requirements: rec.report.requirements.map((r) => ({ ...r, met: false })) }
    const f = flightFacts({ report, turnLogs, events: [] })
    expect(f.launched).toBe(false)
    expect(f.fuelAfterCapture).toBeNull()
    const lines = compareFlight([], { report, turnLogs, events: [] })
    expect(line(lines, 'schedule').verdict).toBe('untested')
    expect(line(lines, 'transfer').verdict).toBe('untested')
  })
})
