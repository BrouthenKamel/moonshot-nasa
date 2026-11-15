import { ORBIT_FAR_KM, polarOrbitKm } from '../../data/orbits'

/**
 * One colour per orbit, everywhere an orbit is drawn (shared design direction):
 * the ride scene's capture marker and the orbit scene use the same ones.
 */
const COLOURS: Record<string, string> = {
  'orbit-halo': '#a78bfa',
  'orbit-elliptical': '#a3e635',
  'orbit-100km': '#38bdf8',
}

const SHORT_NAMES: Record<string, string> = {
  'orbit-halo': 'HALO LOOP',
  'orbit-elliptical': 'ELLIPTICAL ORBIT',
  'orbit-100km': 'CIRCULAR 100 KM ORBIT',
}

/** A polar orbit from the Orbit step's slider: elliptical below the far point, a circle above it */
function polarShape(orbitId: string): { km: number; circular: boolean } | null {
  const km = polarOrbitKm(orbitId)
  return km === null ? null : { km, circular: km >= ORBIT_FAR_KM }
}

export function orbitColour(orbitId: string): string {
  const polar = polarShape(orbitId)
  if (polar) return polar.circular ? COLOURS['orbit-100km'] : COLOURS['orbit-elliptical']
  return COLOURS[orbitId] ?? '#dbeafe'
}

export function orbitShortName(orbitId: string): string {
  const polar = polarShape(orbitId)
  if (polar) return `${polar.circular ? 'CIRCULAR' : 'POLAR'} ORBIT, ${polar.km.toLocaleString('en-US')} KM`
  return SHORT_NAMES[orbitId] ?? 'ORBIT'
}
