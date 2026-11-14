import { describe, it, expect } from 'vitest'
import { SeededRNG, generateSeed } from './rng'

describe('SeededRNG', () => {
  it('produces deterministic sequence from same seed', () => {
    const rng1 = new SeededRNG(12345)
    const rng2 = new SeededRNG(12345)

    const seq1 = [rng1.next(), rng1.next(), rng1.next()]
    const seq2 = [rng2.next(), rng2.next(), rng2.next()]

    expect(seq1).toEqual(seq2)
  })

  it('produces different sequences from different seeds', () => {
    const rng1 = new SeededRNG(12345)
    const rng2 = new SeededRNG(54321)

    expect(rng1.next()).not.toEqual(rng2.next())
  })

  it('generates values in [0, 1)', () => {
    const rng = new SeededRNG(99999)
    for (let i = 0; i < 1000; i++) {
      const val = rng.next()
      expect(val).toBeGreaterThanOrEqual(0)
      expect(val).toBeLessThan(1)
    }
  })

  it('int() generates values in range', () => {
    const rng = new SeededRNG(42)
    for (let i = 0; i < 100; i++) {
      const val = rng.int(5, 10)
      expect(val).toBeGreaterThanOrEqual(5)
      expect(val).toBeLessThanOrEqual(10)
      expect(Number.isInteger(val)).toBe(true)
    }
  })

  it('chance() returns boolean based on probability', () => {
    const rng = new SeededRNG(123)

    // With p=0, should always return false
    let trueCount = 0
    for (let i = 0; i < 100; i++) {
      if (rng.chance(0)) trueCount++
    }
    expect(trueCount).toBe(0)

    // With p=1, should always return true
    trueCount = 0
    for (let i = 0; i < 100; i++) {
      if (rng.chance(1)) trueCount++
    }
    expect(trueCount).toBe(100)
  })

  it('pick() selects from array', () => {
    const rng = new SeededRNG(777)
    const arr = ['a', 'b', 'c', 'd']

    for (let i = 0; i < 50; i++) {
      const picked = rng.pick(arr)
      expect(arr).toContain(picked)
    }
  })

  it('shuffle() randomizes array', () => {
    const rng = new SeededRNG(888)
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const arr = [...original]

    rng.shuffle(arr)

    // Should contain same elements
    expect(arr.sort((a, b) => a - b)).toEqual(original)
  })

  it('clone() creates independent RNG with same state', () => {
    const rng1 = new SeededRNG(555)
    rng1.next()
    rng1.next()

    const rng2 = rng1.clone()

    // Should produce same next values
    expect(rng1.next()).toEqual(rng2.next())
    expect(rng1.next()).toEqual(rng2.next())
  })

  it('getState() returns current state', () => {
    const rng = new SeededRNG(12345)
    rng.next()

    const state = rng.getState()
    expect(typeof state).toBe('number')
    expect(state).toBeGreaterThan(0)
  })
})

describe('generateSeed', () => {
  it('returns a positive integer', () => {
    const seed = generateSeed()
    expect(seed).toBeGreaterThan(0)
    expect(Number.isInteger(seed)).toBe(true)
  })

  it('generates different seeds on successive calls', () => {
    const seeds = new Set<number>()
    for (let i = 0; i < 10; i++) {
      seeds.add(generateSeed())
    }
    // Should have at least some unique seeds
    expect(seeds.size).toBeGreaterThan(1)
  })
})
