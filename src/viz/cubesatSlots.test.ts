import { describe, expect, it } from 'vitest'
import { instruments } from '../data/parts'
import { computeBudgets, createDefaultDesign } from '../sim/budgets'
import { buildSlots } from './cubesatSlots'

describe('buildSlots', () => {
  it('matches the dashboard volume for the default design', () => {
    const design = createDefaultDesign()
    const layout = buildSlots(design)
    expect(layout.solar).toBe('deployable')
    expect(layout.usedU).toBeCloseTo(computeBudgets(design, 'engineer').totalVolume, 9)
    expect(layout.overLimit).toBe(false)
  })

  it('reports body-mounted solar', () => {
    const layout = buildSlots({ ...createDefaultDesign(), solar: 'solar-body' })
    expect(layout.solar).toBe('body')
  })

  it('has no instrument slots without instruments', () => {
    const layout = buildSlots({ ...createDefaultDesign(), instruments: [] })
    expect(layout.slots.filter((s) => s.category === 'instrument')).toEqual([])
  })

  it('skips unknown ids without throwing', () => {
    const layout = buildSlots({
      ...createDefaultDesign(),
      propulsion: 'does-not-exist',
      solar: 'nope',
    })
    expect(layout.slots.some((s) => s.category === 'propulsion')).toBe(false)
    expect(layout.solar).toBe('none')
  })

  it('flags over-limit only when used exceeds the limit', () => {
    const layout = buildSlots({
      ...createDefaultDesign(),
      instruments: instruments.map((i) => i.id),
      propulsion: 'prop-chemical',
    })
    expect(layout.overLimit).toBe(layout.usedU > layout.limitU)
    const total = layout.slots.reduce((s, x) => s + x.volume, 0)
    expect(layout.usedU).toBeCloseTo(total, 9)
  })
})
