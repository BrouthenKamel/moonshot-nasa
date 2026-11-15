import { describe, expect, it } from 'vitest'
import { ORBIT_SNAP_STOPS, radiusForOrbit, snapOrbitByRadius } from './orbitDraw'

describe('orbit draw snapping', () => {
  it('snaps distances cleanly to closest orbit stop', () => {
    expect(snapOrbitByRadius(70).id).toBe('orbit-elliptical')
    expect(snapOrbitByRadius(130).id).toBe('orbit-halo')
    expect(snapOrbitByRadius(210).id).toBe('orbit-100km')
  })

  it('returns the configured periapsis handle radius per orbit id', () => {
    for (const stop of ORBIT_SNAP_STOPS) {
      expect(radiusForOrbit(stop.id)).toBe(stop.radiusPx)
    }
  })
})
