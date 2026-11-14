import { describe, it, expect } from 'vitest'
import { trayGroups } from './trayOptions'
import { computeBudgets, createDefaultDesign } from '../../sim/budgets'
import { solarPanels, batteries, computers, attitudeControls, propulsionSystems } from '../../data/parts'

describe('trayGroups', () => {
  const groups = trayGroups(computeBudgets(createDefaultDesign(), 'engineer'))

  it('mirrors the catalogue', () => {
    expect(groups.map((g) => g.key)).toEqual(['solar', 'battery', 'computer', 'attitude', 'propulsion'])
    const cat = [solarPanels, batteries, computers, attitudeControls, propulsionSystems]
    groups.forEach((g, i) => expect(g.options.map((o) => o.id)).toEqual(cat[i].map((p) => p.id)))
  })

  it('every option carries its facts', () => {
    for (const g of groups)
      for (const o of g.options) {
        expect(o.short.length).toBeGreaterThan(0)
        expect(o.stats).toMatch(/kg/)
        expect(o.facts.length).toBeGreaterThan(10)
        expect(o.description.length).toBeGreaterThan(10)
        expect(o.facts + o.stats).not.toContain('NaN')
      }
  })

  it('keeps the old cards facts', () => {
    const ion = groups[4].options.find((o) => o.id === 'prop-ion-large')!
    expect(ion.facts).toContain('56')
    expect(ion.facts).toContain('Isp 2150')
    expect(groups[2].options[1].facts).toMatch(/x0\.3/)
    expect(groups[1].options[0].facts).toMatch(/min/)
  })

  it('survives a zero eclipse draw', () => {
    const b = { ...computeBudgets(createDefaultDesign(), 'engineer'), eclipsePowerConsumed: 0 }
    expect(JSON.stringify(trayGroups(b))).not.toMatch(/NaN|Infinity/)
  })
})
