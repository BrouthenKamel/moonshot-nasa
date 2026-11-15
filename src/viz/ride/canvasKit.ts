import type { Pt } from './skyPath'

/** Small drawing helpers shared by the launch pad's painters. */

type Ctx = CanvasRenderingContext2D

// FLIGHT PLAN: Archivo for words, IBM Plex Mono for data; warm paper on matte ink
export const FONT = '"Archivo", "Helvetica Neue", Arial, sans-serif'
export const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace'

export const INK = '#ede6d6' // paper
export const DIM = '#b9b2a3' // paper-dim
export const FAINT = '#948d7f' // paper-faint
export const RED = '#d0533f' // nogo
export const AMBER = '#e8a33d' // kapton
export const GREEN = '#6faf7a' // go
export const CAUTION = '#d9b23f'
export const PATH = '#ede6d6'
export const ORANGE = '#e8a33d' // kapton (selection)
export const SELECTED_FILL = 'rgba(42,30,12,.94)' // kapton-tinted ink
export const INK_0 = '#07090d'
export const INK_1 = '#0b0e14'
export const INK_2 = '#121620'
export const INK_3 = '#1a1f2b'
export const RULE = '#2a3040'
export const RULE_STRONG = '#3a4254'

export function text(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  size: number,
  colour: string,
  align: CanvasTextAlign = 'left',
  weight = 600,
  halo = false,
  family = FONT
) {
  ctx.font = `${weight} ${size}px ${family}`
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  if (halo) {
    // A dark outline keeps a label readable where it crosses a path or a star
    ctx.lineJoin = 'round'
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(7,9,13,.92)'
    ctx.strokeText(s, x, y)
  }
  ctx.fillStyle = colour
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

/**
 * Split-flap text: one ink cell per character (with the hinge line across the
 * middle), then the whole string in mono on top, so the glyphs land in the cells.
 */
export function flapText(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  size: number,
  colour: string,
  align: CanvasTextAlign = 'left',
  weight = 600,
  cell = INK_2
) {
  ctx.font = `${weight} ${size}px ${MONO}`
  const cw = ctx.measureText('M').width || size * 0.6
  const w = cw * s.length
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
  const top = y - size * 0.86
  const h = size * 1.12
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ' ') continue
    ctx.fillStyle = cell
    ctx.fillRect(left + i * cw + 1.5, top, cw - 3, h)
    ctx.fillStyle = INK_0
    ctx.fillRect(left + i * cw + 1.5, top + h / 2 - 1, cw - 3, 2)
  }
  text(ctx, s, x, y, size, colour, align, weight, false, MONO)
}
