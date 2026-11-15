import { ROOM_IDS, type RoomId } from '../rooms/ids'

/** Pure campus layout: ground-plane coordinates in metres, x east, z south (toward the camera). */

export interface BuildingSpec {
  id: RoomId
  /** Centre on the ground plane */
  pos: [number, number]
  /** Footprint width (local x) and depth (local z) */
  size: [number, number]
  /** Rotation about Y; the local +z face (the front) points at the plaza */
  yaw: number
  /** Where the door portal sits, just outside the front face */
  door: [number, number]
}

export const PLAZA_RADIUS = 5
export const RING_RADIUS = 14
const SLOT_ANGLES_DEG = [-140, -100, -60, -20, 20, 60, 100, 140]

const SIZES: Record<RoomId, [number, number]> = {
  briefing: [6, 4.5],
  'science-lab': [6, 4.5],
  'clean-room': [6.5, 5],
  'thermal-vac': [5, 5],
  'flight-dynamics': [6, 4.5],
  'ground-station': [6, 5],
  'launch-hangar': [6.5, 5],
  'mission-control': [6.5, 5],
}

/** Gap between the front face and the door ring centre */
const DOOR_OFFSET = 0.9

function make(id: RoomId, slot: number): BuildingSpec {
  const theta = (SLOT_ANGLES_DEG[slot] * Math.PI) / 180
  const pos: [number, number] = [RING_RADIUS * Math.sin(theta), RING_RADIUS * Math.cos(theta)]
  const yaw = theta + Math.PI
  const size = SIZES[id]
  const reach = size[1] / 2 + DOOR_OFFSET
  const door: [number, number] = [pos[0] + Math.sin(yaw) * reach, pos[1] + Math.cos(yaw) * reach]
  return { id, pos, size, yaw, door }
}

export const BUILDINGS: Record<RoomId, BuildingSpec> = Object.fromEntries(
  ROOM_IDS.map((id, i) => [id, make(id, i)]),
) as Record<RoomId, BuildingSpec>

/** The HQ carries the flip-board; it is scenery, not a room */
export const HQ = { pos: [0, -17] as [number, number], size: [8, 4] as [number, number], yaw: 0 }

/** Where the stub marker (and later the astronaut) starts */
export const SPAWN: [number, number] = [0, 2.5]

/** Radius around a door at which "arrived" fires */
export const DOOR_ARRIVE_RADIUS = 1.3

export function doorPoint(id: RoomId): [number, number] {
  return BUILDINGS[id].door
}
