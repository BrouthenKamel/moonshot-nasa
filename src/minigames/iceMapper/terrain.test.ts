import { describe, expect, it } from 'vitest'
import { generateTerrain, type TerrainSpec } from './terrain'

const W = 220
const H = 360
const spec: TerrainSpec = {
  w: W,
  h: H,
  seed: 7,
  areas: [
    { x: 60, y: 90, r: 40, dark: true },
    { x: 160, y: 270, r: 40, dark: false },
  ],
}

/** Mean brightness (green channel) of a disc */
function meanAt(img: Uint8ClampedArray, cx: number, cy: number, r: number): number {
  let sum = 0
  let n = 0
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if (Math.hypot(x - cx, y - cy) <= r) {
        sum += img[(y * W + x) * 4 + 1]
        n++
      }
  return sum / n
}

describe('generateTerrain', () => {
  const img = generateTerrain(spec)

  it('makes a full opaque image', () => {
    expect(img).toHaveLength(W * H * 4)
    for (let i = 3; i < img.length; i += 4) expect(img[i]).toBe(255)
  })

  it('is the same Moon for the same seed, and a different one for another', () => {
    expect(Array.from(generateTerrain(spec).slice(0, 4000))).toEqual(Array.from(img.slice(0, 4000)))
    expect(Array.from(generateTerrain({ ...spec, seed: 8 }).slice(0, 4000))).not.toEqual(Array.from(img.slice(0, 4000)))
  })

  it('leaves the floor of a permanently shadowed crater nearly black, and a lit one visibly brighter', () => {
    const dark = meanAt(img, 60, 90, 18)
    const lit = meanAt(img, 160 + 16, 270, 12) // the far side of a shallow crater, away from its own shadow
    expect(dark).toBeLessThan(40)
    expect(lit).toBeGreaterThan(dark + 25)
  })

  it('has real contrast: bright rims and deep shadow, not a flat grey', () => {
    let min = 255
    let max = 0
    for (let i = 1; i < img.length; i += 4) {
      min = Math.min(min, img[i])
      max = Math.max(max, img[i])
    }
    expect(max - min).toBeGreaterThan(150)
  })
})
