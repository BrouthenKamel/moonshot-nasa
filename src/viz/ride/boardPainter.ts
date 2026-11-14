import type { BoardRow, RideView } from './rideView'
import type { Rect } from './skyPath'
import type { Hover } from './skyPainter'
import { AMBER, DIM, GREEN, ORANGE, RED, SELECTED_FILL, fitText, fmtM, roundRect, text } from './canvasKit'

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
const YELLOW = '#fde68a'

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
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12)
  ctx.fillStyle = r.selected ? SELECTED_FILL : hovered ? '#16213a' : '#0b1220'
  ctx.fill()
  if (r.selected || hovered) {
    ctx.strokeStyle = r.selected ? ORANGE : '#cbd5e1'
    ctx.lineWidth = r.selected ? 5 : 4
    ctx.stroke()
  }
  const y1 = rect.y + 60
  const y2 = rect.y + 116
  fitText(ctx, r.name, COL.name, y1, 46, MIN, NAME_MAX, YELLOW, 'left', 800)
  text(ctx, r.dropWords, COL.name, y2, MIN, DIM, 'left', 500)
  text(ctx, String(r.turn), COL.leaves, y1, 46, r.status === 'tooEarly' ? RED : YELLOW, 'center', 800)
  text(ctx, fmtM(r.planCost), COL.cost, y1, 44, r.overBudget ? RED : YELLOW, 'center', 800)
  text(ctx, `fee ${fmtM(r.fee)}`, COL.cost, y2, MIN, DIM, 'center', 500)
  text(ctx, `${r.limitKg} kg`, COL.takes, y1, 44, r.status === 'tooHeavy' ? RED : YELLOW, 'center', 800)
  text(ctx, r.burn === null ? '—' : r.burn.toLocaleString('en-US'), COL.burn, y1, 44, r.burn === null ? RED : YELLOW, 'center', 800)
  text(ctx, r.arrivalTurn === null ? '—' : String(r.arrivalTurn), COL.arrives, y1, 44, YELLOW, 'center', 800)
  // Status chip under the right-hand columns
  const ok = r.status === 'onTime'
  text(ctx, r.statusLabel, BOARD_W - 40, y2, 42, ok ? GREEN : RED, 'right', 800)
}

export function paintBoard(ctx: Ctx, view: RideView, hover: Hover): void {
  ctx.clearRect(0, 0, BOARD_W, BOARD_H)
  roundRect(ctx, 4, 4, BOARD_W - 8, BOARD_H - 8, 20)
  ctx.fillStyle = '#05080f'
  ctx.fill()
  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 6
  ctx.stroke()

  text(ctx, 'DEPARTURES', COL.name, 82, 56, AMBER, 'left', 800)
  const head = (s: string, unit: string, x: number) => {
    text(ctx, s, x, 62, MIN, DIM, 'center', 700)
    if (unit) text(ctx, unit, x, 110, MIN, '#64748b', 'center', 500)
  }
  head('LEAVES', 'month', COL.leaves)
  head('COST', 'whole plan', COL.cost)
  head('TAKES', 'kg', COL.takes)
  head('BURN', 'm/s', COL.burn)
  head('ARRIVES', 'month', COL.arrives)

  view.rows.forEach((r, i) => row(ctx, r, rowRect(i), hover?.kind === 'ride' && hover.id === r.id))
}
