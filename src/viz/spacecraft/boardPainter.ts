import type { BayView, BoardRow, RowKey, StackBlock, Tone } from './bayView'
import { CATEGORY_COLORS } from './trayOptions'

/** Canvas painters for the assembly bay: the wall board, the scale read-out and the block tags. */

export const BOARD_W = 1600
export const BOARD_H = 1200
export const SCALE_W = 768
export const SCALE_H = 160
export const TAG_W = 640
export const TAG_H = 200

export const TONE_COLORS: Record<Tone, string> = { green: '#6faf7a', yellow: '#d9b23f', red: '#d0533f' }
const ACCENT = '#e8a33d' // Kapton
const PAPER = '#ede6d6'
const PAPER_DIM = '#b9b2a3'
const PAPER_FAINT = '#948d7f'
const SANS = '"Archivo", "Helvetica Neue", Arial, sans-serif'
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace'

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
  ctx.fillStyle = PAPER_DIM
  ctx.font = `600 40px ${SANS}`
  ctx.fillText(r.title, x, y)
  ctx.textAlign = 'right'
  ctx.fillStyle = color
  ctx.font = `600 50px ${MONO}`
  ctx.fillText(r.text, x + w, y + 4)
  ctx.textAlign = 'left'
  // Bar: the limit sits at 80% of the width, so an overshoot shows past the mark
  const barY = y + 22
  const barH = 40
  const limitX = w * 0.8
  ctx.fillStyle = '#1a1f2b'
  ctx.fillRect(x, barY, w, barH)
  const limit = fin(r.limit)
  const share = limit > 0 ? fin(shown) / limit : 1.25
  ctx.fillStyle = color
  ctx.fillRect(x, barY, Math.max(0, Math.min(w, limitX * share)), barH)
  ctx.fillStyle = PAPER
  ctx.fillRect(x + limitX - 3, barY - 10, 6, barH + 20)
}

/** The wall board: title, six rows in the Go / No-Go colours, and the status box with its reason. */
export function paintBoard(ctx: CanvasRenderingContext2D, view: BayView, anim: BoardAnim) {
  ctx.fillStyle = '#0b0e14'
  ctx.fillRect(0, 0, BOARD_W, BOARD_H)
  ctx.fillStyle = ACCENT
  ctx.fillRect(0, 0, BOARD_W, 8)
  ctx.fillStyle = '#2a3040'
  ctx.fillRect(60, 104, BOARD_W - 120, 2)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = ACCENT
  ctx.font = `700 38px ${SANS}`
  ctx.fillText(view.title, 60, 74)
  ctx.textAlign = 'right'
  ctx.fillStyle = PAPER_FAINT
  ctx.font = `500 38px ${MONO}`
  ctx.fillText(`PARTS $${fin(view.partsCost).toFixed(1)}M`, BOARD_W - 60, 74)

  const top = 160
  const step = 136
  view.rows.forEach((r, i) => paintRow(ctx, r, top + i * step, anim.shown[r.key] ?? r.value))

  // Status box with the worst check's reason
  const boxY = top + view.rows.length * step - 20
  const boxH = BOARD_H - boxY - 30
  const tone = view.status.tone
  const blinkOff = tone === 'red' && !anim.reduced && Math.floor(fin(anim.t) * 1.5) % 2 === 1
  ctx.fillStyle = tone === 'red' ? (blinkOff ? '#2a110d' : '#4a1c15') : tone === 'yellow' ? '#3a2f12' : '#1a2d1e'
  ctx.fillRect(60, boxY, BOARD_W - 120, boxH)
  ctx.fillStyle = TONE_COLORS[tone]
  ctx.fillRect(60, boxY, 10, boxH)
  ctx.fillStyle = PAPER
  ctx.font = `600 36px ${SANS}`
  ctx.textAlign = 'left'
  const lines = wrapText(ctx, view.status.lines, BOARD_W - 180)
  const lineH = 44
  const startY = boxY + boxH / 2 - ((lines.length - 1) * lineH) / 2 + 12
  lines.forEach((l, i) => ctx.fillText(l, 90, startY + i * lineH))
}

/** The read-out in front of the turntable scale. */
export function paintScale(ctx: CanvasRenderingContext2D, view: BayView, shownMass: number) {
  const color = TONE_COLORS[view.massTone]
  ctx.fillStyle = '#07090d'
  ctx.fillRect(0, 0, SCALE_W, SCALE_H)
  ctx.strokeStyle = color
  ctx.lineWidth = 6
  ctx.strokeRect(4, 4, SCALE_W - 8, SCALE_H - 8)
  ctx.fillStyle = color
  ctx.font = `600 92px ${MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${fin(shownMass).toFixed(1)} kg`, SCALE_W / 2, SCALE_H / 2 + 4)
}

/** A block's label: on its front face, or as a call-out tag with the part's telling detail. */
export function paintTag(ctx: CanvasRenderingContext2D, block: StackBlock) {
  const color = block.overLimit ? '#d0533f' : (CATEGORY_COLORS[block.category] ?? '#827c70')
  ctx.clearRect(0, 0, TAG_W, TAG_H)
  ctx.fillStyle = 'rgba(11, 14, 20, 0.88)'
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
  ctx.fillStyle = PAPER
  ctx.font = `600 44px ${SANS}`
  const name = wrapText(ctx, block.name, TAG_W - textX - 20, 1)[0] ?? ''
  ctx.fillText(name, textX, block.sub ? 72 : 100)
  if (block.sub) {
    ctx.fillStyle = block.readOnly ? PAPER_FAINT : PAPER_DIM
    ctx.font = `400 34px ${MONO}`
    ctx.fillText(wrapText(ctx, block.sub, TAG_W - textX - 20, 1)[0] ?? '', textX, 134)
  }
}
