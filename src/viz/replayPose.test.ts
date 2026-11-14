import { describe, it, expect } from 'vitest'
import { replayPose, type Pose } from './replayPose'
import { runSimulation } from '../sim/simulate'
import { createDefaultDesign } from '../sim/budgets'
import type { Design } from '../sim/types'

const design = createDefaultDesign()
const okRun = runSimulation(design, 'engineer', 1)
const okLogs = okRun.turnLogs

// Failing design: a 2 kg chemical tank (about 230 m/s) cannot capture into the elliptical orbit (386 m/s)
const failDesign: Design = {
  ...createDefaultDesign(),
  propulsion: 'prop-chemical',
  solar: 'solar-1wing',
  orbit: 'orbit-elliptical',
  transfer: 'transfer-low-energy',
}
const failRun = runSimulation(failDesign, 'engineer', 1)
const failLogs = failRun.turnLogs

function allFinite(p: Pose) {
  return [p.transferProgress, p.orbitAngle, p.orbitAltitudeKm, p.coveragePercent].every(Number.isFinite)
}

describe('replayPose', () => {
  it('starts on Earth at index 0', () => {
    const p = replayPose(design, okLogs, 0)
    expect(p.where).toBe('earth')
    expect(p.transferProgress).toBe(0)
    expect(p.captured).toBe(false)
    expect(p.terminal).toBeUndefined()
  })

  it('moves along the transfer arc from the first transfer log', () => {
    const launch = okLogs.findIndex((l) => l.notes.some((n) => n.startsWith('Launched')))
    const capture = okLogs.findIndex((l) => l.notes.some((n) => n.startsWith('Capture burn successful')))
    const duration = capture - launch
    const first = okLogs.findIndex((l) => l.phase === 'transfer')
    const p = replayPose(design, okLogs, first)
    expect(p.where).toBe('transfer')
    expect(p.transferProgress).toBeCloseTo(Math.min(1, 1 / duration))
    expect(p.captured).toBe(false)
  })

  it('is captured in orbit at and after the capture burn', () => {
    const cap = okLogs.findIndex((l) => l.notes.some((n) => n.startsWith('Capture burn successful')))
    expect(cap).toBeGreaterThan(0)
    const p = replayPose(design, okLogs, cap)
    expect(p.where).toBe('orbit')
    expect(p.captured).toBe(true)
    expect(p.transferProgress).toBe(1)
    const later = replayPose(design, okLogs, okLogs.length - 1, 'complete')
    expect(later.captured).toBe(true)
    expect(later.terminal).toBe('complete')
  })

  it('orbit angle at the k-th orbit log is k * pi / 6', () => {
    let k = 0
    okLogs.forEach((l, i) => {
      if (l.phase === 'orbit') {
        k++
        expect(replayPose(design, okLogs, i).orbitAngle).toBeCloseTo((k * Math.PI) / 6)
      }
    })
    expect(k).toBeGreaterThan(0)
  })

  it('keeps a failed capture run uncaptured with a failure marker and finite numbers', () => {
    expect(failRun.phase).toBe('failed')
    const last = failLogs.length - 1
    const p = replayPose(failDesign, failLogs, last, 'failed')
    expect(p.captured).toBe(false)
    expect(p.where).toBe('transfer')
    expect(p.terminal).toBe('failed')
    expect(p.phase).toBe('capture')
    failLogs.forEach((_, i) => expect(allFinite(replayPose(failDesign, failLogs, i))).toBe(true))
  })

  it('passes terminal through only on the last log', () => {
    expect(replayPose(design, okLogs, 0, 'complete').terminal).toBeUndefined()
  })

  it('clamps out-of-range indexes without throwing', () => {
    expect(replayPose(design, okLogs, -5)).toEqual(replayPose(design, okLogs, 0))
    expect(replayPose(design, okLogs, 9999)).toEqual(replayPose(design, okLogs, okLogs.length - 1))
    expect(allFinite(replayPose(design, okLogs, Number.NaN))).toBe(true)
  })

  it('returns the Earth pose for empty logs', () => {
    const p = replayPose(design, [], 3)
    expect(p.where).toBe('earth')
    expect(p.transferProgress).toBe(0)
    expect(p.orbitAngle).toBe(0)
    expect(p.captured).toBe(false)
    expect(allFinite(p)).toBe(true)
  })

  it('keeps transfer progress in [0, 1] for an unknown transfer id', () => {
    const bad: Design = { ...design, transfer: 'nope', orbit: 'nope' }
    okLogs.forEach((_, i) => {
      const p = replayPose(bad, okLogs, i)
      expect(p.transferProgress).toBeGreaterThanOrEqual(0)
      expect(p.transferProgress).toBeLessThanOrEqual(1)
      expect(allFinite(p)).toBe(true)
    })
    expect(replayPose(bad, okLogs, 0).orbitAltitudeKm).toBe(100)
  })
})
