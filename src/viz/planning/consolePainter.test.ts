import { describe, it, expect } from 'vitest'
import { paintConsole } from './consolePainter'
import { buildPlanningView } from './planningView'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { flashlightDesign } from '../../sim/fixtures'

describe('paintConsole', () => {
  it('marks the recommended 10% reserve on the fader (CubeSat 101, QC #57)', () => {
    const texts: string[] = []
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(target, prop: string) {
        if (prop in target) return target[prop]
        if (prop === 'fillText') return (t: string) => texts.push(String(t))
        if (prop === 'measureText') return (t: string) => ({ width: String(t).length * 14 })
        return () => {}
      },
      set(target, prop: string, value) {
        target[prop] = value
        return true
      },
    }) as unknown as CanvasRenderingContext2D
    const b = computeBudgets(flashlightDesign, 'engineer')
    paintConsole(ctx, buildPlanningView(flashlightDesign, b, goNoGo(flashlightDesign, b).checks))
    expect(texts).toContain('10% RECOMMENDED (CUBESAT 101)')
  })
})
