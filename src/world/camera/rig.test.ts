import { describe, expect, it } from 'vitest'
import { activeShot, cutsBetween, isContiguous, sampleShots } from './rig'

const shots = [
  { id: 'a', from: -10, to: -3 },
  { id: 'b', from: -3, to: 2 },
  { id: 'c', from: 2, to: 8 },
]

describe('shot list', () => {
  it('gives each moment exactly one shot, none before the first or from the end', () => {
    expect(activeShot(shots, -11)).toBeNull()
    expect(activeShot(shots, -10)?.id).toBe('a')
    expect(activeShot(shots, -3.0001)?.id).toBe('a')
    expect(activeShot(shots, -3)?.id).toBe('b')
    expect(activeShot(shots, 7.99)?.id).toBe('c')
    expect(activeShot(shots, 8)).toBeNull()
  })

  it('reports every cut crossed in a frame once, even a long frame that crosses two', () => {
    expect(cutsBetween(shots, -3.1, -2.9).map((s) => s.id)).toEqual(['b'])
    expect(cutsBetween(shots, -2.9, -2.8)).toEqual([])
    expect(cutsBetween(shots, -4, 3).map((s) => s.id)).toEqual(['b', 'c'])
    // The first shot's cut fires when the clock starts just below it
    expect(cutsBetween(shots, -Infinity, -10).map((s) => s.id)).toEqual(['a'])
  })

  it('detects gaps and overlaps', () => {
    expect(isContiguous(shots)).toBe(true)
    expect(isContiguous([shots[0], { id: 'x', from: -2, to: 0 }])).toBe(false)
    expect(isContiguous([{ id: 'x', from: 1, to: 1 }])).toBe(false)
  })
})

describe('sampleShots', () => {
  const keys = [
    { at: 0, pos: [0, 0, 0] as [number, number, number], look: [0, 0, -1] as [number, number, number], fov: 40 },
    { at: 2, pos: [2, 0, 0] as [number, number, number], look: [0, 0, -1] as [number, number, number], fov: 60 },
    { at: 4, pos: [9, 9, 9] as [number, number, number], look: [0, 0, -1] as [number, number, number], fov: 20, cut: true },
  ]
  it('eases between keys and jumps on a cut', () => {
    expect(sampleShots(keys, 1)?.pos.x).toBeCloseTo(1)
    expect(sampleShots(keys, 1)?.fov).toBeCloseTo(50)
    expect(sampleShots(keys, 3.9)?.pos.x).toBe(2)
    expect(sampleShots(keys, 4)?.pos.x).toBe(9)
    expect(sampleShots(keys, 4.1)).toBeNull()
    expect(sampleShots([], 0)).toBeNull()
  })
})
