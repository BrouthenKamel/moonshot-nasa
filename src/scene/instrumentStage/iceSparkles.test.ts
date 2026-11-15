import { describe, expect, it } from 'vitest'
import { iceSparkleStrength, stageModel } from './stageModel'
import { flashlightDesign } from '../../sim/fixtures'

describe('crater ice sparkles', () => {
  it('show only when a shadow-seeing instrument is within range', () => {
    const at15 = stageModel({ ...flashlightDesign, instruments: ['inst-laser'], orbit: 'orbit-elliptical' }, 'engineer')
    expect(iceSparkleStrength(at15.instruments)).toBeGreaterThan(0.5)

    const at100 = stageModel({ ...flashlightDesign, instruments: ['inst-laser'], orbit: 'orbit-100km' }, 'engineer')
    expect(iceSparkleStrength(at100.instruments)).toBe(0)
  })

  it('stay off for the IR spectrometer and the camera', () => {
    for (const id of ['inst-ir-spec', 'inst-camera']) {
      const m = stageModel({ ...flashlightDesign, instruments: [id], orbit: 'orbit-elliptical' }, 'engineer')
      expect(iceSparkleStrength(m.instruments)).toBe(0)
    }
  })
})
