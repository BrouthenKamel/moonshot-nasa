import { describe, expect, it } from 'vitest'
import { findPath, isWalkableAt } from '../../world/player/controller'
import { CONSOLE_X, SPAWN, consoleAt, roomNavGrid, standPoint } from './layout'
import type { Role } from '../../viz/gonogo/stations'

describe('Mission Control layout', () => {
  const g = roomNavGrid()
  it('every console can be walked to from the door, and the desks block the way', () => {
    for (const role of Object.keys(CONSOLE_X) as Role[]) {
      const s = standPoint(role)
      expect(isWalkableAt(g, s)).toBe(true)
      expect(findPath(g, SPAWN, s).length).toBeGreaterThan(0)
      expect(isWalkableAt(g, { x: CONSOLE_X[role], z: -0.6 })).toBe(false)
      expect(consoleAt(s.x, s.z)).toBe(role)
    }
    expect(consoleAt(SPAWN.x, SPAWN.z)).toBeNull()
  })
})
