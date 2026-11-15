import { describe, expect, it } from 'vitest'
import { computeBudgets, createDefaultDesign } from '../../sim/budgets'
import {
  OPTIONS, addWire, allPacked, autoPack, buildInsights, cellTops, cellsNeeded, choiceOf, deltaVGauge, fullWiring, loadsOf,
  removeWire, shapesFor, tryPlace, usedU, wireValid, wiringState, type Choice,
} from './logic'

const design = createDefaultDesign()

describe('packing', () => {
  it('needs ceil(volume) cells and has a shape for each', () => {
    expect(cellsNeeded(0.3)).toBe(1)
    expect(cellsNeeded(1.2)).toBe(2)
    expect(cellsNeeded(2.9)).toBe(3)
    for (const k of [1, 2, 3]) expect(shapesFor(k).length).toBeGreaterThan(0)
  })

  it('packs the default craft with nothing left over', () => {
    const { placements, unplaced } = autoPack(design, choiceOf(design))
    expect(unplaced).toEqual([])
    expect(allPacked(placements, choiceOf(design))).toBe(true)
    expect(cellTops(placements).every((t) => t <= 1 + 1e-6)).toBe(true)
  })

  it('takes exactly the volume the budgets count', () => {
    const { placements } = autoPack(design, choiceOf(design))
    expect(usedU(placements)).toBeCloseTo(computeBudgets(design, 'engineer').totalVolume, 5)
  })

  it('refuses a part that is too big with a plain reason', () => {
    const d = { ...design, instruments: ['inst-laser', 'inst-neutron'] }
    const base = autoPack(d, choiceOf(d)).placements
    const big = tryPlace(base, { id: 'prop-chemical-large', family: 'propulsion' }, { col: 0, row: 0 })
    expect(big.ok).toBe(false)
    if (!big.ok) expect(big.reason).toMatch(/Does not fit: \d\.\d U short|No gap/)
  })

  it('swaps a same-family part in place', () => {
    const base = autoPack(design, choiceOf(design)).placements
    const r = tryPlace(base, { id: 'battery-small', family: 'battery' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.placements.filter((p) => p.family === 'battery')).toHaveLength(1)
      expect(r.placements.find((p) => p.family === 'battery')?.id).toBe('battery-small')
    }
  })

  it('places a drop on the cell it covers', () => {
    const r = tryPlace([], { id: 'computer-basic', family: 'computer' }, { col: 1, row: 2 })
    expect(r.ok).toBe(true)
    if (r.ok) expect([r.placements[0].col, r.placements[0].row]).toEqual([1, 2])
  })

  it('packs the default craft with every radio and battery option', () => {
    for (const radio of OPTIONS.radio.slice(0, 2))
      for (const battery of OPTIONS.battery) {
        const choice: Choice = { ...choiceOf(design), radio, battery }
        expect(autoPack(design, choice).unplaced, `${radio}/${battery}`).toEqual([])
      }
  })
})

describe('wiring', () => {
  const choice = choiceOf(design)
  const loads = loadsOf(design, choice)
  const ids = loads.map((l) => l.id)

  it('only solar -> battery and battery -> load are valid cables', () => {
    expect(wireValid('solar', 'battery', ids)).toBe(true)
    expect(wireValid('battery', 'radio', ids)).toBe(true)
    expect(wireValid('solar', 'radio', ids)).toBe(false)
    expect(wireValid('radio', 'battery', ids)).toBe(false)
    expect(addWire([], 'solar', 'radio', ids)).toEqual([])
  })

  it('does not duplicate or lose cables', () => {
    let w = addWire([], 'solar', 'battery', ids)
    w = addWire(w, 'solar', 'battery', ids)
    expect(w).toHaveLength(1)
    expect(removeWire(w, 'solar', 'battery')).toHaveLength(0)
  })

  it('feeds nothing until the solar array is linked', () => {
    const s = wiringState([{ from: 'battery', to: 'radio' }], loads, 100)
    expect(s.powered).toEqual([])
    expect(s.generated).toBe(0)
  })

  it('a fully wired bus matches computeBudgets', () => {
    const b = computeBudgets(design, 'engineer')
    const s = wiringState(fullWiring(loads), loads, b.powerGenerated)
    expect(s.complete).toBe(true)
    expect(s.load).toBeCloseTo(b.powerConsumed, 6)
    expect(s.shortfall).toBeCloseTo(Math.max(0, -b.powerMargin), 6)
  })

  it('shows a shortfall when the load beats the generation', () => {
    const d = { ...design, solar: 'solar-body', instruments: ['inst-laser', 'inst-ir-spec'] }
    const l = loadsOf(d, choiceOf(d))
    const b = computeBudgets(d, 'engineer')
    const s = wiringState(fullWiring(l), l, b.powerGenerated)
    expect(b.powerMargin).toBeLessThan(0)
    expect(s.shortfall).toBeCloseTo(-b.powerMargin, 6)
  })
})

describe('gauge and result', () => {
  it('reads the Δv ruler from the budgets', () => {
    const b = computeBudgets(design, 'engineer')
    const g = deltaVGauge(b)
    expect(g.have).toBe(b.deltaVAvailable)
    expect(g.need).toBe(b.deltaVTotal)
  })

  it('builds the three insights from the budgets', () => {
    const b = computeBudgets(design, 'engineer')
    const ins = buildInsights(b)
    expect(ins.map((i) => i.id)).toEqual(['power-margin', 'mass-margin', 'delta-v-margin'])
    expect(ins[1].metric.value).toBeCloseTo(b.massMargin, 1)
    expect(ins.every((i) => i.room === 'clean-room')).toBe(true)
  })
})
