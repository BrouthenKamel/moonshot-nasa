import { describe, expect, it } from 'vitest'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { flashlightDesign, iceCubeDesign } from '../../sim/fixtures'
import { POLL_ORDER, stations } from './stations'

describe('Go / No-Go stations', () => {
  it('every check answers to exactly one station, in poll order', () => {
    const result = goNoGo(iceCubeDesign, computeBudgets(iceCubeDesign, 'engineer'))
    const st = stations(result.checks)
    expect(st.map((s) => s.role)).toEqual(POLL_ORDER)
    expect(st.reduce((n, s) => n + s.checks.length, 0)).toBe(result.checks.length)
  })

  it('a station is red when one of its checks is red, and the poll is go only with no red station', () => {
    for (const design of [iceCubeDesign, flashlightDesign, { ...flashlightDesign, radio: 'radio-uhf' }]) {
      const result = goNoGo(design, computeBudgets(design, 'engineer'))
      const st = stations(result.checks)
      for (const s of st) expect(s.status === 'red').toBe(s.checks.some((c) => c.status === 'red'))
      expect(st.every((s) => s.status !== 'red')).toBe(result.canGo)
    }
  })
})
