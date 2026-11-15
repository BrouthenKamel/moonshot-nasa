import { describe, it, expect } from 'vitest'
import { computeBudgets, createDefaultDesign } from './budgets'
import { goNoGo } from './checks'
import { modelConstants as C } from '../data/brief'
import type { Budgets, Design } from './types'

/**
 * Power truth (QC, 15 Nov): the Go/No-Go screen showed three "power left" figures from three
 * formulas and never said which. Each power sentence now names its basis and the real cause,
 * and its numbers add up. At most three numbers per sentence (screen budget).
 */

const rowOf = (d: Design, resource: string, b: Budgets = computeBudgets(d, 'engineer')) =>
  goNoGo(d, b).checks.find((c) => c.resource === resource)!
const numbers = (s: string) => (s.match(/\d+(\.\d+)?/g) ?? []).map(Number)

/** The starting craft (ion engine) on body-mounted panels: 28 W array, 18 W bus */
const bodyPanels = (orbit: string): Design => ({ ...createDefaultDesign(), solar: 'solar-body', orbit, contactHours: 1 })

describe('the delta-v row says the engine gets three quarters of the array', () => {
  it('names the share and its numbers add up', () => {
    const d = bodyPanels('orbit-halo')
    const b = computeBudgets(d, 'engineer')
    const r = rowOf(d, 'Delta-v', b).reason
    expect(C.thrustPowerShare).toBe(0.75) // "three quarters" stays true
    expect(r).toContain(`three quarters of the ${b.powerGenerated} W array`)
    expect(r).toContain(`${Math.round(b.powerGenerated * C.thrustPowerShare - b.busPower)} W are left for the engine`)
    expect(numbers(r).length).toBeLessThanOrEqual(3)
  })
})

describe('the power row names the real cause', () => {
  it('a shaded orbit: the array covers the bus in sun, so the sentence blames shadow and radio, not the bus', () => {
    const d = bodyPanels('orbit-100km')
    const b = computeBudgets(d, 'engineer')
    expect(b.powerGenerated).toBeGreaterThan(b.busPower) // 28 > 18: the old "nothing left after the bus" was false
    expect(b.scienceDuty).toBe(0)
    const row = rowOf(d, 'Power', b)
    expect(row.status).toBe('red')
    expect(row.reason).toContain(`In full sun the array makes ${b.powerGenerated} W, but this orbit is sunlit only ${Math.round(b.sunlitShare * 100)}% of the time`)
    expect(row.reason).toContain('averaged over the orbit')
    expect(row.reason).not.toContain('the bus alone takes')
    expect(numbers(row.reason).length).toBeLessThanOrEqual(3)
  })

  it('an array that cannot even carry the bus in full sun says so', () => {
    const d = bodyPanels('orbit-halo')
    const b = { ...computeBudgets(d, 'engineer'), powerGenerated: 15, scienceDuty: 0 }
    const r = rowOf(d, 'Power', b).reason
    expect(r).toBe(`In full sun the array makes 15 W and the bus alone takes ${b.busPower} W: nothing is left for the instruments. Fit a larger solar array.`)
  })

  it('limited in full sun: the sentence gives the watts behind the percentage', () => {
    const d = bodyPanels('orbit-halo')
    const b = computeBudgets(d, 'engineer')
    const row = rowOf(d, 'Power', b)
    expect(row.status).toBe('yellow')
    const left = b.powerGenerated - b.busPower
    expect(row.reason).toBe(
      `Even in full sun the array leaves ${left} W after the bus, and the instruments need ${b.instrumentPower} W: they can run only ${Math.round(b.scienceDuty * 100)}% of the time they could.`
    )
    expect(Math.round((left / b.instrumentPower) * 100)).toBe(Math.round(b.scienceDuty * 100))
  })

  it('limited on average: the sentence names shadow and radio time', () => {
    const d = bodyPanels('orbit-halo')
    const b = { ...computeBudgets(d, 'engineer'), powerGenerated: 100, busPower: 10, instrumentPower: 10, scienceDuty: 0.5 }
    expect(rowOf(d, 'Power', b).reason).toBe(
      'Averaged over the orbit’s shadow and radio time, power only lets the instruments run 50% of the time they could.'
    )
  })
})
