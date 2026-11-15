import type { BuildingLabel } from './BaseMap'

/**
 * The one line under the lit sign: what to do there next (from the mission's step order, see
 * src/viz/missionMap.ts), so the map says in words what the orange tag means. None when a red
 * problem takes over the sign.
 */
export function signHint(label?: BuildingLabel): string | null {
  return label?.highlight && label.hint && !label.alert ? label.hint : null
}

/**
 * Before a mission is chosen the only start is New mission: the buildings show no rings, so
 * nothing on the map competes with it. The names and statuses stay.
 */
export function quietLabels<K extends string>(labels: Record<K, BuildingLabel>): Record<K, BuildingLabel> {
  const out = {} as Record<K, BuildingLabel>
  for (const id of Object.keys(labels) as K[]) out[id] = { ...labels[id], highlight: false, pulse: false, hint: undefined }
  return out
}

/** What a lit sign means, for its tooltip */
export function signMeaning(label?: BuildingLabel): string | null {
  if (!label || label.alert) return null
  if (label.highlight) return signHint(label) ?? 'Next stop'
  if (label.pulse) return 'First lesson here'
  return null
}
