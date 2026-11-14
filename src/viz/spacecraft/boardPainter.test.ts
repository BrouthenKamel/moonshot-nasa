import { describe, it, expect } from 'vitest'
import { paintBoard, paintScale, paintTag, wrapText, animFromView, BOARD_H } from './boardPainter'
import { buildBayView, type BayView } from './bayView'
import { computeBudgets, createDefaultDesign } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { flashlightDesign } from '../../sim/fixtures'
import type { Budgets, Design } from '../../sim/types'

interface Call {
  name: string
  args: unknown[]
}

/** A stand-in 2D context that records every call. */
function fakeContext() {
  const calls: Call[] = []
  const state: Record<string, unknown> = {}
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      if (prop === 'measureText') return (text: string) => ({ width: String(text).length * 18 })
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

function view(design: Design, patch: Partial<Budgets> = {}): BayView {
  const b = { ...computeBudgets(design, 'engineer'), ...patch }
  return buildBayView(design, b, goNoGo(design, b).checks)
}
const base = createDefaultDesign()
const cases: Record<string, BayView> = {
  default: view(base),
  flashlight: view(flashlightDesign),
  heavy: view({ ...base, propulsion: 'prop-chemical-large' }),
  overfull: view({ ...flashlightDesign, instruments: ['inst-laser', 'inst-neutron'], radio: 'radio-xband' }),
  noPower: view({ ...base, solar: 'solar-body' }),
  noRoute: view(base, { captureDeltaV: null, deltaVAvailable: 0 }),
  missing: view({ ...base, battery: 'nope', propulsion: 'nope' }),
}

describe('boardPainter', () => {
  for (const [name, v] of Object.entries(cases)) {
    it(`paints only finite numbers inside the board (${name})`, () => {
      for (const reduced of [false, true]) {
        const { ctx, calls } = fakeContext()
        paintBoard(ctx, v, { ...animFromView(v), t: 1.3, reduced })
        paintScale(ctx, v, animFromView(v).shown.mass)
        for (const b of v.stack) paintTag(ctx, b)
        for (const c of calls)
          for (const a of c.args) if (typeof a === 'number') expect(Number.isFinite(a), c.name).toBe(true)
        for (const r of calls.filter((c) => c.name === 'fillRect'))
          expect((r.args[1] as number) + (r.args[3] as number)).toBeLessThanOrEqual(BOARD_H)
      }
    })
  }

  it('wraps the longest reason into at most three lines', () => {
    const { ctx } = fakeContext()
    const longest = Object.values(cases)
      .flatMap((v) => v.rows.map((r) => `${r.title}: ${r.reason}`))
      .sort((a, b) => b.length - a.length)[0]
    const lines = wrapText(ctx, longest, 1420)
    expect(lines.length).toBeLessThanOrEqual(3)
    expect(lines.join(' ').length).toBeGreaterThan(20)
  })

  it('keeps short text whole', () => {
    const { ctx } = fakeContext()
    expect(wrapText(ctx, 'FITS. READY FOR THE NEXT BUILDING.', 1420)).toEqual(['FITS. READY FOR THE NEXT BUILDING.'])
  })

  it('names the board after the building', () => {
    const { ctx, calls } = fakeContext()
    paintBoard(ctx, cases.default, animFromView(cases.default))
    expect(calls.some((c) => c.name === 'fillText' && c.args[0] === 'FACTORY · LUNAR ICE MAPPER · SPACECRAFT')).toBe(true)
  })
})
