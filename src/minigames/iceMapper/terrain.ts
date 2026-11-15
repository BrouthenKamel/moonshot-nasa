import { SeededRNG } from '../../sim/rng'

/**
 * A strip of Moon for the Ice Mapper, drawn as a shaded-relief map: a height field of scattered
 * craters and rolling ground, lit by a very low Sun from the left (the Sun never climbs far above the
 * horizon at the pole), with long cast shadows. The named craters are deep bowls, and the permanently
 * shadowed ones have floors the Sun never reaches, so they are nearly black. Pure and seeded: the same
 * seed gives the same Moon, and nothing here needs a graphics card.
 */

export interface TerrainArea {
  /** Centre and radius in image pixels */
  x: number
  y: number
  r: number
  /** Permanently shadowed: a nearly black floor */
  dark: boolean
}

export interface TerrainSpec {
  w: number
  h: number
  seed: number
  areas: TerrainArea[]
}

/** How high the Sun stands above the horizon, in degrees: near the pole it barely clears the ground */
const SUN_ELEVATION = 9
const SLOPE_PER_PX = Math.tan((SUN_ELEVATION * Math.PI) / 180)

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Soft random ground: bilinear noise on a grid of `cell` pixels */
function addNoise(height: Float32Array, w: number, h: number, cell: number, amp: number, rng: SeededRNG) {
  const gw = Math.ceil(w / cell) + 2
  const gh = Math.ceil(h / cell) + 2
  const grid = new Float32Array(gw * gh)
  for (let i = 0; i < grid.length; i++) grid[i] = rng.next() * 2 - 1
  for (let y = 0; y < h; y++) {
    const fy = y / cell
    const gy = Math.floor(fy)
    const ty = smooth(fy - gy)
    for (let x = 0; x < w; x++) {
      const fx = x / cell
      const gx = Math.floor(fx)
      const tx = smooth(fx - gx)
      const i = gy * gw + gx
      const top = grid[i] + (grid[i + 1] - grid[i]) * tx
      const bottom = grid[i + gw] + (grid[i + gw + 1] - grid[i + gw]) * tx
      height[y * w + x] += (top + (bottom - top) * ty) * amp
    }
  }
}

/** Press a crater into the height field: a bowl, a raised rim, and a skirt of thrown-out rock */
function stamp(height: Float32Array, w: number, h: number, cx: number, cy: number, r: number, depth: number, rim: number, mask?: Float32Array) {
  const reachR = r * 2.4
  const x0 = Math.max(0, Math.floor(cx - reachR))
  const x1 = Math.min(w - 1, Math.ceil(cx + reachR))
  const y0 = Math.max(0, Math.floor(cy - reachR))
  const y1 = Math.min(h - 1, Math.ceil(cy + reachR))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d > reachR) continue
      const i = y * w + x
      if (d < r) {
        const t = d / r
        // a rounded bowl with a fairly flat floor
        height[i] += -depth * (1 - t * t) * (1 - 0.35 * t * t)
        if (mask) mask[i] = Math.max(mask[i], smooth(Math.min(1, (1 - t) * 4)))
      }
      const e = (d - r) / (0.16 * r)
      height[i] += rim * Math.exp(-e * e)
      // the skirt of thrown-out rock fades smoothly to nothing (cutting it off showed as a thin ring)
      if (d >= r) height[i] += rim * 0.45 * Math.exp(-(d - r) / (0.7 * r)) * (1 - smooth(Math.min(1, Math.max(0, (d - 1.5 * r) / (0.9 * r)))))
    }
  }
}

/** The shaded-relief image, as RGBA bytes, w x h */
export function generateTerrain(spec: TerrainSpec): Uint8ClampedArray {
  const { w, h } = spec
  const rng = new SeededRNG(spec.seed)
  const height = new Float32Array(w * h)
  const shadowFloor = new Float32Array(w * h)

  // rolling ground at three scales
  addNoise(height, w, h, 260, 4.5, rng)
  addNoise(height, w, h, 90, 2.6, rng)
  addNoise(height, w, h, 32, 1.2, rng)

  // many small craters, a few big ones: sizes fall off steeply
  const count = Math.round((w * h) / 30000)
  for (let n = 0; n < count; n++) {
    const u = rng.next()
    const r = 3 + 20 * Math.pow(u, 3.2)
    stamp(height, w, h, rng.next() * w, rng.next() * h, r, r * 0.3, r * 0.1)
  }

  // the named craters: deep, with a broad rim; the dark ones also get a floor the Sun never reaches
  // (with the Sun this low, a deep bowl is shadowed all the way across, which is why ice survives in them;
  // the sunlit ones are shallow enough for their far side to catch the light)
  for (const a of spec.areas) {
    if (a.dark) stamp(height, w, h, a.x, a.y, a.r, a.r * 0.5, a.r * 0.14, shadowFloor)
    else stamp(height, w, h, a.x, a.y, a.r, a.r * 0.06, a.r * 0.08)
  }

  // brightness of the bare rock, a little different from place to place
  const albedo = new Float32Array(w * h)
  addNoise(albedo, w, h, 140, 0.08, rng)
  addNoise(albedo, w, h, 24, 0.035, rng)

  const out = new Uint8ClampedArray(w * h * 4)
  const lx = -Math.cos((SUN_ELEVATION * Math.PI) / 180)
  const lz = Math.sin((SUN_ELEVATION * Math.PI) / 180)
  for (let y = 0; y < h; y++) {
    let horizon = -Infinity
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      // the Sun is on the left: shadow falls to the right of anything tall
      horizon = Math.max(horizon - SLOPE_PER_PX, height[i])
      // a soft edge: how far below the shadow line this point lies
      const shade = Math.max(0, Math.min(1, (horizon - height[i] - 0.3) / 2.4))

      const xl = height[y * w + Math.max(0, x - 1)]
      const xr = height[y * w + Math.min(w - 1, x + 1)]
      const yu = height[Math.max(0, y - 1) * w + x]
      const yd = height[Math.min(h - 1, y + 1) * w + x]
      const gx = (xr - xl) / 2
      const gy = (yd - yu) / 2
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1)
      const lambert = Math.max(0, (-gx * lx + lz) * inv)

      let v = 0.2 + 1.7 * lambert
      v *= 1 - 0.78 * smooth(shade)
      v *= 0.62 + albedo[i]
      // a floor the Sun has never touched
      v *= 1 - 0.84 * shadowFloor[i]

      const o = i * 4
      const g = Math.max(0, Math.min(255, v * 190))
      out[o] = g * 1.02
      out[o + 1] = g
      out[o + 2] = g * 0.96
      out[o + 3] = 255
    }
  }
  return out
}
