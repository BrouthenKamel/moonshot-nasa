import { describe, expect, it } from 'vitest'
import { aimIndexForKey, hoursFromTrackX } from './consoleControls'

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
})
