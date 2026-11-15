import { describe, expect, it } from 'vitest'
import { createDefaultDesign } from '../../sim/budgets'
import { rides } from '../../data/rides'
import { DEFAULT_ROCKET } from '../../data/rocket'
import { boardIsStuck, buildResult, buildRows, destinationLabel, isSelectable, massFit, pickOutcome, rideCompat, waitLine } from './logic'

const design = createDefaultDesign()
const difficulty = 'engineer' as const

describe('rideshare manifest logic', () => {
  it('lists the three rides with slack = departure - ready', () => {
    const rows = buildRows(design, difficulty)
    expect(rows.map((r) => r.ride.id)).toEqual(rides.map((r) => r.id))
    for (const r of rows) {
      expect(r.slack).toBe(r.departure - r.ready)
      expect(r.missed).toBe(r.slack < 0)
    }
  })

  it('names destinations in board words', () => {
    expect(destinationLabel(rides[0])).toBe('GTO')
    expect(destinationLabel(rides[1])).toBe('Lunar trajectory')
  })

  it('flags a ride that leaves before the craft is ready as missed, with the wait cost', () => {
    const rows = buildRows(design, difficulty).map((r) => (r.ride.id === 'ride-lunar' ? { ...r, ready: 10, slack: -2, missed: true } : r))
    const out = pickOutcome(rows, 'ride-lunar')
    const lunar = rows.find((r) => r.ride.id === 'ride-lunar')!
    if (!boardIsStuck(rows)) expect(out.kind).toBe('missed')
    expect(waitLine(lunar)).toMatch(/leaves in month 8.*ready in month 10/)
    const late = rows.map((r) => ({ ...r, ready: r.departure + 2, slack: -2, missed: true }))
    expect(boardIsStuck(late)).toBe(true)
    expect(pickOutcome(late, 'ride-lunar').kind).toBe('ok')
  })

  it('refuses a ride the engine cannot use, with the sim reason', () => {
    const chem = { ...design, propulsion: 'prop-chemical' }
    const c = rideCompat(chem, difficulty, 'ride-gto')
    expect(c.ok).toBe(false)
    expect(c.reason).toMatch(/ion engine/)
    expect(rideCompat(chem, difficulty, 'ride-lunar').ok).toBe(true)
    expect(isSelectable(buildRows(chem, difficulty).find((r) => r.ride.id === 'ride-gto')!)).toBe(false)
  })

  it('mass fit uses the ride limit', () => {
    const f = massFit(design, difficulty, 'ride-gto')
    expect(f.limit).toBe(14)
    expect(f.margin).toBeCloseTo(f.limit - f.mass)
  })

  it('builds the patch and the two insights', () => {
    const r = buildResult({ design, difficulty, rideId: 'ride-lunar', durationS: 41.6 })
    expect(r.patch).toEqual({ ride: 'ride-lunar' })
    expect(r.insights.map((i) => i.id)).toEqual(['ride-wait', 'ride-mass'])
    expect(r.insights[0].room).toBe('launch-hangar')
    expect(r.insights[0].metric.label).toBe('slack')
    expect(r.durationS).toBe(42)
    const withRocket = buildResult({ design, difficulty, rideId: 'ride-lunar', rocket: DEFAULT_ROCKET, durationS: 5 })
    expect(withRocket.patch).toHaveProperty('rocket')
  })
})
