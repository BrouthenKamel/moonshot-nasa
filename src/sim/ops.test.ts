import { describe, it, expect } from 'vitest'
import { monthOptions, EXTRA_PASS_COST } from './ops'
import { computeBudgets } from './budgets'
import { getDefaultAction, initSim, isSimComplete, stepTurn } from './simulate'
import { flashlightDesign } from './fixtures'
import type { SimState, TurnAction } from './types'

function inOrbit(): SimState {
  for (let seed = 1; seed < 50; seed++) {
    let s = initSim(flashlightDesign, 'engineer', seed)
    const action: TurnAction = { ...getDefaultAction(), autoDecide: true }
    let n = 0
    while (!isSimComplete(s) && s.phase !== 'orbit' && n++ < 60) s = stepTurn(s, action)
    if (s.phase === 'orbit') return s
  }
  throw new Error('no seed reached orbit')
}

describe('monthOptions', () => {
  const s = inOrbit()
  const b = computeBudgets(s.design, s.difficulty)
  const o = monthOptions(s)
  const mb = (x: number) => `${Math.round(x)} MB`

  it('offers the three operating modes in order', () => {
    expect(o.modes.map((m) => m.mode)).toEqual(['full-science', 'reduced', 'safe-mode'])
    for (const m of o.modes) expect(m.effect.length).toBeGreaterThan(10)
  })

  it('full science quotes the data made against the link, from the craft itself', () => {
    const full = o.modes[0].effect
    expect(full).toContain(mb(b.dataPerTurn * s.flight.scienceFactor))
    expect(full).toContain(mb(b.downlinkPerTurn))
  })

  it('reduced makes half the data and quotes the battery margin', () => {
    const reduced = o.modes[1].effect
    expect(reduced).toContain(mb((b.dataPerTurn * s.flight.scienceFactor) / 2))
    expect(reduced).toMatch(/Wh/)
  })

  it('safe mode says plainly that it maps nothing', () => {
    expect(o.modes[2].effect).toMatch(/no science/i)
  })

  it('the extra pass quotes the bigger link, its price and the money left', () => {
    expect(EXTRA_PASS_COST).toBe(0.1)
    expect(o.extraPass.effect).toContain(mb(b.downlinkPerTurn * 1.5))
    expect(o.extraPass.effect).toContain((s.flight.main + Math.max(0, s.flight.reserve)).toFixed(1))
    expect(o.extraPass.affordable).toBe(true)
  })
})
