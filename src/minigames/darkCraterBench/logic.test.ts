import { describe, expect, it } from 'vitest'
import {
  SCANNERS,
  SIZE,
  addToTray,
  buildBench,
  buildResult,
  foundStats,
  getInstrument,
  litMap,
  newScan,
  powerNeedle,
  reelFill,
  scanStep,
  trayCheck,
  type Bench,
  type ScanState,
} from './logic'

const bench = buildBench()
const AZ = 0.6

/** Raster the whole bench at a given speed */
function sweep(b: Bench, id: string, az: number, speed: number, step = 0.04): ScanState {
  const spec = SCANNERS[id]
  const lit = litMap(b, az)
  const s = newScan()
  const dt = step / speed
  const rowGap = spec.radius * 1.2
  let dir = 1
  for (let z = -SIZE / 2; z <= SIZE / 2; z += rowGap) {
    for (let k = 0; k <= SIZE / step; k++) {
      const x = dir > 0 ? -SIZE / 2 + k * step : SIZE / 2 - k * step
      scanStep(b, lit, spec, s, x, z, dt, speed)
    }
    dir = -dir
  }
  return s
}

describe('the bench', () => {
  it('has ice in permanent shadow and ice in the open', () => {
    expect(bench.psrIceCount).toBeGreaterThan(20)
    expect(bench.iceCount - bench.psrIceCount).toBeGreaterThan(20)
  })

  it('puts the crater floor in shadow whichever way the lamp points', () => {
    const c = bench.psr.filter(Boolean).length
    expect(c).toBeGreaterThan(100)
    for (const az of [0, 1.5, 3, 4.7]) {
      const lit = litMap(bench, az)
      for (let v = 0; v < lit.length; v++) if (bench.psr[v]) expect(lit[v]).toBe(0)
    }
  })

  it('moving the lamp changes what is lit', () => {
    const a = litMap(bench, 0)
    const b = litMap(bench, Math.PI)
    expect(a.some((x, i) => x !== b[i])).toBe(true)
  })
})

describe('what each instrument finds', () => {
  it('camera and IR find lit ice but nothing in the permanent shadow', () => {
    for (const id of ['inst-camera', 'inst-ir-spec']) {
      const s = sweep(bench, id, AZ, 0.25)
      const st = foundStats(bench, s)
      expect(st.icePct).toBeGreaterThan(0)
      expect(st.shadowPct).toBe(0)
      expect(getInstrument(id).seesShadow).toBe(false)
    }
  })

  it('laser finds ice in the dark when swept slowly', () => {
    expect(getInstrument('inst-laser').seesShadow).toBe(true)
    const st = foundStats(bench, sweep(bench, 'inst-laser', AZ, 0.25))
    expect(st.shadowPct).toBeGreaterThan(80)
  })

  it('laser finds nothing swept too fast', () => {
    const s = sweep(bench, 'inst-laser', AZ, 1.5)
    expect(foundStats(bench, s).icePct).toBe(0)
    expect(s.seconds).toBe(0)
  })

  it('neutron sees the dark ice through a coarse footprint, faster than the laser', () => {
    const s = sweep(bench, 'inst-neutron', AZ, 1)
    expect(foundStats(bench, s).shadowPct).toBeGreaterThan(80)
    let reported = 0
    for (let v = 0; v < s.found.length; v++) reported += s.found[v]
    expect(reported).toBeGreaterThan(bench.iceCount * 1.5) // blurry: it paints more than the ice
  })
})

describe('readouts come from the catalogue', () => {
  it('reel and needle scale with data rate and power', () => {
    expect(reelFill(getInstrument('inst-camera'), 6)).toBeCloseTo(0.5)
    expect(reelFill(getInstrument('inst-laser'), 6)).toBeLessThan(0.05)
    expect(powerNeedle(getInstrument('inst-laser'))).toBe(1)
    expect(powerNeedle(getInstrument('inst-camera'))).toBeCloseTo(3 / 25)
  })
})

describe('tray', () => {
  it('holds two at most', () => {
    let t = addToTray([], 'inst-laser')
    t = addToTray(t, 'inst-neutron')
    expect(addToTray(t, 'inst-camera')).toEqual(t)
    expect(trayCheck(t).ok).toBe(true)
    expect(trayCheck(t).mass).toBeCloseTo(4.5)
    expect(trayCheck(['inst-laser', 'inst-neutron', 'inst-camera']).ok).toBe(false)
  })
})

describe('result', () => {
  it('patches instruments and writes one insight per scanned instrument', () => {
    const laser = sweep(bench, 'inst-laser', AZ, 0.25)
    const cam = sweep(bench, 'inst-camera', AZ, 0.25)
    const r = buildResult(bench, ['inst-laser'], { 'inst-laser': laser, 'inst-camera': cam, 'inst-neutron': newScan() }, 42)
    expect(r.patch).toEqual({ instruments: ['inst-laser'] })
    expect(r.insights.map((i) => i.id)).toEqual(['bench-inst-camera', 'bench-inst-laser'])
    expect(r.insights[0].metric.value).toBe(0)
    expect(r.insights[1].metric.value).toBeGreaterThan(80)
    expect(r.insights[1].text).toContain('25 W')
    expect(r.durationS).toBe(42)
  })
})
