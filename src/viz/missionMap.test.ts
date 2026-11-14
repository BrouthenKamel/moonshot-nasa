import { describe, it, expect } from 'vitest'
import { computeBudgets } from '../sim/budgets'
import { goNoGo } from '../sim/checks'
import { flashlightDesign } from '../sim/fixtures'
import type { Design, DesignStep } from '../sim/types'
import { runSimulation } from '../sim/simulate'
import { buildReport } from '../sim/evaluate'
import {
  BUILDING_STEPS,
  STEP_ORDER,
  buildingForStep,
  fixLocation,
  flightFeed,
  missionClockLabel,
  missionLabels,
  missionMonth,
  missionStatus,
  researchLabPulses,
  suggestedStep,
} from './missionMap'

const labelsFor = (design: Design = flashlightDesign, visited: DesignStep[] = []) => {
  const budgets = computeBudgets(design, 'engineer')
  return missionLabels({ design, budgets, checks: goNoGo(design, budgets), visited, sim: null })
}

describe('mission map', () => {
  it('maps every design step to one building', () => {
    for (const step of STEP_ORDER) expect(BUILDING_STEPS[buildingForStep(step)]).toContain(step)
    expect(buildingForStep('spacecraft')).toBe('factory')
    expect(buildingForStep('ride')).toBe('launch-site')
  })

  it('suggests the next unvisited step in order', () => {
    expect(suggestedStep([])).toBe('brief')
    expect(suggestedStep(['brief', 'planning'])).toBe('instruments')
    expect(suggestedStep(STEP_ORDER)).toBe('go-nogo')
  })

  it('labels show core numbers', () => {
    const l = labelsFor()
    expect(l.factory.status).toContain('13.2 / 14 kg') // 14.0 before the balance redesign (lighter chemical module)
    expect(l['research-lab'].status).toContain('74%')
    expect(l['launch-site'].status).toContain('month 8')
    // Time is the mission month, never a turn or a calendar day (DESIGN-DIRECTION 1a)
    for (const label of Object.values(l)) expect(label.status).not.toMatch(/\bturns?\b|\bdays?\b/i)
  })

  it('shows no building levels (MVP: no levels or upgrades)', () => {
    for (const label of Object.values(labelsFor())) expect(label).not.toHaveProperty('level')
  })

  // Jakob (I5b): point new players at the first lesson in the Research Lab
  it('the Research Lab pulses until the instruments step has been opened', () => {
    expect(researchLabPulses([], null)).toBe(true)
    expect(researchLabPulses(['brief', 'planning'], null)).toBe(true)
    expect(researchLabPulses(['brief', 'planning', 'instruments'], null)).toBe(false)
    expect(labelsFor(flashlightDesign, [])['research-lab'].pulse).toBe(true)
    expect(labelsFor(flashlightDesign, ['instruments'])['research-lab'].pulse).toBe(false)
    expect(labelsFor(flashlightDesign, [])['factory'].pulse).toBeFalsy()
    const sim = runSimulation(flashlightDesign, 'engineer', 1)
    expect(researchLabPulses([], sim)).toBe(false)
  })

  it('marks the building that fixes a red bar and highlights the suggested one', () => {
    const uhf = { ...flashlightDesign, radio: 'radio-uhf' }
    expect(labelsFor(uhf)['comms-center'].alert).toBe(true)
    expect(labelsFor(flashlightDesign, ['brief', 'planning'])['research-lab'].highlight).toBe(true)
  })

  it('says in words when there is no way into the orbit', () => {
    const noWay = { ...flashlightDesign, orbit: 'orbit-elliptical', transfer: 'transfer-direct', propulsion: 'prop-ion' }
    const status = labelsFor(noWay)['launch-site'].status
    expect(status).toContain('no way')
    expect(status).not.toMatch(/NaN|null|undefined/)
  })

  it('builds the mission log from the flight log, labelled by month', () => {
    const sim = runSimulation(flashlightDesign, 'engineer', 1)
    const feed = flightFeed(sim.turnLogs)
    const launch = feed.find((e) => e.title.startsWith('Launched'))!
    expect(launch.month).toBe(sim.flight.launchedTurn)
    expect(feed.every((e) => Number.isInteger(e.month))).toBe(true)
    // Newest first, and the end of the mission is in it
    expect(feed[0].month).toBe(Math.max(...feed.map((e) => e.month)))
    expect(feed.some((e) => /Mission over|Primary mission done|All requirements/.test(e.title))).toBe(true)
  })

  it('the mission clock is the mission month, from month 0', () => {
    expect(missionClockLabel(0)).toBe('month 0')
    expect(missionClockLabel(8)).toBe('month 8')
    expect(missionMonth(null)).toBe(0)
    const sim = runSimulation(flashlightDesign, 'engineer', 1)
    expect(missionMonth(sim)).toBe(sim.currentTurn)
  })

  it('the mission status in the top bar comes from the steps or the flight', () => {
    const budgets = computeBudgets(flashlightDesign, 'engineer')
    const done = runSimulation(flashlightDesign, 'engineer', 1)
    const over = missionStatus({ budgets, visited: [], sim: done })
    expect(['success', 'partial']).toContain(over.stage)
    expect(over.progress).toBe(1)
    expect(over.opens).toBe('report')
    const planning = missionStatus({ budgets, visited: ['brief', 'planning'], sim: null })
    expect(planning.stage).toBe('planning')
    expect(planning.progress).toBeCloseTo(2 / 8)
    expect(planning.next).toContain('Research Lab')
    expect(planning.opens).toBe('research-lab')
  })

  // Jakob, 14 Nov: a failed mission must not look like a success
  it('a failed mission card says FAILED, and its budget is used up', () => {
    const noIce = { ...flashlightDesign, instruments: ['inst-camera'] }
    const budgets = computeBudgets(noIce, 'engineer')
    const s = runSimulation(noIce, 'engineer', 1)
    const report = buildReport(s)
    expect(report.outcome).toBe('failed')
    expect(report.score.money).toBe(0)
    const view = missionStatus({ budgets, visited: [], sim: s })
    expect(view.stage).toBe('failed')
    expect(view.next).toMatch(/budget/i)
    expect(view.opens).toBe('report')
  })

  it('a lost mission no longer reads as in transfer', () => {
    const design = { ...flashlightDesign, planning: { ...flashlightDesign.planning, testTurns: 0, reservePercent: 0 } }
    let lost = null
    for (let seed = 1; seed <= 2000 && !lost; seed++) {
      const s = runSimulation(design, 'engineer', seed)
      if (s.flight.end === 'lost contact after deployment') lost = s
    }
    expect(lost).not.toBeNull()
    const budgets = computeBudgets(design, 'engineer')
    const l = missionLabels({ design, budgets, checks: goNoGo(design, budgets), visited: [], sim: lost })
    expect(l['launch-site'].status).not.toContain('months left')
    expect(l['launch-site'].status).toContain('lost')
  })

  it('names the building where a step is fixed', () => {
    expect(fixLocation('spacecraft')).toBe('the Factory (Spacecraft)')
    expect(fixLocation('comms')).toBe('the Communications Center (Comms)')
  })
})
