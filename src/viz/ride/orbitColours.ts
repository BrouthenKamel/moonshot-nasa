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

export function orbitColour(orbitId: string): string {
  return COLOURS[orbitId] ?? '#dbeafe'
}

export function orbitShortName(orbitId: string): string {
  return SHORT_NAMES[orbitId] ?? 'ORBIT'
}
