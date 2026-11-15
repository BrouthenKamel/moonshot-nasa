import { describe, expect, it } from 'vitest'
import { computeBudgets, createDefaultDesign } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { buildBayView, type BoardRow } from './bayView'
import { redCause } from './redCause'

const row = (r: Partial<BoardRow>): BoardRow => ({ key: 'mass', title: '', text: '', value: 0, limit: 0, tone: 'red', reason: '', ...r })

describe('redCause', () => {
  it('names a braking shortfall with the real numbers, rounded to tens', () => {
    expect(redCause(row({ key: 'deltav', value: 563, limit: 48 }))).toBe(
      'Cannot reach: this engine has about 50 m/s of braking; the trip to the Moon needs about 560.',
    )
  })

  it('names each other shortfall from the bar it reads', () => {
    expect(redCause(row({ key: 'mass', value: 15.24, limit: 14 }))).toBe('Too heavy: the craft weighs 15.2 kg; the ride takes at most 14.0 kg.')
    expect(redCause(row({ key: 'volume', value: 6.8, limit: 6 }))).toBe('Does not fit: the parts fill 6.8 U of the 6 U box.')
    expect(redCause(row({ key: 'power', value: 45, limit: 28 }))).toBe('Not enough power: the craft draws 45 W; the panels make 28 W.')
    expect(redCause(row({ key: 'money', value: 27.14, limit: 25 }))).toBe('Over budget: the craft costs $27.1M; the budget is $25.0M.')
    expect(redCause(row({ key: 'time', value: 9, limit: 8 }))).toBe('Not ready in time: the craft is ready in month 9; the ride leaves in month 8.')
  })

  it('falls back on the first sentence of the check when the numbers do not show the cause', () => {
    const r = row({ key: 'deltav', value: 600, limit: 0, reason: 'Without propulsion the craft cannot brake into lunar orbit; it flies past the Moon. More text.' })
    expect(redCause(r)).toBe('Cannot reach: without propulsion the craft cannot brake into lunar orbit; it flies past the Moon.')
  })

  it('names an ion engine starved of power with both wattages', () => {
    const r = row({
      key: 'deltav',
      value: 450,
      limit: 1300,
      reason: 'The ion engine needs 56 W. While thrusting it may use three quarters of the 28 W array, and the bus takes its share of that first: 9 W are left for the engine. Fit the large solar array.',
    })
    expect(redCause(r)).toBe('Cannot reach: the ion engine needs 56 W to thrust; the panels leave it 9 W.')
  })

  it('reads the real budgets: a cold-gas thruster cannot brake into lunar orbit', () => {
    const design = { ...createDefaultDesign(), propulsion: 'prop-coldgas' }
    const budgets = computeBudgets(design, 'engineer')
    const dv = buildBayView(design, budgets, goNoGo(design, budgets).checks).rows.find((r) => r.key === 'deltav')!
    expect(dv.tone).toBe('red')
    expect(redCause(dv)).toMatch(/^Cannot reach: /)
    expect(redCause(dv)).toMatch(/\d/)
  })
})
