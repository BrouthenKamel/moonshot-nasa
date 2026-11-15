import { describe, it, expect } from 'vitest'
import { computeBudgets } from '../sim/budgets'
import { goNoGo } from '../sim/checks'
import { archetypes, flashlightDesign, iceCubeDesign } from '../sim/fixtures'
import { lunarIceMapperBrief } from '../data/brief'
import type { Design } from '../sim/types'
import { objectives, stampVerdict, verdictChanges, type Objective } from './questLog'

function log(design: Design) {
  const b = computeBudgets(design, 'engineer')
  return objectives(b, goNoGo(design, b), lunarIceMapperBrief)
}
const byId = (list: Objective[], id: string) => list.find((o) => o.id === id)!

describe('quest log objectives', () => {
  it('lists the five brief requirements in order', () => {
    expect(log(flashlightDesign).map((o) => o.id)).toEqual(['capture', 'coverage', 'data', 'lifetime', 'reserve'])
  })

  it('puts the Lunar Flashlight design on track for every objective', () => {
    for (const o of log(flashlightDesign)) expect(o.verdict, o.id).toBe('on-track')
  })

  it('blocks the ice map on the default design: nothing sees into the dark', () => {
    const ice = byId(log(iceCubeDesign), 'coverage')
    expect(ice.verdict).toBe('blocked')
    expect(ice.story).toBe('Nothing aboard sees into the dark craters')
    expect(ice.eng).toContain('projected 0%')
  })

  it('blocks reaching orbit without propulsion, and everything that needs orbit with it', () => {
    const list = log({ ...flashlightDesign, propulsion: 'none' })
    expect(byId(list, 'capture').verdict).toBe('blocked')
    expect(byId(list, 'data').verdict).toBe('blocked')
    expect(byId(list, 'lifetime').verdict).toBe('blocked')
  })

  it('flags a craft with no reserve held back', () => {
    expect(byId(log(archetypes.rushed), 'reserve').verdict).toBe('at-risk')
  })

  it('blocks the reserve when the plan costs more than is spendable', () => {
    const b = computeBudgets(flashlightDesign, 'engineer')
    const over = { ...b, totalCost: b.spendable + 1 }
    const reserve = byId(objectives(over, goNoGo(flashlightDesign, over), lunarIceMapperBrief), 'reserve')
    expect(reserve.verdict).toBe('blocked')
    expect(reserve.eng).toContain('M spendable')
  })

  it('reports only the verdicts a preview would change', () => {
    const now = log(iceCubeDesign)
    const next = log(flashlightDesign)
    expect(verdictChanges(now, next).coverage).toBe('on-track')
    expect(verdictChanges(now, null)).toEqual({})
    expect(verdictChanges(now, now)).toEqual({})
  })

  it('stamps the overall verdict', () => {
    const b = computeBudgets(flashlightDesign, 'engineer')
    expect(stampVerdict(goNoGo(flashlightDesign, b)).text).toBe('GO WITH CAUTIONS')
    const none = { ...flashlightDesign, propulsion: 'none' }
    expect(stampVerdict(goNoGo(none, computeBudgets(none, 'engineer'))).verdict).toBe('nogo')
  })
})
