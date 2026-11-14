import { describe, it, expect } from 'vitest'
import { CRATERS, TILE_LENGTH, TRACK_CRATER, groundHeight, shadowAt, bakeGround, SUN_DIRECTION } from './ground'

describe('ground', () => {
  it('is the same on every call', () => {
    expect(groundHeight(12.3, 40.1)).toBe(groundHeight(12.3, 40.1))
    expect(bakeGround()).toBe(bakeGround())
    expect(CRATERS.length).toBeGreaterThan(60)
  })

  it('joins seamlessly where the tile repeats', () => {
    for (const x of [-60, -10, 0, 25, 70]) expect(groundHeight(x, 0)).toBeCloseTo(groundHeight(x, TILE_LENGTH), 2)
  })

  it('keeps the floor of the track crater in shadow', () => {
    expect(shadowAt(TRACK_CRATER.x, TRACK_CRATER.u)).toBeGreaterThan(0.9)
  })

  it('lights open ground on the track before the crater', () => {
    expect(shadowAt(0, 30)).toBeLessThan(0.1)
  })

  it('wraps u around the tile', () => {
    expect(shadowAt(TRACK_CRATER.x, TRACK_CRATER.u + TILE_LENGTH)).toBeCloseTo(shadowAt(TRACK_CRATER.x, TRACK_CRATER.u), 5)
  })

  it('keeps small craters off the ground track', () => {
    for (const c of CRATERS) {
      if (c === TRACK_CRATER) continue
      expect(Math.abs(c.x)).toBeGreaterThanOrEqual(3.5 + c.r - 1e-9)
    }
  })

  it('puts the Sun 9 degrees above the horizon', () => {
    const { x, up, u } = SUN_DIRECTION
    expect(Math.hypot(x, up, u)).toBeCloseTo(1, 6)
    expect((Math.asin(up) * 180) / Math.PI).toBeCloseTo(9, 3)
  })
})
