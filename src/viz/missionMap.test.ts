import { describe, it, expect } from 'vitest'
import { computeBudgets } from '../sim/budgets'
import { goNoGo } from '../sim/checks'
import { flashlightDesign } from '../sim/fixtures'
import type { Design, DesignStep } from '../sim/types'
import { runSimulation } from '../sim/simulate'
import {
  BUILDING_STEPS,
  STEP_ORDER,
  buildingForStep,
  fixLocation,
  flightFeed,
  lunarMissionView,
  missionLabels,
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

  it('names the building where a step is fixed', () => {
    expect(fixLocation('spacecraft')).toBe('the Factory (Spacecraft)')
    expect(fixLocation('comms')).toBe('the Communications Center (Comms)')
  })
})
