import { beforeEach, describe, expect, it } from 'vitest'
import { groundStations } from '../../../data/ground'
import { createDefaultDesign } from '../../../sim/budgets'
import { forgetRememberedHours, hoursAfterSwitch, rememberHours } from './hours'

describe('comms hours per ground station', () => {
  beforeEach(forgetRememberedHours)
  it('restores the hours set on a station when switching back to it', () => {
    const [a, b] = groundStations
    const onA = { ...createDefaultDesign(), groundStation: a.id, contactHours: 1 }
    rememberHours(onA)
    const onB = { ...onA, groundStation: b.id, contactHours: hoursAfterSwitch(onA, b) }
    rememberHours(onB)
    expect(hoursAfterSwitch(onB, a)).toBe(Math.min(1, a.contactHoursPerDay))
  })
  it('keeps the old rule for a station never visited', () => {
    const [a, b] = groundStations
    const d = { ...createDefaultDesign(), groundStation: a.id, contactHours: 3 }
    expect(hoursAfterSwitch(d, b)).toBe(Math.min(3, b.contactHoursPerDay))
  })
})
