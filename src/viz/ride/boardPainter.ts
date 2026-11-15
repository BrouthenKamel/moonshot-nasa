import type { BoardRow, RideView } from './rideView'
import type { Rect } from './skyPath'
import type { Hover } from './skyPainter'
import { AMBER, DIM, FAINT, GREEN, INK, INK_0, INK_1, INK_3, ORANGE, RED, RULE, RULE_STRONG, SELECTED_FILL, fitText, flapText, fmtM, roundRect, text } from './canvasKit'

/**
 * The departures board: one row per ride, each showing what that ride would do
 * to this design (plan cost, mass limit, the burn left to the craft, arrival).
 * On screen the board is about 475 CSS px wide in a 1280 × 720 window (the step
 * rail takes the left of the screen), so 41 canvas px is about 12 CSS px:
 * nothing is drawn smaller.
 */

type Ctx = CanvasRenderingContext2D

export const BOARD_W = 1600
export const BOARD_H = 640

const MIN = 41
const HEAD_H = 132
const PAD = 22
const ROW_H = (BOARD_H - HEAD_H - PAD) / 3
/** Split-flap characters: warm paper on ink cells */
const FLAP = INK

/** Columns (x of the left edge, or the centre for centred columns) */
const COL = {
  name: 40,
  leaves: 710,
  cost: 905,
  takes: 1085,
  burn: 1262,
  arrives: 1470,
}
const NAME_MAX = 590

export function rowRect(index: number): Rect {
  return { x: 14, y: HEAD_H + index * ROW_H, w: BOARD_W - 28, h: ROW_H - 10 }
}

function row(ctx: Ctx, r: BoardRow, rect: Rect, hovered: boolean) {
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 3)
  ctx.fillStyle = r.selected ? SELECTED_FILL : hovered ? INK_3 : INK_1
  ctx.fill()
  ctx.strokeStyle = r.selected ? ORANGE : hovered ? RULE_STRONG : RULE
  ctx.lineWidth = r.selected ? 5 : hovered ? 4 : 2
  ctx.stroke()
  if (r.selected) {
    // Kapton tab on the left edge of the chosen ride
    ctx.fillStyle = ORANGE
    ctx.fillRect(rect.x, rect.y, 10, rect.h)
  }
  const y1 = rect.y + 60
  const y2 = rect.y + 116
  fitText(ctx, r.name.toUpperCase(), COL.name, y1, 46, MIN, NAME_MAX, r.selected ? AMBER : FLAP, 'left', 800)
  text(ctx, r.dropWords, COL.name, y2, MIN, DIM, 'left', 500)
  flapText(ctx, String(r.turn), COL.leaves, y1, 46, r.status === 'tooEarly' ? RED : FLAP, 'center', 600)
  flapText(ctx, fmtM(r.planCost), COL.cost, y1, 42, r.overBudget ? RED : FLAP, 'center', 600)
  text(ctx, `fee ${fmtM(r.fee)}`, COL.cost, y2, MIN, FAINT, 'center', 500)
  flapText(ctx, `${r.limitKg}`, COL.takes, y1, 42, r.status === 'tooHeavy' ? RED : FLAP, 'center', 600)
  flapText(ctx, r.burn === null ? '—' : r.burn.toLocaleString('en-US'), COL.burn, y1, 42, r.burn === null ? RED : FLAP, 'center', 600)
  flapText(ctx, r.arrivalTurn === null ? '—' : String(r.arrivalTurn), COL.arrives, y1, 42, FLAP, 'center', 600)
  // Status flaps under the right-hand columns
  const ok = r.status === 'onTime'
  flapText(ctx, r.statusLabel, BOARD_W - 40, y2, 42, ok ? GREEN : RED, 'right', 600)
}

export function paintBoard(ctx: Ctx, view: RideView, hover: Hover): void {
  ctx.clearRect(0, 0, BOARD_W, BOARD_H)
  roundRect(ctx, 4, 4, BOARD_W - 8, BOARD_H - 8, 4)
  ctx.fillStyle = INK_0
  ctx.fill()
  ctx.strokeStyle = RULE_STRONG
  ctx.lineWidth = 6
  ctx.stroke()

  text(ctx, 'DEPARTURES', COL.name, 82, 56, AMBER, 'left', 800)
  const head = (s: string, unit: string, x: number) => {
    text(ctx, s, x, 62, MIN, DIM, 'center', 700)
    if (unit) text(ctx, unit, x, 110, MIN, FAINT, 'center', 500)
  }
  head('LEAVES', 'month', COL.leaves)
  head('COST', 'whole plan', COL.cost)
  head('TAKES', 'kg', COL.takes)
  head('BURN', 'm/s', COL.burn)
  head('ARRIVES', 'month', COL.arrives)
  // Hairline under the header
  ctx.fillStyle = RULE
  ctx.fillRect(PAD, HEAD_H - 8, BOARD_W - PAD * 2, 2)

  view.rows.forEach((r, i) => row(ctx, r, rowRect(i), hover?.kind === 'ride' && hover.id === r.id))
}
