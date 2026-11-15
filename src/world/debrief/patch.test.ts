import { describe, expect, it } from 'vitest'
import { archetypes, flashlightDesign, lunahMapDesign } from '../../sim/fixtures'
import { hash32, orbitPoint, patchName, patchSpec, plumeFor } from './patch'

describe('patchSpec: a mission patch drawn from the craft', () => {
  it('is deterministic: the same craft and name give the same patch', () => {
    expect(patchSpec(flashlightDesign, 'Ada')).toEqual(patchSpec(flashlightDesign, 'Ada'))
    expect(patchSpec(flashlightDesign, 'Ada').number).toMatch(/^IH-\d{4}$/)
  })

  it('a different name or craft gives a different patch', () => {
    const a = patchSpec(flashlightDesign, 'Ada')
    expect(patchSpec(flashlightDesign, 'Grace').number).not.toBe(a.number)
    expect(patchSpec(lunahMapDesign, 'Ada').stars).not.toEqual(a.stars)
  })

  it('ignores parts that do not change the drawing (and instrument order)', () => {
    const a = patchSpec(archetypes.twoInstruments, 'Ada')
    const b = patchSpec({ ...archetypes.twoInstruments, instruments: [...archetypes.twoInstruments.instruments].reverse(), contactHours: 5 }, 'ada ')
    expect(b.number).toBe(a.number)
  })

  it('draws the orbit family, wings, battery, engine, instruments and radio band', () => {
    const p = patchSpec(flashlightDesign, 'Ada', 'success')
    expect(p.orbit.shape).toBe('halo')
    expect(p.wings).toBe(1)
    expect(p.cells).toBe(3)
    expect(p.plume).toBe('chemical')
    expect(p.instruments).toEqual(['laser'])
    expect(p.band).toBe('S')
    expect(p.outcome).toBe('success')
    const l = patchSpec(lunahMapDesign, 'Ada')
    expect(l.orbit.shape).toBe('elliptical')
    expect(l.wings).toBe(2)
    expect(l.plume).toBe('ion')
    expect(l.instruments).toEqual(['neutron'])
    expect(patchSpec({ ...flashlightDesign, orbit: 'orbit-100km', solar: 'solar-body' }, 'Ada')).toMatchObject({ wings: 0, orbit: { shape: 'circular' } })
  })

  it('keeps every star inside the inner disc', () => {
    for (const design of Object.values(archetypes)) {
      const { stars } = patchSpec(design, 'Rookie')
      expect(stars.length).toBeGreaterThan(5)
      for (const s of stars) expect((s.x - 100) ** 2 + (s.y - 100) ** 2).toBeLessThan(58 ** 2)
    }
  })

  it('unknown parts fall back to a plain craft', () => {
    const p = patchSpec({ ...flashlightDesign, orbit: 'orbit-x', solar: '?', battery: '?', radio: '?', propulsion: '?', instruments: ['?'] }, 'Ada')
    expect(p).toMatchObject({ wings: 1, cells: 1, plume: 'none', instruments: [], band: '', orbit: { shape: 'circular' } })
  })
})

describe('patch helpers', () => {
  it('patchName upper-cases, trims and shortens', () => {
    expect(patchName('  ada  lovelace ')).toBe('ADA LOVELACE')
    expect(patchName('')).toBe('ROOKIE')
    expect(patchName('Maximiliana Konstantinopel')).toBe('MAXIMILIANA KONST…')
  })
  it('plumeFor reads the engine family', () => {
    expect(plumeFor('prop-ion-large')).toBe('ion')
    expect(plumeFor('prop-chemical-large')).toBe('chemical')
    expect(plumeFor('prop-coldgas')).toBe('cold-gas')
  })
  it('orbitPoint walks the ellipse around its centre', () => {
    const o = { shape: 'circular' as const, rx: 40, ry: 40, tilt: 0, cx: 100, cy: 100 }
    expect(orbitPoint(o, 0)).toMatchObject({ x: 140, y: 100, angle: 90 })
    expect(orbitPoint(o, 0.25)).toMatchObject({ x: 100, y: 140 })
  })
  it('hash32 is stable', () => {
    expect(hash32('moonshot')).toBe(hash32('moonshot'))
    expect(hash32('a')).not.toBe(hash32('b'))
  })
})
