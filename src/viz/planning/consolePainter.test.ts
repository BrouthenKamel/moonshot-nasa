import { describe, it, expect } from 'vitest'
import { CONSOLE, paintConsole, RECOMMENDED_Z, TITLE_Z, FADER_SCALE_Z } from './consolePainter'
import { buildPlanningView } from './planningView'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { flashlightDesign } from '../../sim/fixtures'

/** Paints the console into a recording context: every fillText with its canvas position */
function paint() {
  const texts: { text: string; x: number; y: number }[] = []
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      if (prop === 'fillText') return (t: string, x: number, y: number) => texts.push({ text: String(t), x, y })
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
  return texts
}

/** Panel z of a canvas y (the inverse of the painter's pz) */
const zOf = (y: number) => (y / CONSOLE.canvasH - 0.5) * CONSOLE.depth

describe('paintConsole', () => {
  it('marks the recommended 10% reserve on the fader (CubeSat 101, QC #57)', () => {
    expect(paint().map((t) => t.text)).toContain('10% RECOMMENDED (CUBESAT 101)')
  })

  it('prints the recommendation above the fader, clear of the handle and the value lamps at every setting', () => {
    const note = paint().find((t) => t.text.includes('RECOMMENDED'))!
    const z = zOf(note.y)
    expect(z).toBeCloseTo(RECOMMENDED_Z, 5)
    // Between the title row and the value scale
    expect(z).toBeGreaterThan(TITLE_Z)
    expect(z).toBeLessThan(FADER_SCALE_Z)
    // The handle cap spans fader.z ± 0.14 and the lamps sit at fader.z + 0.2; the 22 px note is ~0.05 deep
    const half = (22 / CONSOLE.canvasH) * CONSOLE.depth
    expect(z + half).toBeLessThan(CONSOLE.fader.z - 0.14)
    // Centred on the fader, not on the 10% mark near its end
    expect(note.x).toBeCloseTo(((CONSOLE.fader.x0 + CONSOLE.fader.x1) / 2 / CONSOLE.width + 0.5) * CONSOLE.canvasW, 5)
  })
})
