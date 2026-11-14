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
  lunarMissionView,
  missionClockLabel,
  missionLabels,
  suggestedStep,
} from './missionMap'

const labelsFor = (design: Design = flashlightDesign, visited: DesignStep[] = [], day = 112) => {
  const budgets = computeBudgets(design, 'engineer')
  return missionLabels({ design, budgets, checks: goNoGo(design, budgets), visited, sim: null, day })
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
    expect(l.factory.status).toContain('14.0 / 14 kg')
    expect(l['research-lab'].status).toContain('74%')
    expect(l['launch-site'].status).toContain('turn 8')
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

  it('builds the feed from the flight log on the base calendar', () => {
    const sim = runSimulation(flashlightDesign, 'engineer', 1)
    const feed = flightFeed(sim.turnLogs, 112)
    const launch = feed.find((e) => e.title.startsWith('Launched'))!
    expect(launch.day).toBe(112 + sim.flight.launchedTurn! * 30)
    expect(feed.every((e) => Number.isFinite(e.day))).toBe(true)
    // One unit on the flight clock: days, never turns (Jakob, 14 Nov)
    expect(feed.every((e) => !/turn/i.test(e.detail ?? ''))).toBe(true)
  })

  it('the flight clock counts mission days, 30 to a turn', () => {
    expect(missionClockLabel(0)).toBe('mission day 0')
    expect(missionClockLabel(8)).toBe('mission day 240')
  })

  it('mission card progress comes from the flight', () => {
    const budgets = computeBudgets(flashlightDesign, 'engineer')
    const done = runSimulation(flashlightDesign, 'engineer', 1)
    const view = lunarMissionView({ design: flashlightDesign, budgets, visited: [], sim: done })
    expect(view.status).toBe('complete')
    expect(view.progress).toBe(1)
    const planning = lunarMissionView({ design: flashlightDesign, budgets, visited: ['brief', 'planning'], sim: null })
    expect(planning.status).toBe('planning')
    expect(planning.progress).toBeCloseTo(2 / 8)
    expect(planning.detail).toContain('Research Lab')
  })

  // Jakob, 14 Nov: a failed mission must not look like a success
  it('a failed mission card says FAILED, and its budget is used up', () => {
    const noIce = { ...flashlightDesign, instruments: ['inst-camera'] }
    const budgets = computeBudgets(noIce, 'engineer')
    const s = runSimulation(noIce, 'engineer', 1)
    const report = buildReport(s)
    expect(report.outcome).toBe('failed')
    expect(report.score.money).toBe(0)
    const view = lunarMissionView({ design: noIce, budgets, visited: [], sim: s })
    expect(view.status).toBe('failed')
    expect(view.detail).toMatch(/budget/i)
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
    const l = missionLabels({ design, budgets, checks: goNoGo(design, budgets), visited: [], sim: lost, day: 112 })
    expect(l['launch-site'].status).not.toContain('turns left')
    expect(l['launch-site'].status).toContain('lost')
  })

  it('names the building where a step is fixed', () => {
    expect(fixLocation('spacecraft')).toBe('the Factory (Spacecraft)')
    expect(fixLocation('comms')).toBe('the Communications Center (Comms)')
  })
})

describe('Research Lab badge follows the lab level', () => {
  // Demo days: the lab is LV 2 on day 112 and reaches LV 3 on day 122.
  it('shows LV 2 before the upgrade and LV 3 after it while planning', () => {
    expect(labelsFor(flashlightDesign, [], 112)['research-lab'].level).toBe(2)
    expect(labelsFor(flashlightDesign, [], 122)['research-lab'].level).toBe(3)
  })

  it('shows LV 3 after the upgrade while the mission flies', () => {
    const design = flashlightDesign
    const budgets = computeBudgets(design, 'engineer')
    const sim = runSimulation(design, 'engineer', 1)
    const labels = missionLabels({ design, budgets, checks: goNoGo(design, budgets), visited: [], sim, day: 200 })
    expect(labels['research-lab'].level).toBe(3)
  })
})
