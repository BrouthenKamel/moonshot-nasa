import type { RideView } from './rideView'
import {
  CAPTURE,
  DROP,
  GROUND_Y,
  MOON,
  SIGN_RECT,
  SKY_W,
  craftLeg,
  overshoot,
  rideLeg,
  slice,
  pointAlong,
  turnDots,
} from './skyPath'
import { AMBER, DIM, INK, ORANGE, PATH, RED, SELECTED_FILL, circle, polyline, roundRect, seeded, text } from './canvasKit'

/**
 * The night sky over the launch pad: stars, the Moon, the transfer signs and the
 * path from the rocket's nose to the capture burn. Paints in SKY_W × SKY_H units;
 * the caller scales the context to the canvas. The travelling craft dot and the
 * pulsing capture marker are separate sprites, so this canvas only repaints when
 * the view or the hover changes.
 */

type Ctx = CanvasRenderingContext2D

export const SKY_CANVAS_SCALE = 1.5
export type Hover = { kind: 'ride' | 'transfer'; id: string } | null

/** Share of the craft leg drawn in the orbit's colour before the capture */
const CAPTURE_SHARE = 0.14
/** Where a blocked path stops */
const BLOCK_AT = 0.55

const STARS = (() => {
  const rnd = seeded(7)
  return Array.from({ length: 260 }, () => ({ x: rnd() * SKY_W, y: rnd() * (GROUND_Y - 40), s: 0.6 + rnd() * 1.6, a: 0.3 + rnd() * 0.5 }))
})()

function background(ctx: Ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y)
  g.addColorStop(0, '#03050a')
  g.addColorStop(0.7, '#071022')
  g.addColorStop(1, '#16233f')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, SKY_W, GROUND_Y + 2)
  for (const s of STARS) {
    ctx.fillStyle = `rgba(226,232,240,${s.a.toFixed(2)})`
    ctx.fillRect(s.x, s.y, s.s, s.s)
  }
}

function moon(ctx: Ctx, orbitColour: string) {
  const glow = ctx.createRadialGradient(MOON.x, MOON.y, MOON.r * 0.3, MOON.x, MOON.y, MOON.r * 2.4)
  glow.addColorStop(0, 'rgba(226,232,240,.22)')
  glow.addColorStop(1, 'rgba(226,232,240,0)')
  ctx.fillStyle = glow
  circle(ctx, MOON.x, MOON.y, MOON.r * 2.4)
  ctx.fill()
  ctx.fillStyle = '#e5e7eb'
  circle(ctx, MOON.x, MOON.y, MOON.r)
  ctx.fill()
  ctx.fillStyle = 'rgba(100,116,139,.35)'
  for (const [dx, dy, r] of [
    [-18, -14, 13],
    [20, 8, 9],
    [-6, 24, 7],
    [24, -26, 6],
  ]) {
    circle(ctx, MOON.x + dx, MOON.y + dy, r)
    ctx.fill()
  }
  text(ctx, 'THE MOON', MOON.x, MOON.y - MOON.r - 22, 20, DIM, 'center', 600, true)
  // The science orbit, decided in the Orbit step: only a thin ring here
  ctx.save()
  ctx.globalAlpha = 0.8
  ctx.strokeStyle = orbitColour
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.ellipse(MOON.x, MOON.y, MOON.r + 34, MOON.r * 0.42, -0.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function signs(ctx: Ctx, view: RideView, hover: Hover) {
  for (const s of view.signs) {
    const r = SIGN_RECT[s.type]
    const hovered = s.selectable && hover?.kind === 'transfer' && hover.id === s.id
    ctx.save()
    ctx.globalAlpha = s.selectable ? 1 : 0.45
    roundRect(ctx, r.x, r.y, r.w, r.h, 10)
    ctx.fillStyle = s.selected ? SELECTED_FILL : 'rgba(15,23,42,.85)'
    ctx.fill()
    ctx.strokeStyle = s.selected ? ORANGE : hovered ? '#cbd5e1' : '#334155'
    ctx.lineWidth = s.selected || hovered ? 3 : 1.5
    ctx.stroke()
    text(ctx, `${s.selected ? '●' : '○'} ${s.title}`, r.x + 16, r.y + 27, 20, s.selected ? '#fff' : INK, 'left', 700)
    text(ctx, s.sub, r.x + 16, r.y + 52, 18, s.selected ? '#fed7aa' : DIM, 'left', 500)
    ctx.restore()
  }
}

function cross(ctx: Ctx, x: number, y: number) {
  ctx.strokeStyle = RED
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(x - 14, y - 14)
  ctx.lineTo(x + 14, y + 14)
  ctx.moveTo(x + 14, y - 14)
  ctx.lineTo(x - 14, y + 14)
  ctx.stroke()
}

function dots(ctx: Ctx, pts: { x: number; y: number }[]) {
  for (const p of pts) {
    ctx.fillStyle = '#03050a'
    circle(ctx, p.x, p.y, 7)
    ctx.fill()
    ctx.strokeStyle = PATH
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

function path(ctx: Ctx, view: RideView) {
  const { drop, transferType } = view.path
  const colour = view.orbit.colour
  // The transfer not chosen, as a faint ghost
  const other = transferType === 'direct' ? 'low_energy' : 'direct'
  polyline(ctx, craftLeg(drop, other), 'rgba(148,163,184,.22)', 3, [4, 10])

  // The rocket's part
  polyline(ctx, rideLeg(drop), 'rgba(248,250,252,.75)', 4, [14, 10])

  const leg = craftLeg(drop, transferType)
  const reach = view.reach
  if (reach === 'noWay' || reach === 'noPower') {
    polyline(ctx, slice(leg, 0, BLOCK_AT), RED, 4, [10, 10])
    const p = pointAlong(leg, BLOCK_AT)
    cross(ctx, p.x, p.y)
    // Near the right edge the label goes on the cross's left, so it stays on screen
    const right = p.x > SKY_W * 0.6
    text(ctx, view.path.blockedLabel ?? '', right ? p.x - 26 : p.x + 26, p.y + (right ? -22 : 8), 22, RED, right ? 'right' : 'left', 700, true)
  } else {
    const cut = 1 - CAPTURE_SHARE
    ctx.save()
    ctx.shadowColor = PATH
    ctx.shadowBlur = 14
    polyline(ctx, slice(leg, 0, cut), PATH, 4.5)
    ctx.restore()
    dots(ctx, turnDots(leg, view.path.dots))
    if (reach === 'ok') {
      ctx.save()
      ctx.shadowColor = colour
      ctx.shadowBlur = 14
      polyline(ctx, slice(leg, cut, 1), colour, 5)
      ctx.restore()
      ctx.fillStyle = colour
      circle(ctx, CAPTURE.x, CAPTURE.y, 6)
      ctx.fill()
      text(ctx, 'CAPTURE BURN', CAPTURE.x - 30, CAPTURE.y - 16, 22, colour, 'right', 700, true)
      text(ctx, view.path.captureLabel, CAPTURE.x - 30, CAPTURE.y + 10, 20, INK, 'right', 600, true)
      text(ctx, 'orbit decided in the Orbit step', CAPTURE.x - 30, CAPTURE.y + 34, 18, DIM, 'right', 500, true)
    } else {
      // flyPast: reaches the Moon but cannot brake, so it sails on
      const tail = slice(leg, cut, 1)
      polyline(ctx, tail.concat(overshoot(leg, 160)), RED, 4, [10, 10])
      const p = pointAlong(leg, cut)
      text(ctx, view.path.blockedLabel ?? '', p.x - 20, p.y - 6, 20, RED, 'right', 700, true)
    }
  }

  // Drop-off
  const d = DROP[drop]
  ctx.fillStyle = '#f8fafc'
  circle(ctx, d.x, d.y, 8)
  ctx.fill()
  if (drop === 'gto') {
    // Right-aligned under the spiral, clear of the gantry and the departures board
    text(ctx, view.path.dropLabel, d.x + 140, d.y + 92, 20, '#f8fafc', 'right', 700, true)
    if (reach !== 'noWay' && reach !== 'noPower') text(ctx, view.path.spiralLabel, d.x + 140, d.y + 118, 20, AMBER, 'right', 700, true)
  } else if (drop === 'lunar-vicinity') {
    text(ctx, view.path.dropLabel, d.x - 16, d.y + 38, 20, '#f8fafc', 'right', 700, true)
  } else {
    text(ctx, view.path.dropLabel, d.x - 16, d.y + 38, 20, '#f8fafc', 'left', 700, true)
  }
}

export function paintSky(ctx: Ctx, view: RideView, hover: Hover): void {
  ctx.clearRect(0, 0, SKY_W, GROUND_Y + 2)
  background(ctx)
  moon(ctx, view.orbit.colour)
  path(ctx, view)
  signs(ctx, view, hover)
}
