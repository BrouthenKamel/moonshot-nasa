import type { PlanningView } from './planningView'

/**
 * Paints the mission control big screen (budget tank, road to launch, flight
 * risk) onto a 2D canvas context. Pure: everything comes from the view and the
 * eased animation values, so it can be tested in Node with a fake context.
 */

export const SCREEN_W = 2400
export const SCREEN_H = 790
/** Smallest font on the screen, in canvas pixels. About 12 CSS px at 1280 × 720. */
export const MIN_FONT = 34

export interface ScreenAnim {
  time: number // seconds, for blinking
  test: number // eased test months
  testing: number // eased testing cost, $M
  reserve: number // eased reserve, $M
  build: number // eased build months
  risk: number // eased test factor
  launchT: number // seconds since the rocket started leaving; < 0 when it stands on the pad
  reducedMotion: boolean
}

export function animFromView(view: PlanningView, time = 0): ScreenAnim {
  return {
    time,
    test: view.testTurns,
    testing: view.testCost,
    reserve: view.reserve,
    build: view.buildTurns,
    risk: view.riskFactor,
    launchT: -1,
    reducedMotion: false,
  }
}

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
const font = (weight: number, size: number) => `${weight} ${Math.max(MIN_FONT, size)}px ${FONT}`

const BLOCK_COLORS: Record<string, string> = {
  parts: '#2563eb',
  team: '#4f46e5',
  ride: '#0891b2',
  testing: '#a78bfa',
  flight: '#0d9488',
  other: '#64748b',
}
const STATUS_COLORS = { nominal: '#22c55e', caution: '#f59e0b', alert: '#ef4444' } as const

type Ctx = CanvasRenderingContext2D

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r)
  else ctx.rect(x, y, Math.max(0, w), Math.max(0, h))
}

// Hatch patterns need a real canvas; in Node (tests) solid colours are used instead.
const patterns = new Map<string, HTMLCanvasElement>()
function hatch(ctx: Ctx, key: 'green' | 'gold', fallback: string): string | CanvasPattern {
  if (typeof document === 'undefined') return fallback
  let c = patterns.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = c.height = 24
    const g = c.getContext('2d')
    if (!g) return fallback
    if (key === 'gold') {
      g.fillStyle = '#b45309'
      g.fillRect(0, 0, 24, 24)
    }
    g.strokeStyle = key === 'gold' ? '#fbbf24' : 'rgba(74,222,128,.55)'
    g.lineWidth = key === 'gold' ? 7 : 5
    g.beginPath()
    g.moveTo(-6, 30); g.lineTo(30, -6); g.moveTo(-6, 6); g.lineTo(6, -6); g.moveTo(18, 30); g.lineTo(30, 18)
    g.stroke()
    patterns.set(key, c)
  }
  return ctx.createPattern(c, 'repeat') ?? fallback
}

function rocket(ctx: Ctx, x: number, yBase: number, s: number, flame: number, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, yBase)
  if (flame > 0) {
    ctx.fillStyle = '#fb923c'
    ctx.beginPath(); ctx.moveTo(-9 * s, 0); ctx.lineTo(0, flame * 60 * s); ctx.lineTo(9 * s, 0); ctx.fill()
    ctx.fillStyle = '#fde68a'
    ctx.beginPath(); ctx.moveTo(-5 * s, 0); ctx.lineTo(0, flame * 28 * s); ctx.lineTo(5 * s, 0); ctx.fill()
  }
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(-10 * s, -64 * s, 20 * s, 64 * s)
  ctx.beginPath(); ctx.moveTo(-10 * s, -64 * s); ctx.lineTo(0, -92 * s); ctx.lineTo(10 * s, -64 * s); ctx.fill()
  ctx.fillStyle = '#f97316'
  ctx.fillRect(-10 * s, -46 * s, 20 * s, 8 * s)
  ctx.fillStyle = '#94a3b8'
  ctx.beginPath(); ctx.moveTo(-10 * s, -22 * s); ctx.lineTo(-22 * s, 0); ctx.lineTo(-10 * s, 0); ctx.fill()
  ctx.beginPath(); ctx.moveTo(10 * s, -22 * s); ctx.lineTo(22 * s, 0); ctx.lineTo(10 * s, 0); ctx.fill()
  ctx.restore()
}

function satellite(ctx: Ctx, x: number, y: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = color
  ctx.fillRect(-15, -19, 30, 38)
  ctx.fillStyle = '#1d4ed8'
  ctx.fillRect(-58, -10, 38, 20); ctx.fillRect(20, -10, 38, 20)
  ctx.strokeStyle = '#93c5fd'
  ctx.lineWidth = 2
  ctx.strokeRect(-58, -10, 38, 20); ctx.strokeRect(20, -10, 38, 20)
  ctx.restore()
}

function frame(ctx: Ctx, x: number, w: number, title: string, color: string) {
  ctx.strokeStyle = 'rgba(56,189,248,.3)'
  ctx.lineWidth = 3
  roundRect(ctx, x, 84, w, 600, 16)
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.font = font(800, 42)
  ctx.fillStyle = color
  ctx.fillText(title, x + 26, 128)
}

const money = (x: number) => `$${x.toFixed(1)}M`

/* ---------------- budget tank ---------------- */
function paintBudget(ctx: Ctx, view: PlanningView, anim: ScreenAnim) {
  const X = 20, W = 680
  frame(ctx, X, W, 'BUDGET', '#fcd34d')
  ctx.textAlign = 'right'
  ctx.font = font(600, 34)
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(`cap ${money(view.cap)}`, X + W - 24, 128)

  const TX = X + 34, TW = 150, TT = 170, TB = 664, H = TB - TT
  const cap = Math.max(view.cap, 0.001)
  const K = H / cap
  ctx.fillStyle = '#0b1730'
  ctx.fillRect(TX, TT, TW, H)

  // Cost blocks from the bottom; the testing block uses the eased amount so it grows smoothly
  const blocks = view.costBlocks.map((b) => ({ ...b, amount: b.key === 'testing' ? Math.max(0, anim.testing) : b.amount }))
  const total = blocks.reduce((s, b) => s + b.amount, 0)
  let y = TB
  for (const b of blocks) {
    const h = Math.min(b.amount * K, Math.max(0, y - TT))
    if (h <= 0) continue
    y -= h
    ctx.fillStyle = BLOCK_COLORS[b.key]
    ctx.fillRect(TX, y, TW, Math.max(0, h - 2))
  }
  const costTop = TB - Math.min(total, cap) * K
  const reserve = Math.max(0, Math.min(anim.reserve, cap))
  const limitY = TT + reserve * K

  if (reserve > 0.01) {
    ctx.fillStyle = hatch(ctx, 'gold', '#b45309')
    ctx.fillRect(TX, TT, TW, limitY - TT)
  }
  if (costTop < limitY) {
    // Costs reach into the reserve (amber) or past the cap (red, pinned to the top of the tank)
    ctx.fillStyle = total > cap ? 'rgba(239,68,68,.85)' : 'rgba(245,158,11,.75)'
    ctx.fillRect(TX, costTop, TW, limitY - costTop)
  }
  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 3
  ctx.strokeRect(TX, TT, TW, H)
  if (reserve > 0.01 || view.budgetState !== 'free') {
    ctx.setLineDash([14, 9])
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(TX - 14, limitY); ctx.lineTo(X + W - 24, limitY); ctx.stroke()
    ctx.setLineDash([])
  }

  // Labels in a fixed column
  const LX = TX + TW + 26
  ctx.textAlign = 'left'
  ctx.font = font(700, 34)
  ctx.fillStyle = view.reservePercent === 0 ? '#f87171' : '#fcd34d'
  ctx.fillText(view.reservePercent === 0 ? 'NO RESERVE' : `RESERVE ${money(view.reserve)}`, LX, Math.max(limitY - 24, TT + 14))
  ctx.font = font(600, 34)
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(`spend up to ${money(view.spendable)}`, LX, Math.max(limitY, TT + 30) + 30)

  const legendRows = blocks.filter((b) => b.amount > 0.0001 || b.key === 'testing')
  const legendTop = TB - (legendRows.length - 1) * 42 - 18
  const stateY = Math.min(Math.max(limitY + 92, TT + 130), legendTop - 46)
  ctx.font = font(800, 40)
  if (view.budgetState === 'free') {
    ctx.fillStyle = '#4ade80'
    ctx.fillText(`${money(view.budgetGap)} free`, LX, stateY)
  } else if (view.budgetState === 'eating') {
    // The reserve is locked: reaching into it blocks the launch
    ctx.fillStyle = '#f87171'
    ctx.fillText(`${money(view.budgetGap)} into reserve`, LX, stateY)
  } else {
    ctx.fillStyle = '#f87171'
    ctx.fillText(`${money(view.budgetGap)} OVER`, LX, stateY)
  }

  ctx.font = font(600, 34)
  let ly = TB - 4
  for (const b of legendRows) {
    ctx.fillStyle = BLOCK_COLORS[b.key]
    ctx.fillRect(LX, ly - 12, 22, 22)
    ctx.fillStyle = b.key === 'testing' ? '#ddd6fe' : '#cbd5e1'
    const amount = b.key === 'testing' ? view.testCost : b.amount
    ctx.fillText(`${b.label} ${money(amount)}`, LX + 32, ly)
    ly -= 42
  }
}

/* ---------------- road to launch ---------------- */
function paintRoad(ctx: Ctx, view: PlanningView, anim: ScreenAnim) {
  const X = 720, W = 1020
  frame(ctx, X, W, 'ROAD TO LAUNCH', '#93c5fd')
  const missed = view.marginMonths < 0
  ctx.textAlign = 'left'
  ctx.font = font(800, 58)
  ctx.fillStyle = missed ? '#f87171' : view.marginMonths === 0 ? '#fbbf24' : '#4ade80'
  ctx.fillText(view.headline, X + 26, 196)
  if (missed) {
    ctx.font = font(600, 34)
    ctx.fillText('Not ready when the ride leaves: launch is blocked.', X + 26, 246)
  }

  const X0 = X + 40, X1 = X + W - 40, BY = 440, BH = 92
  const n = Math.max(1, view.monthCount)
  const MW = (X1 - X0) / n
  const mx = (m: number) => X0 + m * MW

  ctx.fillStyle = '#0b1730'
  ctx.fillRect(X0, BY, X1 - X0, BH)
  ctx.textAlign = 'center'
  for (let m = 0; m <= n; m++) {
    ctx.strokeStyle = 'rgba(148,163,184,.25)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(mx(m), BY - 12); ctx.lineTo(mx(m), BY + BH + 12); ctx.stroke()
    if (m < n && (MW >= 48 || m % 2 === 0)) {
      ctx.font = font(700, 34)
      ctx.fillStyle = m < view.rideMonth ? '#94a3b8' : '#475569'
      ctx.fillText(String(m + 1), mx(m) + MW / 2, BY + BH + 44)
    }
  }

  // Blocks with eased lengths for build and test
  const lengths: Record<string, number> = { build: Math.max(0, anim.build), test: Math.max(0, anim.test) }
  const colors: Record<string, string> = { design: '#475569', build: '#2563eb', test: '#7c3aed', fit: '#0d9488' }
  let at = 0
  for (const block of [...view.timeline, ...(view.timeline.some((b) => b.key === 'test') ? [] : [{ key: 'test' as const, label: 'TEST', start: 0, length: 0 }])].sort(
    (a, b) => ['design', 'build', 'test', 'fit'].indexOf(a.key) - ['design', 'build', 'test', 'fit'].indexOf(b.key)
  )) {
    const len = lengths[block.key] ?? block.length
    if (len < 0.02) continue
    const x = mx(at), w = len * MW
    ctx.fillStyle = colors[block.key]
    roundRect(ctx, x + 3, BY + 3, w - 6, BH - 6, 12)
    ctx.fill()
    const label = block.key === 'build' ? `BUILD ${view.buildTurns}` : block.key === 'test' ? `TEST ${view.testTurns}` : block.label
    ctx.font = font(800, 34)
    if (ctx.measureText(label).width < w - 16) {
      ctx.fillStyle = '#f8fafc'
      ctx.fillText(label, x + w / 2, BY + BH / 2 + 2)
    }
    at += len
  }
  const ready = at
  if (ready < view.rideMonth - 0.02) {
    const x = mx(ready), w = (view.rideMonth - ready) * MW
    ctx.fillStyle = hatch(ctx, 'green', 'rgba(74,222,128,.35)')
    roundRect(ctx, x + 3, BY + 3, w - 6, BH - 6, 12)
    ctx.fill()
    ctx.strokeStyle = '#4ade80'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.font = font(800, 34)
    if (ctx.measureText('SPARE').width < w - 16) {
      ctx.fillStyle = '#bbf7d0'
      ctx.fillText('SPARE', x + w / 2, BY + BH / 2 + 2)
    }
  } else if (ready > view.rideMonth + 0.02) {
    ctx.fillStyle = 'rgba(239,68,68,.55)'
    ctx.fillRect(mx(view.rideMonth), BY - 8, (ready - view.rideMonth) * MW, BH + 16)
  }

  // Ride marker and rocket
  const xr = mx(view.rideMonth)
  ctx.strokeStyle = '#fbbf24'
  ctx.lineWidth = 6
  ctx.beginPath(); ctx.moveTo(xr, 300); ctx.lineTo(xr, BY + BH + 14); ctx.stroke()
  ctx.font = font(800, 34)
  ctx.fillStyle = '#fbbf24'
  const rideLabel = `RIDE · END OF MONTH ${view.rideMonth}`
  const half = ctx.measureText(rideLabel).width / 2
  ctx.fillText(rideLabel, Math.min(Math.max(xr, X + 26 + half), X + W - 26 - half), missed ? 290 : 262)
  if (anim.launchT >= 0) {
    const lift = Math.max(0, anim.launchT - 0.5)
    const up = 150 * lift * lift
    rocket(ctx, xr, BY - 12, 1.25, 0, 0.13)
    if (up < 420) {
      const shake = lift === 0 && !anim.reducedMotion ? Math.sin(anim.time * 90) * 2 : 0
      rocket(ctx, xr + shake, BY - 12 - up, 1.25, 0.8 + 0.4 * Math.abs(Math.sin(anim.time * 37)), Math.max(0, 1 - up / 380))
    }
  } else {
    rocket(ctx, xr, BY - 12, 1.25, 0, 1)
  }

  // Satellite at the ready point; its label moves left when it would hit the rocket
  const xs = mx(Math.min(ready, n + 0.3))
  const satColor = missed ? '#fca5a5' : '#e2e8f0'
  satellite(ctx, xs, BY - 46, satColor)
  if (!missed) {
    // When late, the red overlay and the headline say it; a label here would collide with the ride label
    ctx.font = font(700, 34)
    ctx.fillStyle = satColor
    const lw = ctx.measureText('READY').width
    const nearRocket = Math.abs(xs - xr) < lw / 2 + 40
    ctx.textAlign = nearRocket ? 'right' : 'center'
    ctx.fillText('READY', nearRocket ? Math.max(xs - 30, X0 + lw) : xs, BY - 92)
  }

  ctx.textAlign = 'left'
  ctx.font = font(600, 34)
  ctx.fillStyle = '#94a3b8'
  ctx.fillText('Build: from your parts  ·  Test: your knob', X0, 650)
}

/* ---------------- Go / No-Go strip ---------------- */
const CHECK_COLORS = { green: '#22c55e', yellow: '#f59e0b', red: '#ef4444' } as const

/** Shorten text with an ellipsis until it fits the width. */
function fit(ctx: Ctx, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

function paintChecks(ctx: Ctx, view: PlanningView) {
  const top = 700
  ctx.fillStyle = '#071226'
  ctx.fillRect(0, top, SCREEN_W, SCREEN_H - top)
  view.checks.forEach((c, i) => {
    const y = top + 24 + i * 42
    ctx.fillStyle = CHECK_COLORS[c.status]
    ctx.beginPath(); ctx.arc(42, y, 11, 0, Math.PI * 2); ctx.fill()
    ctx.textAlign = 'left'
    ctx.font = font(800, 34)
    const label = c.resource === 'Time' ? 'GO / NO-GO · TIME' : 'GO / NO-GO · BUDGET'
    ctx.fillText(label, 66, y + 1)
    ctx.font = font(600, 34)
    ctx.fillStyle = '#cbd5e1'
    const x = 66 + 430
    ctx.fillText(fit(ctx, c.reason, SCREEN_W - x - 30), x, y + 1)
  })
}

/* ---------------- flight risk ---------------- */
const RISK_MARKS = [2.0, 1.4, 1.0, 0.7]
function paintRisk(ctx: Ctx, view: PlanningView, anim: ScreenAnim) {
  const X = 1760, W = 620
  frame(ctx, X, W, 'FLIGHT RISK', '#c4b5fd')
  const GX = X + W / 2, GY = 410, GR = 165
  const fa = (f: number) => Math.PI + ((2.0 - Math.min(2.0, Math.max(0.7, f))) / 1.3) * Math.PI
  for (const [a, b, c] of [[2.0, 1.4, '#ef4444'], [1.4, 1.0, '#f59e0b'], [1.0, 0.7, '#22c55e']] as const) {
    ctx.strokeStyle = c
    ctx.lineWidth = 34
    ctx.beginPath(); ctx.arc(GX, GY, GR, fa(a) + 0.012, fa(b) - 0.012); ctx.stroke()
  }
  ctx.textAlign = 'center'
  ctx.font = font(700, 34)
  ctx.fillStyle = '#cbd5e1'
  for (const f of RISK_MARKS) {
    const a = fa(f)
    ctx.fillText(`×${f.toFixed(1)}`, GX + Math.cos(a) * (GR + 62), GY + Math.sin(a) * (GR + 44))
  }
  const an = fa(anim.risk)
  ctx.strokeStyle = '#f8fafc'
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(GX, GY); ctx.lineTo(GX + Math.cos(an) * (GR - 34), GY + Math.sin(an) * (GR - 34)); ctx.stroke()
  ctx.lineCap = 'butt'
  ctx.fillStyle = '#f8fafc'
  ctx.beginPath(); ctx.arc(GX, GY, 16, 0, Math.PI * 2); ctx.fill()

  const f = view.riskFactor
  ctx.font = font(800, 84)
  ctx.fillStyle = f > 1.4 ? '#f87171' : f > 1.0 ? '#fbbf24' : '#4ade80'
  ctx.fillText(`×${f.toFixed(1)}`, GX, 500)
  ctx.font = font(600, 34)
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(view.riskCaption, GX, 562)

  for (let i = 0; i < 3; i++) {
    const cx = X + 40 + i * 190
    const on = i < view.testTurns
    ctx.beginPath(); ctx.arc(cx + 14, 632, 14, 0, Math.PI * 2)
    if (on) {
      ctx.fillStyle = '#a78bfa'
      ctx.fill()
    } else {
      ctx.strokeStyle = '#475569'
      ctx.lineWidth = 3
      ctx.stroke()
    }
    ctx.textAlign = 'left'
    ctx.font = font(700, 34)
    ctx.fillStyle = on ? '#ddd6fe' : '#475569'
    ctx.fillText(`TEST ${i + 1}`, cx + 38, 634)
  }
}

export function paintScreen(ctx: Ctx, view: PlanningView, anim: ScreenAnim): void {
  ctx.save()
  ctx.fillStyle = '#020a1a'
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H)
  ctx.strokeStyle = 'rgba(56,189,248,.06)'
  ctx.lineWidth = 1
  for (let x = 0; x < SCREEN_W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SCREEN_H); ctx.stroke() }
  for (let y = 0; y < SCREEN_H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SCREEN_W, y); ctx.stroke() }
  ctx.textBaseline = 'middle'

  // Header
  ctx.fillStyle = '#071226'
  ctx.fillRect(0, 0, SCREEN_W, 70)
  ctx.textAlign = 'left'
  ctx.font = font(700, 36)
  ctx.fillStyle = '#7dd3fc'
  ctx.fillText('COMMS CENTER  ·  LUNAR ICE MAPPER  ·  MISSION PLANNING', 30, 37)
  const level = view.status.level
  const blink = level === 'alert' && !anim.reducedMotion ? (Math.sin(anim.time * 8) > 0 ? 1 : 0.35) : 1
  ctx.font = font(800, 34)
  const chipW = ctx.measureText(view.status.chip).width + 60
  ctx.globalAlpha = blink
  ctx.fillStyle = STATUS_COLORS[level]
  roundRect(ctx, SCREEN_W - 30 - chipW, 10, chipW, 50, 10)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.textAlign = 'center'
  ctx.fillStyle = '#020617'
  ctx.fillText(view.status.chip, SCREEN_W - 30 - chipW / 2, 37)

  paintBudget(ctx, view, anim)
  paintRoad(ctx, view, anim)
  paintRisk(ctx, view, anim)
  paintChecks(ctx, view)
  ctx.restore()
}
