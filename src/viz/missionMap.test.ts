import { describe, it, expect } from 'vitest'
import { computeBudgets } from '../sim/budgets'
import { goNoGo } from '../sim/checks'
import { flashlightDesign } from '../sim/fixtures'
import type { Design, DesignStep } from '../sim/types'
import { BUILDING_STEPS, STEP_ORDER, buildingForStep, fixLocation, missionLabels, suggestedStep } from './missionMap'

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

  it('names the building where a step is fixed', () => {
    expect(fixLocation('spacecraft')).toBe('the Factory (Spacecraft)')
    expect(fixLocation('comms')).toBe('the Communications Center (Comms)')
  })
})
