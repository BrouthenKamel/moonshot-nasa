import { describe, expect, it } from 'vitest'
import { iceSparkleStrength, lookThroughCaption, stageModel } from './stageModel'
import { flashlightDesign } from '../../sim/fixtures'

describe('look-through scene reactions', () => {
  it('shows cyan crater-floor ice sparkles only when a shadow-seeing instrument is within range', () => {
    const at15 = stageModel({ ...flashlightDesign, instruments: ['inst-laser'] }, 'engineer', { orbit: 'orbit-elliptical', precise: true })
    expect(iceSparkleStrength(at15.instruments)).toBeGreaterThan(0.5)
    expect(lookThroughCaption(at15.instruments, at15.altitudeKm)).toContain('cyan')

    const at100 = stageModel({ ...flashlightDesign, instruments: ['inst-laser'] }, 'engineer', { orbit: 'orbit-100km', precise: true })
    expect(iceSparkleStrength(at100.instruments)).toBe(0)
    expect(lookThroughCaption(at100.instruments, at100.altitudeKm)).toContain('fades')
  })

  it('gives distinct blind captions for IR spectrometer and camera', () => {
    const ir = stageModel({ ...flashlightDesign, instruments: ['inst-ir-spec'] }, 'engineer', { orbit: 'orbit-elliptical', precise: true })
    expect(iceSparkleStrength(ir.instruments)).toBe(0)
    expect(lookThroughCaption(ir.instruments, ir.altitudeKm)).toContain("I can't see into the dark")

    const cam = stageModel({ ...flashlightDesign, instruments: ['inst-camera'] }, 'engineer', { orbit: 'orbit-elliptical', precise: true })
    expect(iceSparkleStrength(cam.instruments)).toBe(0)
    expect(lookThroughCaption(cam.instruments, cam.altitudeKm)).toContain('no ice')
  })
})
