import { describe, expect, it } from 'vitest'
import {
  astar,
  blockRect,
  createNavGrid,
  createWalker,
  findPath,
  isWalkableAt,
  lineOfSight,
  setDestination,
  step,
  type NavGrid,
  type WalkerState,
} from './controller'

const grid = (): NavGrid => createNavGrid(-5, -5, 5, 5, 0.5)

function run(s: WalkerState, g: NavGrid, frames: number, move?: { x: number; z: number }) {
  let arrivedAt = null as { x: number; z: number } | null
  for (let i = 0; i < frames; i++) {
    const r = step(s, { move }, 1 / 60, g)
    s = r.state
    if (r.arrived) arrivedAt = r.arrived
  }
  return { s, arrivedAt }
}

describe('nav grid', () => {
  it('blocks rectangles', () => {
    const g = grid()
    blockRect(g, -1, -1, 1, 1)
    expect(isWalkableAt(g, { x: 0, z: 0 })).toBe(false)
    expect(isWalkableAt(g, { x: 3, z: 3 })).toBe(true)
    expect(isWalkableAt(g, { x: 99, z: 0 })).toBe(false)
  })
})

describe('pathfinding', () => {
  it('goes straight on open ground, ending exactly at the target', () => {
    const g = grid()
    const p = findPath(g, { x: -4, z: -4 }, { x: 3.3, z: 2.2 })
    expect(p).toEqual([{ x: 3.3, z: 2.2 }])
  })

  it('routes around a wall', () => {
    const g = grid()
    blockRect(g, -0.4, -3, 0.4, 3)
    const p = findPath(g, { x: -3, z: 0 }, { x: 3, z: 0 })
    expect(p.length).toBeGreaterThan(1)
    let prev = { x: -3, z: 0 }
    for (const w of p) {
      expect(lineOfSight(g, prev, w)).toBe(true)
      prev = w
    }
    expect(prev).toEqual({ x: 3, z: 0 })
  })

  it('snaps a click on a blocked cell to the nearest walkable one', () => {
    const g = grid()
    blockRect(g, -1, -1, 1, 1)
    const p = findPath(g, { x: -4, z: 0 }, { x: 0, z: 0 })
    const end = p[p.length - 1]
    expect(isWalkableAt(g, end)).toBe(true)
    expect(Math.hypot(end.x, end.z)).toBeLessThan(2)
  })

  it('returns no path when the target is walled off', () => {
    const g = grid()
    // closed ring around the origin
    blockRect(g, -2, -2, 2, -1.5)
    blockRect(g, -2, 1.5, 2, 2)
    blockRect(g, -2, -2, -1.5, 2)
    blockRect(g, 1.5, -2, 2, 2)
    expect(astar(g, { c: 0, r: 0 }, { c: 19, r: 19 })).not.toBeNull()
    expect(findPath(g, { x: -4, z: -4 }, { x: 0, z: 0 })).toEqual([])
  })

  it('does not cut corners between diagonal blocks', () => {
    const g = createNavGrid(0, 0, 2, 2, 1)
    g.walkable[1] = false // (1,0)
    g.walkable[2] = false // (0,1)
    expect(astar(g, { c: 0, r: 0 }, { c: 1, r: 1 })).toBeNull()
  })

  it("walks within the start cell without A* detours", () => {
    const g = grid()
    expect(findPath(g, { x: 0.1, z: 0.1 }, { x: 0.2, z: 0.1 })).toEqual([{ x: 0.2, z: 0.1 }])
  })
})

describe('step', () => {
  it('walks a path, arrives, and stops', () => {
    const g = grid()
    blockRect(g, -0.4, -3, 0.4, 3)
    let s = setDestination(createWalker(-3, 0), g, { x: 3, z: 0 })
    const r = run(s, g, 60 * 12)
    s = r.s
    expect(r.arrivedAt).toEqual({ x: 3, z: 0 })
    expect(s.path).toHaveLength(0)
    expect(s.x).toBeCloseTo(3, 1)
    expect(s.z).toBeCloseTo(0, 1)
    expect(s.speed).toBe(0)
  })

  it('never exceeds max speed and never enters blocked cells', () => {
    const g = grid()
    blockRect(g, -0.4, -3, 0.4, 3)
    let s = setDestination(createWalker(-3, 0), g, { x: 3, z: 0 })
    for (let i = 0; i < 600; i++) {
      const prev = s
      s = step(s, {}, 1 / 60, g).state
      expect(Math.hypot(s.x - prev.x, s.z - prev.z)).toBeLessThanOrEqual(3.2 / 60 + 1e-9)
      expect(isWalkableAt(g, s)).toBe(true)
    }
  })

  it('limits turn rate', () => {
    const g = grid()
    const s = setDestination(createWalker(0, 0, 0), g, { x: 0, z: -4 }) // behind
    const next = step(s, {}, 1 / 60, g).state
    expect(Math.abs(next.heading)).toBeLessThanOrEqual(9 / 60 + 1e-9)
    expect(Math.abs(next.heading)).toBeGreaterThan(0)
  })

  it('WASD cancels the path and moves directly', () => {
    const g = grid()
    let s = setDestination(createWalker(-3, 0), g, { x: 3, z: 3 })
    expect(s.path.length).toBeGreaterThan(0)
    const r = run(s, g, 30, { x: 1, z: 0 })
    s = r.s
    expect(s.path).toHaveLength(0)
    expect(s.x).toBeGreaterThan(-3)
    expect(s.z).toBeCloseTo(0, 5)
    expect(r.arrivedAt).toBeNull()
  })

  it('WASD slides along walls and stops against them', () => {
    const g = grid()
    blockRect(g, 1, -5, 2, 5)
    const s = run(createWalker(0, 0), g, 120, { x: 1, z: 1 }).s
    expect(isWalkableAt(g, s)).toBe(true)
    expect(s.x).toBeLessThan(1)
    expect(s.z).toBeGreaterThan(1)
  })

  it('idles without input', () => {
    const s0 = createWalker(1, 1, 0.5)
    const r = step(s0, {}, 1 / 60)
    expect(r.state).toMatchObject({ x: 1, z: 1, heading: 0.5 })
    expect(r.arrived).toBeNull()
  })
})
