import type { RideView } from './rideView'
import { DIM, GREEN, INK, INK_1, MONO, RED, RULE_STRONG, fmtMs, roundRect, text } from './canvasKit'

/**
 * The propellant tank: what the journey takes of the delta-v on board, in
 * stacked layers (climb out, capture, holding the orbit, spare), or by how much
 * the tank is short. On screen it is about 225 CSS px wide in a 1280 × 720
 * window, so 39 canvas px is about 12 CSS px.
 */

type Ctx = CanvasRenderingContext2D

export const TANK_W = 720
export const TANK_H = 900

const MIN = 39
const BODY = { x: 24, y: 240, w: 130, h: 630 }

/** Layer heights as shares of the tank, bottom to top; empty when the tank is grey */
export function tankTargets(view: RideView): number[] {
  if (view.tank.greyLabel) return []
  const max = Math.max(1, view.tank.scaleMax)
  return view.tank.layers.map((l) => Math.max(0, Math.min(1, l.value / max)))
}

function twoLines(s: string): [string, string] {
  const words = s.split(' ')
  const half = Math.ceil(words.length / 2)
  return [words.slice(0, half).join(' '), words.slice(half).join(' ')]
}

export function paintTank(ctx: Ctx, view: RideView, levels: number[]): void {
  const { tank } = view
  ctx.clearRect(0, 0, TANK_W, TANK_H)

  text(ctx, 'PROPELLANT', BODY.x, 58, 52, INK, 'left', 800)
  text(ctx, `${fmtMs(tank.available)} on board`, BODY.x, 118, MIN + 4, INK, 'left', 600, false, MONO)
  text(ctx, `${tank.propellantKg} kg · chosen at the Factory`, BODY.x, 172, MIN, DIM, 'left', 500)

  // Glass
  roundRect(ctx, BODY.x - 8, BODY.y - 8, BODY.w + 16, BODY.h + 16, 6)
  ctx.fillStyle = INK_1
  ctx.fill()
  ctx.strokeStyle = RULE_STRONG
  ctx.lineWidth = 5
  ctx.stroke()

  const legendX = BODY.x + BODY.w + 34
  if (tank.greyLabel) {
    ctx.fillStyle = 'rgba(148,141,127,.22)'
    ctx.fillRect(BODY.x, BODY.y, BODY.w, BODY.h)
    const [a, b] = twoLines(tank.greyLabel)
    text(ctx, a, legendX, BODY.y + BODY.h / 2 - 10, 44, RED, 'left', 800)
    text(ctx, b, legendX, BODY.y + BODY.h / 2 + 44, 44, RED, 'left', 800)
    return
  }

  // Layers, bottom to top
  let y = BODY.y + BODY.h
  tank.layers.forEach((layer, i) => {
    const h = (levels[i] ?? 0) * BODY.h
    if (h <= 0) return
    ctx.save()
    ctx.globalAlpha = layer.key === 'spare' ? 0.35 : 1
    ctx.fillStyle = layer.colour
    ctx.fillRect(BODY.x, y - h, BODY.w, Math.max(0, h - 3))
    ctx.restore()
    y -= h
  })

  // Not enough: where the tank really ends
  if (tank.shortBy > 0) {
    const level = BODY.y + BODY.h - (Math.min(tank.available, tank.scaleMax) / Math.max(1, tank.scaleMax)) * BODY.h
    ctx.fillStyle = 'rgba(208,83,63,.28)'
    ctx.fillRect(BODY.x, BODY.y, BODY.w, Math.max(0, level - BODY.y))
    ctx.strokeStyle = INK
    ctx.lineWidth = 4
    ctx.setLineDash([12, 10])
    ctx.beginPath()
    ctx.moveTo(BODY.x - 20, level)
    ctx.lineTo(BODY.x + BODY.w + 20, level)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Legend, top to bottom
  const entries: { colour: string; label: string; value: number }[] = []
  if (tank.shortBy > 0) entries.push({ colour: RED, label: 'SHORT BY', value: tank.shortBy })
  for (const l of [...tank.layers].reverse()) entries.push({ colour: l.key === 'spare' ? GREEN : l.colour, label: l.label, value: l.value })
  entries.forEach((e, i) => {
    const ly = BODY.y + 30 + i * 112
    ctx.fillStyle = e.colour
    ctx.fillRect(legendX, ly - 28, 28, 28)
    text(ctx, e.label, legendX + 44, ly, MIN, INK, 'left', 600)
    text(ctx, fmtMs(e.value), legendX + 44, ly + 50, 44, e.colour, 'left', 600, false, MONO)
  })
}
