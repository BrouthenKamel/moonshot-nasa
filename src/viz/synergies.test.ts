import { describe, it, expect } from 'vitest'
import { computeBudgets, createDefaultDesign } from '../sim/budgets'
import { FIXED_DIFFICULTY } from '../state/gameStore'
import { computeSynergies } from './synergies'

describe('computeSynergies', () => {
  it('flags blind-in-shadow when only IR spec or camera is aboard', () => {
    const design = { ...createDefaultDesign(), instruments: ['inst-ir-spec'] }
    const budgets = computeBudgets(design, FIXED_DIFFICULTY)
    const ids = computeSynergies(design, budgets).map((b) => b.id)
    expect(ids).toContain('shadow-blind')
  })

  it('flags altitude mismatch at 100 km with Laser Reflectometer', () => {
    const design = { ...createDefaultDesign(), instruments: ['inst-laser'], orbit: 'orbit-100km' }
    const budgets = computeBudgets(design, FIXED_DIFFICULTY)
    const ids = computeSynergies(design, budgets).map((b) => b.id)
    expect(ids).toContain('altitude-mismatch')
  })

  it('recognizes star tracker synergy and altitude match when configured cleanly', () => {
    const design = {
      ...createDefaultDesign(),
      instruments: ['inst-laser'],
      orbit: 'orbit-elliptical',
      attitude: 'attitude-precision',
      solar: 'solar-2wing',
      propulsion: 'prop-ion-large',
    }
    const budgets = computeBudgets(design, FIXED_DIFFICULTY)
    const ids = computeSynergies(design, budgets).map((b) => b.id)
    expect(ids).toContain('altitude-match')
    expect(ids).toContain('pointing-synergy')
    expect(ids).toContain('ion-power-ready')
  })

  it('warns when camera crowds downlink beside an ice instrument', () => {
    const design = {
      ...createDefaultDesign(),
      instruments: ['inst-laser', 'inst-camera'],
      radio: 'radio-sband',
      groundStation: 'ground-small',
    }
    const budgets = computeBudgets(design, FIXED_DIFFICULTY)
    const ids = computeSynergies(design, budgets).map((b) => b.id)
    expect(ids).toContain('link-crowding')
  })
})
