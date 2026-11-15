import { createNavGrid, cellCenter, type NavGrid } from '../player/controller'
import { BUILDINGS, HQ, RING_RADIUS } from './layout'
import { ROOM_IDS } from '../rooms/ids'

/** Margin around footprints so the astronaut does not clip walls */
const MARGIN = 0.35
export const CAMPUS_EXTENT = RING_RADIUS + 12

/** Is the point inside a footprint rotated by `yaw` (grown by margin)? */
function inFootprint(x: number, z: number, pos: [number, number], size: [number, number], yaw: number): boolean {
  const dx = x - pos[0]
  const dz = z - pos[1]
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  // world → local (inverse rotation about Y)
  const lx = c * dx - s * dz
  const lz = s * dx + c * dz
  return Math.abs(lx) <= size[0] / 2 + MARGIN && Math.abs(lz) <= size[1] / 2 + MARGIN
}

/** The walkable campus: everything inside the world circle except building footprints */
export function campusNavGrid(cell = 0.5): NavGrid {
  const g = createNavGrid(-CAMPUS_EXTENT, -CAMPUS_EXTENT, CAMPUS_EXTENT, CAMPUS_EXTENT, cell)
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) {
      const p = cellCenter(g, c, r)
      let blocked = Math.hypot(p.x, p.z) > CAMPUS_EXTENT - 1
      if (!blocked) blocked = inFootprint(p.x, p.z, HQ.pos, HQ.size, HQ.yaw)
      for (const id of ROOM_IDS) {
        if (blocked) break
        const b = BUILDINGS[id]
        blocked = inFootprint(p.x, p.z, b.pos, b.size, b.yaw)
      }
      if (blocked) g.walkable[r * g.cols + c] = false
    }
  return g
}
