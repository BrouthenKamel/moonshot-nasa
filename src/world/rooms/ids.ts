/** The eight campus rooms, in suggested play order */
export const ROOM_IDS = [
  'briefing',
  'science-lab',
  'clean-room',
  'thermal-vac',
  'flight-dynamics',
  'ground-station',
  'launch-hangar',
  'mission-control',
] as const

export type RoomId = (typeof ROOM_IDS)[number]

/** The four team roles (kept for co-op later; matches the Go/No-Go consoles) */
export type RoomRole = 'science' | 'space' | 'ground' | 'launch'
