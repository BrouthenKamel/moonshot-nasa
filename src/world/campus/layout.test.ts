import { describe, expect, it } from 'vitest'
import { ROOM_IDS } from '../rooms/ids'
import { BUILDINGS, DOOR_ARRIVE_RADIUS, HQ, PLAZA_RADIUS } from './layout'

type Pt = [number, number]
type Box = { pos: Pt; size: [number, number]; yaw: number }
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Is point p inside the footprint of a rotated box? */
function inside(p: Pt, b: Box) {
  const dx = p[0] - b.pos[0]
  const dz = p[1] - b.pos[1]
  const c = Math.cos(b.yaw)
  const s = Math.sin(b.yaw)
  const lx = dx * c - dz * s
  const lz = dx * s + dz * c
  return Math.abs(lx) <= b.size[0] / 2 && Math.abs(lz) <= b.size[1] / 2
}

function corners(b: Box): Pt[] {
  return (
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as Pt[]
  ).map(([sx, sz]) => {
    const lx = (sx * b.size[0]) / 2
    const lz = (sz * b.size[1]) / 2
    return [
      b.pos[0] + lx * Math.cos(b.yaw) + lz * Math.sin(b.yaw),
      b.pos[1] - lx * Math.sin(b.yaw) + lz * Math.cos(b.yaw),
    ] as Pt
  })
}

describe('campus layout', () => {
  it('has a building for every room', () => {
    for (const id of ROOM_IDS) expect(BUILDINGS[id].id).toBe(id)
    expect(Object.keys(BUILDINGS)).toHaveLength(ROOM_IDS.length)
  })

  it('keeps doors apart so arrival zones never overlap', () => {
    for (let i = 0; i < ROOM_IDS.length; i++)
      for (let j = i + 1; j < ROOM_IDS.length; j++) {
        const d = dist(BUILDINGS[ROOM_IDS[i]].door, BUILDINGS[ROOM_IDS[j]].door)
        expect(d).toBeGreaterThan(DOOR_ARRIVE_RADIUS * 2.5)
      }
  })

  it('keeps doors outside every footprint and off the plaza middle', () => {
    for (const id of ROOM_IDS) {
      const { door } = BUILDINGS[id]
      for (const other of ROOM_IDS) expect(inside(door, BUILDINGS[other])).toBe(false)
      expect(inside(door, HQ)).toBe(false)
      expect(dist(door, [0, 0])).toBeGreaterThan(PLAZA_RADIUS)
    }
  })

  it('does not overlap buildings', () => {
    const all: Box[] = [...ROOM_IDS.map((id) => BUILDINGS[id]), HQ]
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        for (const c of corners(all[i])) expect(inside(c, all[j])).toBe(false)
        for (const c of corners(all[j])) expect(inside(c, all[i])).toBe(false)
      }
  })
})
