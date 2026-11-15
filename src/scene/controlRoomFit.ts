import * as THREE from 'three'

/**
 * Plan screen camera fit (Integration review, 15 Nov). The step's overlay row (Back, the title card,
 * "Select …") sits over the top of the 3D view. On a tall window the big screen starts below it; on a
 * short one (800 × 600: a 460 px view under a two-line header bar) the row covered the wall's header and
 * its panel headings. The fit moves the picture down (and, only if the floor under the desk runs out,
 * widens the field of view) so the wall's top edge sits below the row. See fitView.
 */

/** Seated camera and where it looks (shared with ControlRoom) */
export const SEAT_CAM = new THREE.Vector3(0, 3.2, 5.0)
export const SEAT_TARGET = new THREE.Vector3(0, 2.0, -8.5)
/** The big screen's top edge, frame included (BigScreen: centre y 5.25, height 6.75, frame +0.25, z −8.7) */
export const WALL_TOP = new THREE.Vector3(0, 5.25 + 6.75 / 2 + 0.25, -8.7)
/** Room for the camera's small sway on top of the measured row */
const SWAY_PX = 8

/** The field of view by window shape: wider for narrower windows, so the screen's full width fits */
export function baseFov(aspect: number): number {
  return aspect < 1.25 ? 80 : aspect < 1.5 ? 72 : 60
}

/** Pixels from the top of the view to the wall's top edge, at this field of view */
export function wallTopPx(fov: number, width: number, height: number): number {
  return pxFromTop(WALL_TOP, fov, width, height)
}

/** The desk's near top edge, where its readouts end (console panel near edge ≈ (0, 1.73, 2.78)) */
export const DESK_FRONT = new THREE.Vector3(0, 1.7, 2.9)
/** Space kept under the desk's front edge */
const BOTTOM_PX = 12

/** Pixels from the top of the view to the desk's front edge, at this field of view */
export function deskFrontPx(fov: number, width: number, height: number): number {
  return pxFromTop(DESK_FRONT, fov, width, height)
}

function pxFromTop(point: THREE.Vector3, fov: number, width: number, height: number): number {
  const cam = new THREE.PerspectiveCamera(fov, width / Math.max(1, height), 0.1, 100)
  cam.position.copy(SEAT_CAM)
  cam.lookAt(SEAT_TARGET)
  cam.updateMatrixWorld()
  const p = point.clone().project(cam)
  return ((1 - p.y) / 2) * height
}

/**
 * How to frame a `width` × `height` view whose top `insetPx` pixels the overlay row covers: the field of
 * view and how far to shift the picture down (pixels). First the picture moves down into the empty floor
 * under the desk; only when that is not enough does it also shrink (a wider field of view), and then by as
 * little as possible. Unchanged when the wall already clears the row.
 *
 * Projected heights scale by s = tan(base / 2) / tan(fov / 2) around the view's centre, so with a shift d:
 *   wall top  → half − (half − wallTop)·s + d  ≥ need
 *   desk edge → half + (deskFront − half)·s + d ≤ height − BOTTOM_PX
 * The largest s that meets both is (height − BOTTOM_PX − need) / (deskFront − wallTop).
 */
export function fitView(width: number, height: number, insetPx: number): { fov: number; shiftPx: number } {
  const base = baseFov(width / Math.max(1, height))
  const need = insetPx + SWAY_PX
  const top = wallTopPx(base, width, height)
  if (height <= 0 || top >= need) return { fov: base, shiftPx: 0 }
  const desk = deskFrontPx(base, width, height)
  const half = height / 2
  const scale = Math.max(0.5, Math.min(1, (height - BOTTOM_PX - need) / Math.max(1, desk - top)))
  const shiftPx = Math.max(0, need - (half - (half - top) * scale))
  const fov = scale >= 1 ? base : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) / scale))
  return { fov, shiftPx }
}
