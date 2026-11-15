import { describe, it, expect } from 'vitest'
import { paintScreen, animFromView, SCREEN_H, statusChipBox } from './screenPainter'
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
      expect(texts.some((t) => t.length > 10 && check.reason.includes(t))).toBe(true)
    }
  })

  it('keeps the advice of a long Go/No-Go line instead of cutting it off at the edge (QC #56)', () => {
    const { ctx, calls } = fakeContext()
    const v = cases.missed
    paintScreen(ctx, v, animFromView(v))
    const lines = calls.filter((c) => c.name === 'fillText' && (c.args[2] as number) > 700).map((c) => String(c.args[0]))
    const time = v.checks.find((c) => c.resource === 'Time')!
    expect(time.reason).toContain('take a later ride')
    expect(lines.some((t) => t.includes('take a later ride'))).toBe(true)
    // Nothing on the check lines runs past the right edge (the fake context measures 18 px a character);
    // the status tag's centred label is checked on its own below
    for (const c of calls.filter((c) => c.name === 'fillText' && (c.args[2] as number) > 700 && c.args[0] !== v.status.chip))
      expect((c.args[1] as number) + String(c.args[0]).length * 18).toBeLessThanOrEqual(2400)
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

  // Integration review, 15 Nov: the tag was cut by the "Select instruments" button and the title card
  it('puts the status tag in the bottom strip, clear of the header row, and ends the check lines before it', () => {
    for (const v of Object.values(cases)) {
      const { ctx, calls } = fakeContext()
      paintScreen(ctx, v, animFromView(v))
      const tag = calls.find((c) => c.name === 'fillText' && c.args[0] === v.status.chip)!
      expect(tag).toBeTruthy()
      expect(tag.args[2] as number).toBeGreaterThan(700)
      const box = statusChipBox(ctx, v)
      expect(box.x + box.w).toBeLessThanOrEqual(2400)
      expect(box.y + box.h).toBeLessThanOrEqual(SCREEN_H)
      for (const c of calls.filter((c) => c.name === 'fillText' && (c.args[2] as number) > 700 && c.args[0] !== v.status.chip))
        expect((c.args[1] as number) + String(c.args[0]).length * 18).toBeLessThanOrEqual(box.x)
    }
  })

  it('names only the room in the header, clear of the step title card (playtest, 15 Nov)', () => {
    const all = texts(cases.nominal, true)
    expect(all).toContain('COMMS CENTER')
    expect(all.some((t) => t.includes('MISSION PLANNING'))).toBe(false)
  })
})

function texts(v: PlanningView, detail: boolean) {
  const { ctx, calls } = fakeContext()
  paintScreen(ctx, v, animFromView(v), { detail })
  return calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]))
}

// Screen budget (Jakob, 15 Nov): with the Plan screen's Details closed the wall keeps one line per panel
describe('paintScreen without details', () => {
  it('keeps the money free and drops the colour legend, cap and spend line', () => {
    const v = cases.nominal
    const full = texts(v, true)
    const lean = texts(v, false)
    expect(lean).toContain(`$${v.budgetGap.toFixed(1)}M free`)
    for (const b of v.costBlocks.filter((b) => b.amount > 0)) {
      expect(full.some((t) => t.startsWith(`${b.label} $`))).toBe(true)
      expect(lean.some((t) => t.startsWith(`${b.label} $`))).toBe(false)
    }
    expect(lean.some((t) => t.startsWith('cap ') || t.startsWith('spend up to'))).toBe(false)
  })

  // Jakob, 15 Nov: "I like this visual" (the road picture), "what i like more … is all the text it removes"
  it('keeps the road picture (headline, bar, READY, ride rocket) without the month numbers and footer', () => {
    for (const v of [cases.nominal, cases.missed]) {
      const lean = texts(v, false)
      expect(lean).toContain(v.headline)
      expect(lean).toContain(`BUILD ${v.buildTurns}`)
      expect(lean).toContain('RIDE')
      expect(lean.some((t) => t.startsWith('RIDE · END OF MONTH'))).toBe(false)
      expect(lean.some((t) => t.startsWith('Build: from your parts'))).toBe(false)
      expect(lean).not.toContain('1')
      // Details open: the full schedule is back
      const full = texts(v, true)
      expect(full).toContain(`RIDE · END OF MONTH ${v.rideMonth}`)
      expect(full).toContain('1')
    }
    expect(texts(cases.nominal, false)).toContain('READY')
  })

  it('keeps the risk gauge reading but not its scale', () => {
    const v = cases.nominal
    const lean = texts(v, false)
    expect(lean).toContain(`×${v.riskFactor.toFixed(1)}`)
    expect(texts(v, true)).toContain('×2.0')
    if (v.riskFactor.toFixed(1) !== '2.0') expect(lean).not.toContain('×2.0')
  })

  it('lists only the Go/No-Go checks that need the player', () => {
    const v = cases.missed
    const lean = texts(v, false)
    const word = { green: 'GO', yellow: 'CAUTION', red: 'NO-GO' } as const
    for (const c of v.checks) expect(lean.includes(`${word[c.status]} · ${c.resource.toUpperCase()}`)).toBe(c.status !== 'green')
  })
})
