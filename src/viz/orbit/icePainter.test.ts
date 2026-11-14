import { describe, it, expect } from 'vitest'
import { paintIce, ICE_GLOW, type IcePaint } from './icePainter'

/** A stand-in 2D context that records every call and every style set. */
function fakeContext() {
  const calls: unknown[][] = []
  const fills: string[] = []
  const state: Record<string, unknown> = {}
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      return (...args: unknown[]) => {
        calls.push([prop, ...args])
        if (prop === 'fill') fills.push(String(target.fillStyle))
      }
    },
    set(target, prop: string, value) {
      target[prop] = value
      calls.push(['set:' + prop, value])
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls, fills }
}

function callsOf(p: IcePaint) {
  const f = fakeContext()
  paintIce(f.ctx, p)
  return f.calls
}
function fillStylesOf(p: IcePaint) {
  const f = fakeContext()
  paintIce(f.ctx, p)
  return f.fills
}

describe('paintIce', () => {
  it('lights ice only when the instruments are in range', () => {
    expect(fillStylesOf({ strips: 40, tone: 'ice', angle0: 0 })).toContain(ICE_GLOW)
    expect(fillStylesOf({ strips: 40, tone: 'blind', angle0: 0 })).not.toContain(ICE_GLOW)
    expect(fillStylesOf({ strips: 40, tone: 'none', angle0: 0 })).not.toContain(ICE_GLOW)
    expect(fillStylesOf({ strips: 0, tone: 'ice', angle0: 0 })).not.toContain(ICE_GLOW)
  })
  it('draws one four-cornered strip per pass', () => {
    const closes = (n: number) => callsOf({ strips: n, tone: 'blind', angle0: 0 }).filter((c) => c[0] === 'closePath').length
    expect(closes(30) - closes(0)).toBe(30)
  })
  it('is deterministic and balanced', () => {
    const a = callsOf({ strips: 25, tone: 'ice', angle0: 1 })
    const b = callsOf({ strips: 25, tone: 'ice', angle0: 1 })
    expect(a).toEqual(b)
    expect(a.filter((c) => c[0] === 'save').length).toBe(a.filter((c) => c[0] === 'restore').length)
    expect(a.flat().every((x) => typeof x !== 'number' || Number.isFinite(x))).toBe(true)
  })
})
