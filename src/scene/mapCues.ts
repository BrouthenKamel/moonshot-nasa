import type { BuildingLabel } from './BaseMap'

/**
 * The one line under a sign that says why the green glow is there. The brief's CAPCOM sends
 * the player to the Research Lab first ("Check whether your instrument can see into the dark
 * craters"); without words on the map the glow reads as decoration.
 */
export function signHint(label?: BuildingLabel): string | null {
  return label?.pulse && !label.alert ? 'First stop: can it see the ice?' : null
}

/**
 * Before a mission is chosen the only start is New mission: the buildings show no rings, so
 * nothing on the map competes with it. The names and statuses stay.
 */
export function quietLabels<K extends string>(labels: Record<K, BuildingLabel>): Record<K, BuildingLabel> {
  const out = {} as Record<K, BuildingLabel>
  for (const id of Object.keys(labels) as K[]) out[id] = { ...labels[id], highlight: false, pulse: false }
  return out
}

/** What a lit sign means, for its tooltip: the orange tag and the green glow explain themselves */
export function signMeaning(label?: BuildingLabel): string | null {
  if (!label || label.alert) return null
  if (label.highlight) return 'Next stop'
  return signHint(label)
}
