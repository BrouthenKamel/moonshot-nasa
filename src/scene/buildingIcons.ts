import type { BuildingId } from '../data/agency'

/** One icon per building, on its map label and in the building list */
export const buildingIcons: Record<BuildingId, string> = {
  'research-lab': '🔬',
  factory: '🏭',
  'launch-site': '🚀',
  'comms-center': '📡',
}
