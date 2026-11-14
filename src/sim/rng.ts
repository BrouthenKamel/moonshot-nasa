/**
 * Seeded PRNG for reproducible simulation runs.
 * Uses a simple but effective mulberry32 algorithm.
 */

export class SeededRNG {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0 // ensure unsigned 32-bit
    if (this.state === 0) this.state = 1 // avoid zero state
  }

  /**
   * Generate next random number in [0, 1)
   */
  next(): number {
    // mulberry32
    let t = (this.state += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /**
   * Generate random integer in [min, max] inclusive
   */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  /**
   * Return true with probability p
   */
  chance(p: number): boolean {
    return this.next() < p
  }

  /**
   * Pick random element from array
   */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)]
  }

  /**
   * Shuffle array in place (Fisher-Yates)
   */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i)
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  /**
   * Get current seed state (for saving/restoring)
   */
  getState(): number {
    return this.state
  }

  /**
   * Create a new RNG with same state (for branching)
   */
  clone(): SeededRNG {
    const rng = new SeededRNG(0)
    rng.state = this.state
    return rng
  }
}

/**
 * Generate a random seed based on current time
 */
export function generateSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
}
