import { describe, it, expect } from 'vitest'
import { paintScreen, animFromView, SCREEN_H } from './screenPainter'
import { buildPlanningView, type PlanningView } from './planningView'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { flashlightDesign } from '../../sim/fixtures'
import type { Budgets, Design } from '../../sim/types'

interface Call { name: string; args: unknown[] }

/** A stand-in 2D context that records every call. */
function fakeContext() {
  const calls: Call[] = []
  const state: Record<string, unknown> = {}
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      if (prop === 'measureText') return (text: string) => ({ width: String(text).length * 18 })
      if (prop === 'createPattern') return () => ({})
      return (...args: unknown[]) => { calls.push({ name: prop, args }) }
    },
    set(target, prop: string, value) {
      target[prop] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

function view(design: Design, patch: Partial<Budgets> = {}): PlanningView {
  const b = { ...computeBudgets(design, 'engineer'), ...patch }
  return buildPlanningView(design, b, goNoGo(design, b).checks)
}

const cases: Record<string, PlanningView> = {
  nominal: view(flashlightDesign),
  untested: view({ ...flashlightDesign, planning: { ...flashlightDesign.planning, testTurns: 0, reservePercent: 0 } }),
  missed: view(flashlightDesign, { readyTurn: 10, rideTurn: 8, timeMarginTurns: -2, buildTurns: 6 }),
  overCap: view(flashlightDesign, { totalCost: 40, budgetCap: 25, spendable: 22.5, reserveAmount: 2.5 }),
  longPlan: view(flashlightDesign, { readyTurn: 14, rideTurn: 8, timeMarginTurns: -6, buildTurns: 10 }),
}

describe('paintScreen', () => {
  for (const [name, v] of Object.entries(cases)) {
    it(`paints the ${name} state with finite numbers only`, () => {
      const { ctx, calls } = fakeContext()
      for (const launchT of [-1, 0.2, 3]) paintScreen(ctx, v, { ...animFromView(v, 1.3), launchT })
      const numbers = calls.flatMap((c) => c.args.filter((a) => typeof a === 'number')) as number[]
      expect(calls.length).toBeGreaterThan(50)
      expect(numbers.every(Number.isFinite)).toBe(true)
    })
  }

  it('writes the Time and Budget reasons from goNoGo on the screen', () => {
    const { ctx, calls } = fakeContext()
    const v = cases.missed
    paintScreen(ctx, v, animFromView(v))
    const texts = calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]).replace(/…$/, ''))
    for (const check of v.checks) {
      expect(check.reason.length).toBeGreaterThan(0)
      expect(texts.some((t) => t.length > 10 && check.reason.startsWith(t))).toBe(true)
    }
  })

  it('keeps the tank inside the screen when costs pass the cap', () => {
    const { ctx, calls } = fakeContext()
    paintScreen(ctx, cases.overCap, animFromView(cases.overCap))
    const tankX = 20 + 34 // the tank's left edge in paintScreen
    const tankRects = calls.filter((c) => c.name === 'fillRect' && c.args[0] === tankX)
    expect(tankRects.length).toBeGreaterThan(3)
    for (const c of tankRects) {
      const [, y, , h] = c.args as number[]
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y + Math.max(0, h)).toBeLessThanOrEqual(SCREEN_H)
    }
  })
})
