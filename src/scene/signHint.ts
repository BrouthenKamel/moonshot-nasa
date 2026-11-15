import type { BuildingLabel } from './BaseMap'

/**
 * The one line under a sign that says why the green glow is there. The brief's CAPCOM sends
 * the player to the Research Lab first ("Check whether your instrument can see into the dark
 * craters"); without words on the map the glow reads as decoration.
 */
export function signHint(label?: BuildingLabel): string | null {
  return label?.pulse && !label.alert ? 'First stop: can it see the ice?' : null
}
