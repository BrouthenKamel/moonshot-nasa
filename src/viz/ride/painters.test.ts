import { describe, it, expect } from 'vitest'
import { paintSky } from './skyPainter'
import { paintBoard, rowRect, BOARD_W, BOARD_H } from './boardPainter'
import { paintTank, tankTargets } from './tankPainter'
import { buildRideView, type RideView } from './rideView'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { flashlightDesign, iceCubeDesign, lunahMapDesign } from '../../sim/fixtures'
import type { Design } from '../../sim/types'

interface Call {
  name: string
  args: unknown[]
}

/** A stand-in 2D context that records every call. */
function fakeContext() {
  const calls: Call[] = []
  const state: Record<string, unknown> = {}
  const gradient = { addColorStop() {} }
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      if (prop === 'measureText') return (text: string) => ({ width: String(text).length * 18 })
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient
      return (...args: unknown[]) => {
        calls.push({ name: prop, args })
      }
    },
    set(target, prop: string, value) {
      target[prop] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

function view(design: Design): RideView {
  const b = computeBudgets(design, 'engineer')
  return buildRideView(design, 'engineer', b, goNoGo(design, b).checks)
}

const STATES: Design[] = []
for (const d of [iceCubeDesign, flashlightDesign, lunahMapDesign])
  for (const ride of ['ride-gto', 'ride-lunar', 'ride-commercial'])
    for (const transfer of ['transfer-direct', 'transfer-low-energy']) STATES.push({ ...d, ride, transfer })
STATES.push({ ...iceCubeDesign, solar: 'solar-body' })

function finiteArgs(calls: Call[]) {
  for (const c of calls)
    for (const a of c.args)
      if (typeof a === 'number') expect(Number.isFinite(a), `${c.name}(${c.args.join(', ')})`).toBe(true)
}

const texts = (calls: Call[]) => calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]))

describe('ride painters', () => {
  it('painters never draw a non-finite number', () => {
    for (const d of STATES) {
      const v = view(d)
      for (const paint of [
        (ctx: CanvasRenderingContext2D) => paintSky(ctx, v, null),
        (ctx: CanvasRenderingContext2D) => paintBoard(ctx, v, null),
        (ctx: CanvasRenderingContext2D) => paintTank(ctx, v, tankTargets(v)),
      ]) {
        const { ctx, calls } = fakeContext()
        paint(ctx)
        expect(calls.length).toBeGreaterThan(10)
        finiteArgs(calls)
      }
    }
  })

  it('the sky names the state', () => {
    for (const d of STATES) {
      const v = view(d)
      const { ctx, calls } = fakeContext()
      paintSky(ctx, v, null)
      const t = texts(calls)
      expect(t).toContain(v.path.dropLabel)
      if (v.path.blockedLabel) expect(t).toContain(v.path.blockedLabel)
      expect(t.includes('CAPTURE BURN')).toBe(v.reach === 'ok')
    }
  })

  it('the board lists three rides and their status', () => {
    for (const d of STATES) {
      const v = view(d)
      const { ctx, calls } = fakeContext()
      paintBoard(ctx, v, null)
      const t = texts(calls)
      expect(t).toContain('DEPARTURES')
      for (const r of v.rows) expect(t).toContain(r.statusLabel)
    }
  })

  it('tank targets', () => {
    for (const d of STATES) {
      const v = view(d)
      const levels = tankTargets(v)
      if (v.tank.greyLabel) {
        expect(levels).toEqual([])
        continue
      }
      expect(levels).toHaveLength(v.tank.layers.length)
      for (const l of levels) {
        expect(l).toBeGreaterThanOrEqual(0)
        expect(l).toBeLessThanOrEqual(1)
      }
      expect(levels.reduce((s, l) => s + l, 0)).toBeLessThanOrEqual(1.0001)
    }
    const sum = tankTargets(view(iceCubeDesign)).reduce((s, l) => s + l, 0)
    expect(sum).toBeCloseTo(1, 6)
  })

  it('row rects are inside the board and do not overlap', () => {
    const rects = [0, 1, 2].map(rowRect)
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w).toBeLessThanOrEqual(BOARD_W)
      expect(r.y + r.h).toBeLessThanOrEqual(BOARD_H)
    }
    for (let i = 1; i < rects.length; i++) expect(rects[i].y).toBeGreaterThanOrEqual(rects[i - 1].y + rects[i - 1].h)
  })
})
