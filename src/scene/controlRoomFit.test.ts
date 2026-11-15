import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { baseFov, deskFrontPx, fitView, wallTopPx } from './controlRoomFit'

/** Where the wall's top edge and the desk's front edge land with a fit applied */
function framed(width: number, height: number, inset: number) {
  const { fov, shiftPx } = fitView(width, height, inset)
  const base = baseFov(width / height)
  const s = Math.tan(THREE.MathUtils.degToRad(base / 2)) / Math.tan(THREE.MathUtils.degToRad(fov / 2))
  const half = height / 2
  const at = (px: number) => half + (px - half) * s + shiftPx
  return { fov, shiftPx, wall: at(wallTopPx(base, width, height)), desk: at(deskFrontPx(base, width, height)) }
}

// Integration review, 15 Nov: at 800 × 600 the Plan overlay row covered the wall's headings.
// View sizes are the room's canvas: the window minus the header bar (100 px wide, 140 px when it wraps).
describe('Plan camera fit', () => {
  for (const [name, w, h, inset] of [
    ['800 × 600', 800, 460, 52],
    ['1280 × 720', 1280, 580, 70],
    ['1440 × 900', 1440, 800, 70],
  ] as const) {
    it(`${name}: the wall starts below the overlay row and the desk stays in frame`, () => {
      const f = framed(w, h, inset)
      expect(f.wall).toBeGreaterThanOrEqual(inset)
      expect(f.desk).toBeLessThanOrEqual(h)
    })
  }

  it('uses the floor under the desk first, so the room shrinks less than shrinking alone would', () => {
    for (const [w, h, inset] of [[800, 460, 52], [1280, 580, 70], [1440, 800, 70]] as const) {
      const f = fitView(w, h, inset)
      const base = baseFov(w / h)
      const half = h / 2
      // Shrinking alone: the wall's top must reach the row by scaling about the centre
      const sOnly = (half - (inset + 8)) / (half - wallTopPx(base, w, h))
      const fovOnly = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) / sOnly))
      expect(f.shiftPx).toBeGreaterThan(0)
      expect(f.fov).toBeLessThan(fovOnly)
    }
  })

  it('leaves the view alone when nothing covers the wall', () => {
    expect(fitView(1440, 800, 0)).toEqual({ fov: baseFov(1440 / 800), shiftPx: 0 })
  })
})
