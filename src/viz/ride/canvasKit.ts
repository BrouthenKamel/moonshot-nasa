import type { Pt } from './skyPath'

/** Small drawing helpers shared by the launch pad's painters. */

type Ctx = CanvasRenderingContext2D

export const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

export const INK = '#e2e8f0'
export const DIM = '#94a3b8'
export const RED = '#f87171'
export const AMBER = '#fbbf24'
export const GREEN = '#4ade80'
export const PATH = '#dbeafe'
export const ORANGE = '#f97316'
export const SELECTED_FILL = 'rgba(124,45,18,.9)'

export function text(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  size: number,
  colour: string,
  align: CanvasTextAlign = 'left',
  weight = 600
) {
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.fillStyle = colour
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(s, x, y)
}

/** Text shrunk to fit a width, never below the smallest readable size */
export function fitText(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  size: number,
  minSize: number,
  maxWidth: number,
  colour: string,
  align: CanvasTextAlign = 'left',
  weight = 600
) {
  let f = size
  ctx.font = `${weight} ${f}px ${FONT}`
  const w = ctx.measureText(s).width
  if (w > maxWidth && w > 0) f = Math.max(minSize, Math.floor((size * maxWidth) / w))
  text(ctx, s, x, y, f, colour, align, weight)
}

/** Words wrapped to a width; returns the y below the last line */
export function wrapText(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  size: number,
  lineHeight: number,
  maxWidth: number,
  colour: string,
  weight = 500
): number {
  ctx.font = `${weight} ${size}px ${FONT}`
  let line = ''
  for (const word of s.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > maxWidth) {
      text(ctx, line, x, y, size, colour, 'left', weight)
      y += lineHeight
      line = word
    } else line = next
  }
  if (line) text(ctx, line, x, y, size, colour, 'left', weight)
  return y + lineHeight
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r)
  else ctx.rect(x, y, Math.max(0, w), Math.max(0, h))
}

export function polyline(ctx: Ctx, pts: Pt[], colour: string, width: number, dash: number[] = []) {
  if (pts.length < 2) return
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.strokeStyle = colour
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.setLineDash(dash)
  ctx.stroke()
  ctx.setLineDash([])
}

export function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2)
}

/** Fixed pseudo-random sequence, so the stars stay put between repaints */
export function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export const fmtMs = (v: number) => `${Math.round(v).toLocaleString('en-US')} m/s`
export const fmtM = (v: number) => `$${v.toFixed(1)}M`
