import type { BayView, BoardRow, RowKey, StackBlock, Tone } from './bayView'
import { CATEGORY_COLORS } from './trayOptions'

/** Canvas painters for the assembly bay: the wall board, the scale read-out and the block tags. */

export const BOARD_W = 1600
export const BOARD_H = 1200
export const SCALE_W = 768
export const SCALE_H = 160
export const TAG_W = 640
export const TAG_H = 200

export const TONE_COLORS: Record<Tone, string> = { green: '#22c55e', yellow: '#f59e0b', red: '#ef4444' }
const ACCENT = '#c4b5fd' // Space purple, light

export interface BoardAnim {
  t: number // seconds, for blinking
  reduced: boolean
  shown: Record<RowKey, number> // eased bar values
}

export function animFromView(view: BayView): BoardAnim {
  const shown = {} as Record<RowKey, number>
  for (const r of view.rows) shown[r.key] = r.value
  return { t: 0, reduced: false, shown }
}

/** Split text into lines no wider than maxWidth; the last line gets an ellipsis when cut. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  let cut = false
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (!line || ctx.measureText(next).width <= maxWidth) {
      line = next
      continue
    }
    lines.push(line)
    line = w
    if (lines.length === maxLines) {
      cut = true
      break
    }
  }
  if (!cut && line) lines.push(line)
  if (cut) {
    let last = lines[maxLines - 1]
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
    lines[maxLines - 1] = `${last}…`
  }
  return lines
}

const fin = (x: number) => (Number.isFinite(x) ? x : 0)

function paintRow(ctx: CanvasRenderingContext2D, r: BoardRow, y: number, shown: number) {
  const x = 60
  const w = BOARD_W - 120
  const color = TONE_COLORS[r.tone]
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#cbd5e1'
  ctx.font = '600 40px system-ui, sans-serif'
  ctx.fillText(r.title, x, y)
  ctx.textAlign = 'right'
  ctx.fillStyle = color
  ctx.font = '700 50px system-ui, sans-serif'
  ctx.fillText(r.text, x + w, y + 4)
  ctx.textAlign = 'left'
  // Bar: the limit sits at 80% of the width, so an overshoot shows past the mark
  const barY = y + 22
  const barH = 40
  const limitX = w * 0.8
  ctx.fillStyle = '#111c2e'
  ctx.fillRect(x, barY, w, barH)
  const limit = fin(r.limit)
  const share = limit > 0 ? fin(shown) / limit : 1.25
  ctx.fillStyle = color
  ctx.fillRect(x, barY, Math.max(0, Math.min(w, limitX * share)), barH)
  ctx.fillStyle = '#e2e8f0'
  ctx.fillRect(x + limitX - 3, barY - 10, 6, barH + 20)
}

/** The wall board: title, six rows in the Go / No-Go colours, and the status box with its reason. */
export function paintBoard(ctx: CanvasRenderingContext2D, view: BayView, anim: BoardAnim) {
  ctx.fillStyle = '#050a14'
  ctx.fillRect(0, 0, BOARD_W, BOARD_H)
  ctx.fillStyle = '#7c3aed'
  ctx.fillRect(0, 0, BOARD_W, 8)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = ACCENT
  ctx.font = '600 38px system-ui, sans-serif'
  ctx.fillText(view.title, 60, 74)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(`PARTS $${fin(view.partsCost).toFixed(1)}M`, BOARD_W - 60, 74)

  const top = 160
  const step = 136
  view.rows.forEach((r, i) => paintRow(ctx, r, top + i * step, anim.shown[r.key] ?? r.value))

  // Status box with the worst check's reason
  const boxY = top + view.rows.length * step - 20
  const boxH = BOARD_H - boxY - 30
  const tone = view.status.tone
  const blinkOff = tone === 'red' && !anim.reduced && Math.floor(fin(anim.t) * 1.5) % 2 === 1
  ctx.fillStyle = tone === 'red' ? (blinkOff ? '#450a0a' : '#7f1d1d') : tone === 'yellow' ? '#4a2a05' : '#052e16'
  ctx.fillRect(60, boxY, BOARD_W - 120, boxH)
  ctx.fillStyle = tone === 'green' ? '#86efac' : '#ffffff'
  ctx.font = '700 36px system-ui, sans-serif'
  ctx.textAlign = 'left'
  const lines = wrapText(ctx, view.status.lines, BOARD_W - 180)
  const lineH = 44
  const startY = boxY + boxH / 2 - ((lines.length - 1) * lineH) / 2 + 12
  lines.forEach((l, i) => ctx.fillText(l, 90, startY + i * lineH))
}

/** The read-out in front of the turntable scale. */
export function paintScale(ctx: CanvasRenderingContext2D, view: BayView, shownMass: number) {
  const color = TONE_COLORS[view.massTone]
  ctx.fillStyle = '#020617'
  ctx.fillRect(0, 0, SCALE_W, SCALE_H)
  ctx.strokeStyle = color
  ctx.lineWidth = 8
  ctx.strokeRect(4, 4, SCALE_W - 8, SCALE_H - 8)
  ctx.fillStyle = color
  ctx.font = '700 92px ui-monospace, Menlo, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${fin(shownMass).toFixed(1)} kg`, SCALE_W / 2, SCALE_H / 2 + 4)
}

/** A block's label: on its front face, or as a call-out tag with the part's telling detail. */
export function paintTag(ctx: CanvasRenderingContext2D, block: StackBlock) {
  const color = block.overLimit ? '#ef4444' : (CATEGORY_COLORS[block.category] ?? '#64748b')
  ctx.clearRect(0, 0, TAG_W, TAG_H)
  ctx.fillStyle = 'rgba(2, 6, 23, 0.82)'
  ctx.fillRect(0, 0, TAG_W, TAG_H)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 14, TAG_H)
  // Detail icons: battery cells, or computer boards
  let textX = 36
  if (block.detail > 0) {
    ctx.fillStyle = color
    for (let i = 0; i < block.detail; i++) {
      if (block.category === 'battery') ctx.fillRect(36 + i * 34, 52, 24, 96)
      else ctx.fillRect(36, 60 + i * 44, 92, 30)
    }
    textX = block.category === 'battery' ? 56 + block.detail * 34 : 150
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.font = '600 44px system-ui, sans-serif'
  const name = wrapText(ctx, block.name, TAG_W - textX - 20, 1)[0] ?? ''
  ctx.fillText(name, textX, block.sub ? 72 : 100)
  if (block.sub) {
    ctx.fillStyle = block.readOnly ? '#94a3b8' : '#cbd5e1'
    ctx.font = '34px system-ui, sans-serif'
    ctx.fillText(wrapText(ctx, block.sub, TAG_W - textX - 20, 1)[0] ?? '', textX, 134)
  }
}
