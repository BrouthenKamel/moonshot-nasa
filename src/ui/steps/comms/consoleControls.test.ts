import { describe, expect, it } from 'vitest'
import { aimIndexForKey, dishPriceLine, dishTradeoff, hoursFromTrackX } from './consoleControls'
import { groundStations } from '../../../data/ground'

describe('Comms console controls', () => {
  it('snaps the contact track to quarter hours within the station limit', () => {
    expect(hoursFromTrackX(0, 0, 100, 2)).toBe(0.25)
    expect(hoursFromTrackX(100, 0, 100, 2)).toBe(2)
    expect(hoursFromTrackX(50, 0, 100, 2)).toBe(1.25)
    expect(hoursFromTrackX(500, 0, 100, 6)).toBe(6)
  })

  it('aims the dish by keyboard, one station a step, clamped at the ends', () => {
    expect(aimIndexForKey('ArrowRight', 1, 3)).toBe(2)
    expect(aimIndexForKey('ArrowRight', 2, 3)).toBe(2)
    expect(aimIndexForKey('ArrowLeft', 0, 3)).toBe(0)
    expect(aimIndexForKey('ArrowDown', 2, 3)).toBe(1)
    expect(aimIndexForKey('Home', 2, 3)).toBe(0)
    expect(aimIndexForKey('End', 0, 3)).toBe(2)
    expect(aimIndexForKey('Enter', 1, 3)).toBeNull()
    expect(aimIndexForKey('ArrowRight', 0, 0)).toBeNull()
  })

  it('says what each dish size trades: rate against hours, from the station data', () => {
    const [small, partner, dsn] = groundStations
    expect(dishTradeoff(small)).toBe('2 kbps · up to 6 h a day')
    expect(dishTradeoff(partner)).toBe('64 kbps · up to 2 h a day')
    expect(dishTradeoff(dsn)).toBe('128 kbps · 1 hour a day at most')
    expect(dishPriceLine(0.03)).toBe('$0.03M a month')
  })

  it('labels the track with the short station names, smallest dish first', () => {
    expect(groundStations.map((g) => g.shortName)).toEqual(['University 4 m', 'Partner 21 m', 'DSN 34 m'])
  })
})
