import { describe, it, expect } from 'vitest'
import { computeBudgets } from '../../sim/budgets'
import { flashlightDesign, lunahMapDesign, iceCubeDesign } from '../../sim/fixtures'
import type { Design } from '../../sim/types'
import {
  activityText,
  stageModel,
  toggleInstrument,
  whatIfFromDesign,
  INSTRUMENT_COLORS,
  INSTRUMENT_SHORT_NAMES,
  type StageModel,
} from './stageModel'

const base = (d: Design) => stageModel(d, 'engineer', whatIfFromDesign(d))
const view = (m: StageModel, id: string) => {
  const v = m.instruments.find((i) => i.id === id)
  if (!v) throw new Error(`no view for ${id}`)
  return v
}

describe('toggleInstrument', () => {
  it('keeps at most two, the oldest drops', () => {
    expect(toggleInstrument(['a', 'b'], 'c')).toEqual(['b', 'c'])
    expect(toggleInstrument(['a', 'b'], 'a')).toEqual(['b'])
    expect(toggleInstrument([], 'a')).toEqual(['a'])
  })
  it('never ends with three after quick picks', () => {
    let current: string[] = []
    for (const id of ['a', 'b', 'c', 'd', 'a']) current = toggleInstrument(current, id)
    expect(current).toEqual(['d', 'a'])
  })
})

describe('whatIfFromDesign', () => {
  it('reads orbit and pointing from the design', () => {
    expect(whatIfFromDesign(flashlightDesign)).toEqual({ orbit: 'orbit-halo', precise: true })
    expect(whatIfFromDesign(lunahMapDesign)).toEqual({ orbit: 'orbit-elliptical', precise: false })
  })
  it('treats an unknown attitude as basic pointing', () => {
    expect(whatIfFromDesign({ ...flashlightDesign, attitude: 'nope' }).precise).toBe(false)
  })
})

describe('catalogue labels', () => {
  it('has a colour and a short name for every instrument', () => {
    for (const id of ['inst-laser', 'inst-ir-spec', 'inst-neutron', 'inst-camera']) {
      expect(INSTRUMENT_COLORS[id]).toMatch(/^#[0-9a-f]{6}$/)
      expect(INSTRUMENT_SHORT_NAMES[id]).toBeTruthy()
    }
    expect(INSTRUMENT_COLORS['inst-laser']).toBe('#22c55e')
  })
})

describe('stageModel', () => {
  it('IR spectrometer alone maps no ice and says why', () => {
    const m = base(iceCubeDesign)
    expect(view(m, 'inst-ir-spec').countsAs).toBe('context')
    expect(m.forecast.coverage).toBe(0)
    expect(m.forecast.meetsTarget).toBe(false)
    expect(m.forecast.reasons).toContain('Nothing aboard sees into shadow: no ice is mapped.')
  })

  it('neutron spectrometer low down is at full strength', () => {
    const v = view(stageModel(lunahMapDesign, 'engineer', { orbit: 'orbit-elliptical', precise: true }), 'inst-neutron')
    expect(v.strength).toBe(1)
    expect(v.shaky).toBe(false)
    expect(v.problems).toEqual([])
    expect(v.seesShadow).toBe(true)
  })

  it('laser with basic pointing is shaky at half strength', () => {
    const v = view(stageModel(flashlightDesign, 'engineer', { orbit: 'orbit-halo', precise: false }), 'inst-laser')
    expect(v.strength).toBe(0.5)
    expect(v.shaky).toBe(true)
    expect(v.problems).toContain('shaky aim: needs precise pointing')
  })

  it('laser at 100 km follows the core and names the height', () => {
    const v = view(stageModel(flashlightDesign, 'engineer', { orbit: 'orbit-100km', precise: true }), 'inst-laser')
    const b = computeBudgets({ ...flashlightDesign, orbit: 'orbit-100km' }, 'engineer')
    expect(v.strength).toBe(b.quality['inst-laser'])
    expect(v.outOfRange || v.veryWeak).toBe(true)
    expect(v.heightIsCause).toBe(true)
    expect(v.problems).toContain('too high at 100 km: works below 20 km')
    expect(activityText(v, true)).toMatch(/^(Out of range|Very weak) at this height$/)
  })

  it('neutron spectrometer at 100 km names the 25 km limit', () => {
    const v = view(stageModel(lunahMapDesign, 'engineer', { orbit: 'orbit-100km', precise: false }), 'inst-neutron')
    expect(v.problems[0]).toBe('too high at 100 km: works below 25 km')
  })

  it('dials equal to the design reproduce the dashboard forecast', () => {
    const m = base(lunahMapDesign)
    const b = computeBudgets(lunahMapDesign, 'engineer')
    expect(m.forecast.coverage).toBe(b.projectedCoverage)
    expect(m.forecast.context).toBe(b.projectedContext)
    expect(m.forecast.dataMB).toBe(b.projectedData)
    expect(m.forecast.passesPerTurn).toBe(141)
    expect(m.forecast.isWhatIf).toBe(false)
    expect(m.altitudeKm).toBe(15)
  })

  it('a camera next to the laser fills the link and says so', () => {
    const d = { ...flashlightDesign, instruments: ['inst-laser', 'inst-camera'] }
    const m = base(d)
    const lost = Math.round(computeBudgets(d, 'engineer').projectedLost)
    expect(m.forecast.reasons).toContain(
      `The link is full: ${lost} MB never gets home, and its coverage is lost with it. Link: Comms Center.`
    )
    expect(m.forecast.outreachMB).toBeGreaterThan(0)
    expect(view(m, 'inst-camera').countsAs).toBe('outreach')
  })

  it('an orbit the craft cannot hold maps nothing and says so', () => {
    const m = stageModel(flashlightDesign, 'engineer', { orbit: 'orbit-elliptical', precise: true })
    expect(m.forecast.coverage).toBe(0)
    expect(m.forecast.isWhatIf).toBe(true)
    expect(m.forecast.reasons[0]).toBe(
      'This craft cannot reach and hold this orbit, so nothing is mapped. Engine: Factory. Orbit and ride: Launch Site.'
    )
  })

  it('a design that meets the brief has no reason lines', () => {
    const m = base(flashlightDesign)
    expect(m.forecast.reasons).toEqual([])
    expect(m.forecast.meetsTarget).toBe(true)
  })

  it('reports power when the instruments cannot always run', () => {
    const d = { ...flashlightDesign, solar: 'solar-body' }
    const duty = computeBudgets(d, 'engineer').scienceDuty
    const v = view(base(d), 'inst-laser')
    expect(v.poweredShare).toBe(duty)
    expect(v.problems).toContain(`power for only ${Math.round(duty * 100)}% of the time`)
  })

  it('gives the ice rate only to ice instruments', () => {
    const m = base({ ...flashlightDesign, instruments: ['inst-laser', 'inst-ir-spec'] })
    expect(view(m, 'inst-laser').iceRatePerTurn).toBeGreaterThan(0)
    expect(view(m, 'inst-ir-spec').iceRatePerTurn).toBe(0)
  })

  it('empty bay and unknown orbit do not throw or produce NaN', () => {
    const m = stageModel({ ...flashlightDesign, instruments: [], orbit: '' }, 'engineer', { orbit: '', precise: true })
    expect(m.instruments).toEqual([])
    expect(m.altitudeKm).toBe(15)
    expect(m.forecast.passesPerTurn).toBe(0)
    expect(JSON.stringify(m)).not.toContain('NaN')
    expect(JSON.stringify(m)).not.toContain('null')
  })

  it('skips instrument ids that are not in the catalogue', () => {
    const m = base({ ...flashlightDesign, instruments: ['inst-laser', 'inst-gone'] })
    expect(m.instruments.map((i) => i.id)).toEqual(['inst-laser'])
  })
})

describe('activityText', () => {
  const v = view(base(flashlightDesign), 'inst-laser')
  const ir = view(base(iceCubeDesign), 'inst-ir-spec')
  it('reads the dark floor when it sees into shadow', () => {
    expect(activityText(v, true)).toBe('Reading the dark crater floor')
    expect(activityText(v, false)).toBe('Reading sunlit ground')
  })
  it('is blind over shadow when it needs sunlight', () => {
    expect(activityText(ir, true)).toBe('Blind right now: no sunlight down there')
    expect(activityText(ir, false)).toBe('Reading sunlit ground')
  })
  it('says very weak without height when pointing is the cause', () => {
    expect(activityText({ ...v, strength: 0.1, veryWeak: true, heightIsCause: false }, true)).toBe('Very weak')
  })
  it('says out of range at strength 0', () => {
    expect(activityText({ ...v, strength: 0, outOfRange: true, heightIsCause: true }, false)).toBe('Out of range at this height')
  })
})
