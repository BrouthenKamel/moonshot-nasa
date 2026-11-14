import { SIGN_RECT, SKY_H, SKY_W, type Rect } from '../../../viz/ride/skyPath'
import { BOARD_H, BOARD_W } from '../../../viz/ride/boardPainter'

/**
 * Where the launch pad's departures board and transfer signs land on screen, so the ride and
 * transfer cards can sit exactly over them (the cards replace them as the way to choose).
 *
 * The launch pad (src/scene/launch/LaunchPad.tsx) frames a 1600 x 900 "sky" space: narrower than
 * 16:9 it fits the width, wider it fits the height, centred. Same rects as LaunchPad's BOARD_RECT
 * and SIGN_RECT; the camera's sway moves the board up to ~22 sky units, so the panels overhang it.
 */

export const BOARD_SKY: Rect = { x: 880, y: 450, w: 700, h: (700 * BOARD_H) / BOARD_W }
const SWAY = 26

export interface ScreenRect {
  left: number
  top: number
  width: number
  height: number
}

export function skyToScreen(r: Rect, w: number, h: number): ScreenRect {
  const s = w / h < SKY_W / SKY_H ? w / SKY_W : h / SKY_H
  return {
    left: w / 2 + (r.x - SKY_W / 2) * s,
    top: h / 2 + (r.y - SKY_H / 2) * s,
    width: r.w * s,
    height: r.h * s,
  }
}

/**
 * The dock for the ride cards: over the board, overhanging it, kept inside the screen. Anchored by
 * its bottom edge just above the timeline's flags (RideTimeline), so it grows upward over the board.
 */
export function rideDock(w: number, h: number, minWidth = 520): { left: number; width: number; bottom: number } {
  const b = skyToScreen({ x: BOARD_SKY.x - SWAY, y: BOARD_SKY.y - SWAY, w: BOARD_SKY.w + 2 * SWAY, h: BOARD_SKY.h + 2 * SWAY }, w, h)
  const right = Math.min(w - 8, b.left + b.width)
  const width = Math.max(minWidth, right - b.left)
  return { left: Math.max(8, right - width), width, bottom: TIMELINE_CLEARANCE }
}

/** Height kept free at the bottom for the timeline strip and its flags */
export const TIMELINE_CLEARANCE = 90

/**
 * The dock for the transfer cards: over the two signs in the sky, grown to the left into open sky.
 * Anchored by its bottom edge (just under the lower sign), so the cards grow upward, clear of the
 * path to the Moon and the capture-burn label below them.
 */
export function transferDock(w: number, h: number, minWidth = 420): { left: number; width: number; bottom: number } {
  const lo = SIGN_RECT.low_energy
  const d = SIGN_RECT.direct
  const r = skyToScreen({ x: lo.x - 168, y: lo.y, w: lo.w + 204, h: d.y + d.h + 32 - lo.y }, w, h)
  const width = Math.max(minWidth, r.width)
  return { left: r.left + r.width - width, width, bottom: h - (r.top + r.height) }
}
