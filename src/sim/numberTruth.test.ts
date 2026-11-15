import { describe, it, expect } from 'vitest'
import { computeBudgets, linkLoss, newScienceState, scienceTurn } from './budgets'
import { goNoGo, PLANNING_BUILDING } from './checks'
import { buildReport, endingSentence } from './evaluate'
import { runSimulation } from './simulate'
import { flashlightDesign, iceCubeDesign } from './fixtures'
import { storageFlow } from '../scene/interaction/reactions'
import { failedLine } from '../game/result'
import { buildingForStep, buildingName } from '../viz/missionMap'
import { modelConstants as C } from '../data/brief'
import type { Budgets, SimState } from './types'

/**
 * Number truth (QC, 15 Nov): two screens that show the same number must agree.
 * One test per contradiction the QC playtests found.
 */

const base = computeBudgets(flashlightDesign, 'engineer')
const checkOf = (b: Budgets, resource: string) => goNoGo(flashlightDesign, b).checks.find((c) => c.resource === resource)!

describe('1. data loss: the Comms tray and the Data Link check use the simulation’s model', () => {
  // The QC case: 1500 MB made, 518 carried, 300 MB storage
  const b: Budgets = { ...base, dataPerTurn: 1500, downlinkPerTurn: 518, storageCapacity: 300 }

  it('the simulation loses made − carried every month once storage is full', () => {
    const st = newScienceState(flashlightDesign.instruments)
    // scienceTurn reads the instruments' own data rate; scale the link so the ratio is the QC case
    const made = scienceTurn(flashlightDesign, { ...b, downlinkPerTurn: 0, storageCapacity: 0 }, newScienceState(flashlightDesign.instruments)).made
    const sim: Budgets = { ...b, downlinkPerTurn: made * (518 / 1500), storageCapacity: made * (300 / 1500) }
    let last = 0
    for (let i = 0; i < 6; i++) last = scienceTurn(flashlightDesign, sim, st).lost
    expect(last).toBeCloseTo(linkLoss(made, sim.downlinkPerTurn, sim.storageCapacity).lostPerMonth, 6)
  })

  it('the tray and the Data Link text name the same MB and share', () => {
    const flow = storageFlow(b.dataPerTurn, b.downlinkPerTurn, b.storageCapacity)
    const reason = checkOf(b, 'Data Link').reason
    expect(Math.round(flow.lostPerMonth)).toBe(982)
    expect(Math.round(flow.spill * 100)).toBe(65)
    expect(reason).toContain(`${Math.round(flow.lostPerMonth)} MB a month (${Math.round(flow.spill * 100)}% of the science) is lost`)
  })
})

/** A finished flight of the starting design, then ended the way a test needs */
const flown = runSimulation(iceCubeDesign, 'engineer', 7)
const endedAs = (end: string, patch: Partial<SimState['flight']> = {}): SimState => ({
  ...flown,
  phase: 'failed',
  flight: { ...flown.flight, end, alive: false, ...patch },
})

describe('2. a failed mission: the money note and Budget Compliance tell the same story', () => {
  it('both say the unspent money is not returned (Jakob, 15 Nov: a failure spends its whole budget)', () => {
    const r = buildReport(endedAs('budget ran out in orbit', { main: 3.4, reserve: 0 }))
    expect(r.outcome).toBe('failed')
    const note = r.scoreNotes.find((n) => n.startsWith('Money left'))!
    expect(note).toContain('Money left 0/')
    expect(note).toContain('spends its whole budget')
    const budget = r.requirements.find((x) => x.id === 'budget')!
    expect(budget.reason).toContain('3.4 M was unspent when the mission failed')
    expect(budget.reason).toContain('spends its whole budget')
    expect(budget.reason).not.toContain('M left')
  })
})

describe('3. the base dialog names the same end as the report', () => {
  it('a mission out of money in orbit does not say the spacecraft was lost', () => {
    const s = endedAs('budget ran out in orbit')
    const report = buildReport(s)
    const line = failedLine(s.flight.end, true, 0)
    expect(report.outcomeReason.startsWith(endingSentence(s.flight.end))).toBe(true)
    expect(line.startsWith(endingSentence(s.flight.end))).toBe(true)
    expect(line).not.toContain('was lost')
  })

  it('a craft that lost contact is called lost', () => {
    expect(failedLine('lost contact after deployment', true, 0)).toContain('The spacecraft was lost')
  })

  it('the report names only instruments that are on board', () => {
    // QC saw "The IR spectrometer cannot see into the shadowed craters" in a run without one: does not reproduce
    const cameraOnly = { ...flown, design: { ...flown.design, instruments: ['inst-camera'] } }
    const causes = buildReport(cameraOnly).requirements.find((x) => x.id === 'coverage')!.causes.join(' ')
    expect(causes).not.toMatch(/IR spectrometer cannot/)
    const none = { ...flown, design: { ...flown.design, instruments: [] } }
    expect(buildReport(none).requirements.find((x) => x.id === 'coverage')!.causes[0]).toMatch(/^No instrument was on board/)
  })
})

describe('4. months in orbit never reads as more than the target for 0 points', () => {
  it('says all the science months were flown, and why they scored nothing', () => {
    const s: SimState = { ...flown, flight: { ...flown.flight, scienceTurns: 21, coverage: 0 } }
    const note = buildReport(s).scoreNotes.find((n) => n.startsWith('Months in orbit'))!
    expect(note).not.toMatch(/21 of 12/)
    expect(note).toContain('all 12 science months flown (21 with the extended mission)')
    expect(note).toContain('score only for the ice they mapped')
  })
})

describe('5. the long-eclipse check shows its numbers', () => {
  it('the Power row gives the Wh needed and available, the same figures batteryLongOk compares', () => {
    const b: Budgets = { ...base, batteryOk: true, scienceDuty: 1, batteryLongOk: false, batteryUsableWh: 20, batteryLongNeedWh: 30 }
    const c = checkOf(b, 'Power')
    expect(c.status).toBe('yellow')
    expect(c.reason).toContain(`${C.longEclipseHours} hours of shadow need 30 Wh, the battery gives 20 Wh`)
    expect(base.batteryLongOk).toBe(base.batteryUsableWh >= base.batteryLongNeedWh)
  })
})

describe('6. the Budget check names the building where the reserve is set', () => {
  it('is the Planning step’s building on the base map', () => {
    expect(PLANNING_BUILDING).toBe(buildingName(buildingForStep('planning')))
    const b: Budgets = { ...base, totalCost: base.spendable + 0.5, budgetCap: base.spendable + 5 }
    const reason = checkOf(b, 'Budget').reason
    expect(reason).toContain(`Lower the reserve at the ${PLANNING_BUILDING} (Planning)`)
    expect(reason).not.toContain('Comms Center')
  })
})
