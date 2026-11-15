import { blockRect, createNavGrid, type NavGrid } from '../../world/player/controller'
import type { Role } from '../../viz/gonogo/stations'

/** Four consoles in a row facing the big screen; the player stands behind each to read it */
export const CONSOLE_X: Record<Role, number> = { ground: -4.5, science: -1.5, space: 1.5, launch: 4.5 }
export const CONSOLE_Z = -0.6
export const SPAWN = { x: 0, z: 3.6 }
/** How close to a stand point counts as "at the console" */
export const NEAR_RADIUS = 0.9

/** Where the astronaut stands to work a console */
export function standPoint(role: Role): { x: number; z: number } {
  return { x: CONSOLE_X[role], z: CONSOLE_Z + 1.25 }
}

/** The room floor, with the console desks blocked */
export function roomNavGrid(): NavGrid {
  const g = createNavGrid(-7, -4, 7, 5, 0.25)
  for (const x of Object.values(CONSOLE_X)) blockRect(g, x - 1.1, CONSOLE_Z - 0.5, x + 1.1, CONSOLE_Z + 0.45, 0.1)
  return g
}

/** The console whose stand point is within reach of (x, z), if any */
export function consoleAt(x: number, z: number): Role | null {
  for (const role of Object.keys(CONSOLE_X) as Role[]) {
    const s = standPoint(role)
    if (Math.hypot(x - s.x, z - s.z) < NEAR_RADIUS) return role
  }
  return null
}
