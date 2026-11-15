import { describe, it, expect } from 'vitest'
import { buildBayView, type BayView } from './bayView'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { flashlightDesign, iceCubeStart } from '../../sim/fixtures'
import type { Budgets, Design } from '../../sim/types'

function view(design: Design, patch: Partial<Budgets> = {}): BayView {
  const b = { ...computeBudgets(design, 'engineer'), ...patch }
  return buildBayView(design, b, goNoGo(design, b).checks)
}
const row = (v: BayView, key: string) => v.rows.find((r) => r.key === key)!
const base = iceCubeStart()

describe('buildBayView', () => {
  it('stack heights sum to totalVolume / 2', () => {
    for (const d of [base, flashlightDesign]) {
      const v = view(d)
      const b = computeBudgets(d, 'engineer')
      const h = v.stack.reduce((s, x) => s + x.height, 0)
      expect(h).toBeCloseTo(b.totalVolume / 2, 6)
      const top = v.stack[v.stack.length - 1]
      expect(top.base + top.height).toBeCloseTo(h, 6)
    }
  })

  it('default design board', () => {
    const v = view(base)
    expect(row(v, 'mass').text).toBe('12.0 / 14 kg') // 12.8 before the balance redesign (lighter IR spectrometer)
    expect(row(v, 'volume').text).toBe('4.4 / 6 U')
    expect(row(v, 'power').text).toBe('uses 30 of 120 W')
    const b = computeBudgets(base, 'engineer')
    const checks = goNoGo(base, b).checks
    const names: Record<string, string> = { mass: 'Mass', volume: 'Volume', power: 'Power', money: 'Budget', deltav: 'Delta-v', time: 'Time' }
    for (const r of v.rows) expect(r.tone).toBe(checks.find((c) => c.resource === names[r.key])!.status)
    expect(v.rows.map((r) => r.key)).toEqual(['mass', 'volume', 'power', 'money', 'deltav', 'time'])
  })

  it('two instruments and the dish overflow the box', () => {
    const v = view({ ...flashlightDesign, instruments: ['inst-laser', 'inst-neutron'], radio: 'radio-xband' })
    expect(v.stack.some((s) => s.overLimit)).toBe(true)
    expect(row(v, 'volume').tone).toBe('red')
    expect(v.status.tone).toBe('red')
  })

  it('too heavy names mass first', () => {
    const v = view({ ...base, propulsion: 'prop-chemical-large' })
    expect(row(v, 'mass').tone).toBe('red')
    expect(v.status.title).toMatch(/^MASS/)
    expect(v.massTone).toBe('red')
  })

  it('uses the ride mass limit', () => {
    expect(view(base, { massLimit: 12 }).rows[0].text).toMatch(/\/ 12 kg$/)
  })

  it('survives parts missing from the catalogue', () => {
    const v = view({ ...base, battery: 'nope', propulsion: 'nope' })
    expect(JSON.stringify(v)).not.toContain('NaN')
    expect(v.outside.engine).toBe('none')
  })

  it('no route to the Moon', () => {
    expect(row(view(base, { captureDeltaV: null }), 'deltav').text).toBe('cannot get there')
  })

  it('body panels are short of power', () => {
    // Since the balance redesign the 28 W panels leave a little for the instruments, so the case
    // where nothing is left is set in the budgets
    const v = view({ ...base, solar: 'solar-body' }, { scienceDuty: 0 })
    expect(v.outside.powerShort).toBe(true)
    expect(v.outside.solar).toBe('body')
    expect(row(v, 'power').tone).toBe('red')
  })

  it('small wings starve the ion engine', () => {
    const v = view({ ...base, solar: 'solar-1wing' })
    expect(v.outside.engineStarved).toBe(true)
    expect(v.outside.solar).toBe('wings')
  })

  it('parts from other buildings are read-only and say where', () => {
    const v = view(flashlightDesign)
    const inst = v.stack.filter((s) => s.category === 'instrument')
    expect(inst.length).toBe(1)
    expect(inst.every((s) => s.readOnly && s.building === 'Research Lab')).toBe(true)
    expect(v.stack.find((s) => s.category === 'radio')!.building).toBe('Communications Center')
    expect(v.stack.find((s) => s.category === 'battery')!.readOnly).toBe(false)
  })

  it('thin parts get call-outs with their detail', () => {
    const v = view({ ...base, computer: 'computer-redundant' })
    const bat = v.stack.find((s) => s.category === 'battery')!
    expect(bat.callout).toBe(true)
    expect(bat.detail).toBe(4)
    expect(v.stack.find((s) => s.category === 'computer')!.detail).toBe(2)
    expect(v.stack.find((s) => s.category === 'propulsion')!.callout).toBe(false)
  })

  it('lists the chosen parts for the 3D model, skipping unknown ids', () => {
    const v = view({ ...flashlightDesign, battery: 'nope', radio: 'nope' })
    expect(v.outside.modelParts).toEqual(['solar-1wing', 'attitude-precision', 'prop-chemical', 'inst-laser'])
  })

  it('all green says it fits', () => {
    const v = view(flashlightDesign)
    if (v.worst === 'green') expect(v.status.lines).toMatch(/FITS/)
    else expect(v.status.lines.length).toBeGreaterThan(10)
  })
})
