/** Pure geometry helpers for drawing and magnetically snapping an orbit around the Moon in Step 4. */

export interface OrbitSnapStop {
  id: 'orbit-elliptical' | 'orbit-halo' | 'orbit-100km'
  radiusPx: number
  label: string
}

export const ORBIT_SNAP_STOPS: ReadonlyArray<OrbitSnapStop> = [
  { id: 'orbit-elliptical', radiusPx: 82, label: '15 km Elliptical' },
  { id: 'orbit-halo', radiusPx: 132, label: 'Halo (NRHO)' },
  { id: 'orbit-100km', radiusPx: 186, label: '100 km Polar' },
]

export function radiusForOrbit(orbitId: string): number {
  return ORBIT_SNAP_STOPS.find((s) => s.id === orbitId)?.radiusPx ?? ORBIT_SNAP_STOPS[0].radiusPx
}

/** Snap a pointer distance from the Moon centre to the closest catalogue orbit stop. */
export function snapOrbitByRadius(distancePx: number): OrbitSnapStop {
  let best = ORBIT_SNAP_STOPS[0]
  let bestDiff = Math.abs(distancePx - best.radiusPx)
  for (const stop of ORBIT_SNAP_STOPS) {
    const diff = Math.abs(distancePx - stop.radiusPx)
    if (diff < bestDiff) {
      best = stop
      bestDiff = diff
    }
  }
  return best
}
