/**
 * The ground under the Research Lab simulator: a cratered strip of the lunar
 * south pole, generated from a fixed seed, with the shadows a Sun 9 degrees
 * above the horizon casts on it. Pure: no three.js, no React.
 *
 * Coordinates: x runs across the flight direction (0 = ground track),
 * u runs along it, 0 to TILE_LENGTH, and repeats.
 */

export const TILE_LENGTH = 80
export const TILE_WIDTH = 170

export interface Crater {
  x: number
  u: number
  r: number // radius
  d: number // depth
}

/** The deep crater the track crosses. Its floor never sees the Sun. */
export const TRACK_CRATER: Crater = { x: 2, u: 50, r: 15, d: 3.4 }

const LARGE: Crater[] = [
  TRACK_CRATER,
  { x: -34, u: 58, r: 10, d: 2.2 },
  { x: 30, u: 22, r: 8, d: 1.7 },
  { x: -22, u: 16, r: 6, d: 1.2 },
  { x: 36, u: 64, r: 7, d: 1.5 },
  { x: -56, u: 30, r: 12, d: 2.5 },
  { x: 60, u: 42, r: 11, d: 2.3 },
  { x: -70, u: 66, r: 8, d: 1.6 },
  { x: 72, u: 14, r: 8, d: 1.7 },
]

/** Small deterministic random generator, so the ground is the same on every load. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SMALL_CRATER_COUNT = 70

export const CRATERS: readonly Crater[] = (() => {
  const rnd = mulberry32(7)
  const out = [...LARGE]
  let guard = 0
  while (out.length < LARGE.length + SMALL_CRATER_COUNT && guard++ < 5000) {
    const r = 0.9 + rnd() * rnd() * 3.2
    const c: Crater = { x: (rnd() - 0.5) * (TILE_WIDTH - 8), u: rnd() * TILE_LENGTH, r, d: r * 0.24 }
    if (Math.abs(c.x) < 3.5 + r) continue // keep the ground track readable
    if (LARGE.some((b) => Math.hypot(b.x - c.x, wrapDelta(b.u - c.u)) < b.r * 0.9 + c.r)) continue
    out.push(c)
  }
  return out
})()

const TAU = Math.PI * 2

/** Shortest along-track distance on the repeating tile. */
function wrapDelta(du: number): number {
  const m = ((du % TILE_LENGTH) + TILE_LENGTH) % TILE_LENGTH
  return m > TILE_LENGTH / 2 ? m - TILE_LENGTH : m
}

export function groundHeight(x: number, u: number): number {
  let h =
    0.07 * Math.sin(x * 0.35 + 1.3) * Math.cos((TAU * 3 * u) / TILE_LENGTH) +
    0.04 * Math.sin(x * 0.9) * Math.sin((TAU * 7 * u) / TILE_LENGTH + x * 0.2)
  for (const c of CRATERS) {
    const t = Math.hypot(x - c.x, wrapDelta(u - c.u)) / c.r
    if (t > 1.7) continue
    if (t < 1) h -= c.d * (1 - t * t)
    h += 0.26 * c.d * Math.exp(-(((t - 1) / 0.2) ** 2))
  }
  return h
}

const SUN_ELEVATION = (9 * Math.PI) / 180
const SUN_HORIZONTAL = { x: -0.342, u: 0.94 } // ahead and slightly left
const H_LEN = Math.hypot(SUN_HORIZONTAL.x, SUN_HORIZONTAL.u)

/** Unit vector towards the Sun. */
export const SUN_DIRECTION = {
  x: (SUN_HORIZONTAL.x / H_LEN) * Math.cos(SUN_ELEVATION),
  up: Math.sin(SUN_ELEVATION),
  u: (SUN_HORIZONTAL.u / H_LEN) * Math.cos(SUN_ELEVATION),
}

export interface BakedGround {
  nx: number
  nu: number
  height: Float32Array
  shadow: Float32Array
}

const NX = 341
const NU = 161
const DX = TILE_WIDTH / (NX - 1)
const DU = TILE_LENGTH / (NU - 1)

function sampleGrid(grid: Float32Array, x: number, u: number, outside: number): number {
  const fx = (x + TILE_WIDTH / 2) / DX
  if (fx < 0 || fx > NX - 1) return outside
  const fu = (((u % TILE_LENGTH) + TILE_LENGTH) % TILE_LENGTH) / DU
  const i0 = Math.min(NX - 2, Math.floor(fx))
  const j0 = Math.min(NU - 2, Math.floor(fu))
  const tx = fx - i0
  const tu = fu - j0
  const a = grid[j0 * NX + i0] * (1 - tx) + grid[j0 * NX + i0 + 1] * tx
  const b = grid[(j0 + 1) * NX + i0] * (1 - tx) + grid[(j0 + 1) * NX + i0 + 1] * tx
  return a * (1 - tu) + b * tu
}

let baked: BakedGround | null = null

/** Heights and Sun shadows on a grid, worked out once and reused. */
export function bakeGround(): BakedGround {
  if (baked) return baked
  const height = new Float32Array(NX * NU)
  for (let j = 0; j < NU; j++)
    for (let i = 0; i < NX; i++) height[j * NX + i] = groundHeight(-TILE_WIDTH / 2 + i * DX, j * DU)

  const rise = Math.tan(SUN_ELEVATION)
  const shadow = new Float32Array(NX * NU)
  for (let j = 0; j < NU; j++) {
    for (let i = 0; i < NX; i++) {
      const x = -TILE_WIDTH / 2 + i * DX
      const u = j * DU
      const h = height[j * NX + i]
      let occlusion = 0
      for (let k = 1; k <= 70 && occlusion < 1; k++) {
        const dist = k * 0.55
        const terrain = sampleGrid(height, x + (SUN_HORIZONTAL.x / H_LEN) * dist, u + (SUN_HORIZONTAL.u / H_LEN) * dist, -99)
        occlusion = Math.max(occlusion, (terrain - (h + rise * dist + 0.03)) / 0.22)
      }
      shadow[j * NX + i] = Math.min(1, Math.max(0, occlusion))
    }
  }
  baked = { nx: NX, nu: NU, height, shadow }
  return baked
}

/** 0 = sunlit, 1 = in shadow. u wraps around the tile; outside the strip is sunlit. */
export function shadowAt(x: number, u: number): number {
  return sampleGrid(bakeGround().shadow, x, u, 0)
}
