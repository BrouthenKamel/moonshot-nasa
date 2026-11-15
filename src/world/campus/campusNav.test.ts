import { describe, expect, it } from 'vitest'
import { campusNavGrid } from './campusNav'
import { BUILDINGS, SPAWN } from './layout'
import { findPath, isWalkableAt } from '../player/controller'
import { ROOM_IDS } from '../rooms/ids'

describe('campus nav grid', () => {
  const g = campusNavGrid()
  const spawn = { x: SPAWN[0], z: SPAWN[1] }

  it('spawn is walkable and building centres are not', () => {
    expect(isWalkableAt(g, spawn)).toBe(true)
    for (const id of ROOM_IDS) expect(isWalkableAt(g, { x: BUILDINGS[id].pos[0], z: BUILDINGS[id].pos[1] })).toBe(false)
  })

  it('every door is reachable from spawn', () => {
    for (const id of ROOM_IDS) {
      const [x, z] = BUILDINGS[id].door
      expect(isWalkableAt(g, { x, z }), id).toBe(true)
      expect(findPath(g, spawn, { x, z }).length, id).toBeGreaterThan(0)
    }
  })
})
