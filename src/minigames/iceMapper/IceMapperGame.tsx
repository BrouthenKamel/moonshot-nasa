import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { audio } from '../../assets/audio'
import { SeededRNG } from '../../sim/rng'
import type { Design } from '../../sim/types'
import {
  AREAS,
  AUTOPILOT,
  CRAFT_X,
  CRAFT_Y,
  PASS_LENGTH,
  VIEW_H,
  VIEW_W,
  areaScreen,
  beamRadius,
  botAim,
  craftPosition,
  isVisible,
  mapped,
  newPass,
  reach,
  scanAbility,
  setupFromDesign,
  step,
  summarize,
  type BotMind,
  passHours,
  type PassResult,
  type PassState,
  type Reticle,
} from './logic'
import { generateTerrain } from './terrain'

/**
 * Ice Mapper: the screen. A strip of shaded-relief Moon scrolls past the craft; aim the scanner at
 * a crater to scan it before it slips away: no clicking, hovering is enough. The rules are in logic.ts:
 * this file only draws them and passes the player's mouse (or touch) in. P or Space pauses.
 */

const ICE = '#7dd3fc'
/** The terrain is drawn at this share of the nominal size and scaled up: smooth ground is fine */
const TS = 0.75
const STRIP_H = PASS_LENGTH + VIEW_H + 400
const WORLD_MARGIN = 140

type Phase = 'loading' | 'briefing' | 'playing' | 'result' | 'skipped'

interface Floater {
  x: number
  y: number
  text: string
  born: number
  color: string
}
interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  born: number
  life: number
}

function play(id: Parameters<typeof audio.play>[0]) {
  try {
    audio.play(id)
  } catch {
    // sound is a nicety: a locked audio context must never stop the game
  }
}

/** The shaded Moon for the whole pass, drawn once */
function buildTerrain(): HTMLCanvasElement {
  const w = Math.round(VIEW_W * TS)
  const h = Math.round(STRIP_H * TS)
  const areas = AREAS.map((a) => ({ x: a.x * TS, y: (STRIP_H - 1 - (a.y + WORLD_MARGIN)) * TS, r: a.r * TS, dark: a.dark }))
  const data = generateTerrain({ w, h, seed: 2026, areas })
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(w, h)
  image.data.set(data)
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** A fixed scatter of points inside each crater, revealed as the ice there is mapped */
const SPARKLES: Array<Array<{ dx: number; dy: number; size: number; phase: number }>> = (() => {
  const rng = new SeededRNG(99)
  return AREAS.map((a) =>
    Array.from({ length: 10 + a.value }, () => {
      const ang = rng.next() * Math.PI * 2
      const rad = Math.sqrt(rng.next()) * a.r * 0.82
      return { dx: Math.cos(ang) * rad, dy: Math.sin(ang) * rad, size: 2 + rng.next() * 3.5, phase: rng.next() * 6 }
    })
  )
})()

interface Frame {
  st: PassState
  ret: Reticle
  scanning: boolean
  phase: Phase
  now: number
  floaters: Floater[]
  sparks: Spark[]
}

interface Viewport {
  scale: number
  offX: number
  offY: number
  width: number
  height: number
  dpr: number
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r * 0.28, y - r * 0.28)
  ctx.lineTo(x + r, y)
  ctx.lineTo(x + r * 0.28, y + r * 0.28)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r * 0.28, y + r * 0.28)
  ctx.lineTo(x - r, y)
  ctx.lineTo(x - r * 0.28, y - r * 0.28)
  ctx.closePath()
  ctx.fill()
}

function drawCraft(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
  const bob = Math.sin(now / 700) * 1.5
  ctx.save()
  ctx.translate(x, y + bob)
  // its shadow on the ground far below
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(10, 34, 46, 9, 0, 0, Math.PI * 2)
  ctx.fill()
  // solar wings
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.scale(side, 1)
    const grad = ctx.createLinearGradient(14, 0, 96, 0)
    grad.addColorStop(0, '#27408f')
    grad.addColorStop(1, '#1a2a66')
    ctx.fillStyle = grad
    ctx.fillRect(14, -9, 82, 18)
    ctx.strokeStyle = 'rgba(190,205,255,0.45)'
    ctx.lineWidth = 1
    for (let i = 1; i < 6; i++) {
      ctx.beginPath()
      ctx.moveTo(14 + i * 13.6, -9)
      ctx.lineTo(14 + i * 13.6, 9)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(14, 0)
    ctx.lineTo(96, 0)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(14, -9, 82, 4)
    ctx.restore()
  }
  // the body, in gold foil and aluminium
  const body = ctx.createLinearGradient(-14, -22, 14, 22)
  body.addColorStop(0, '#f1d58a')
  body.addColorStop(0.5, '#c79a3a')
  body.addColorStop(1, '#8a6a22')
  ctx.fillStyle = body
  ctx.fillRect(-14, -24, 28, 48)
  ctx.strokeStyle = '#d9dde6'
  ctx.lineWidth = 2
  ctx.strokeRect(-14, -24, 28, 48)
  ctx.fillStyle = '#10151f'
  ctx.beginPath()
  ctx.arc(0, -24, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Is the scanner over a crater it could be working on right now? (lights the beam up) */
function overCrater(st: PassState, ret: Reticle): boolean {
  const s = craftPosition(st)
  return AREAS.some((a, i) => {
    if (st.progress[i] >= 1 || !isVisible(a, s)) return false
    const at = areaScreen(a, s)
    return Math.hypot(ret.x - at.x, ret.y - at.y) <= reach(st.setup, a)
  })
}

function drawArea(ctx: CanvasRenderingContext2D, f: Frame, i: number) {
  const { st, ret, now } = f
  const area = AREAS[i]
  const s = craftPosition(st)
  if (!isVisible(area, s)) return
  const at = areaScreen(area, s)
  const p = st.progress[i]
  const ability = scanAbility(st.setup, area)
  const near = Math.hypot(ret.x - at.x, ret.y - at.y) <= reach(st.setup, area)
  const noSignal = ability.blocked !== null && (st.blocked[i] !== null || (near && f.scanning))
  const live = f.phase === 'playing' || f.phase === 'result'

  // ice glow rising inside the crater as it is mapped
  if (p > 0) {
    const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, area.r)
    g.addColorStop(0, `rgba(125,211,252,${0.5 * p})`)
    g.addColorStop(1, 'rgba(125,211,252,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(at.x, at.y, area.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = ICE
    const shown = Math.floor(p * SPARKLES[i].length)
    for (let k = 0; k < shown; k++) {
      const sp = SPARKLES[i][k]
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 260 + sp.phase)
      star(ctx, at.x + sp.dx, at.y + sp.dy, sp.size)
    }
    ctx.globalAlpha = 1
  }

  // the ring around it
  ctx.lineWidth = 2.5
  ctx.setLineDash(p >= 1 ? [] : [10, 8])
  ctx.lineDashOffset = -now / 60
  ctx.strokeStyle = p >= 1 ? ICE : noSignal ? '#f87171' : near && live ? '#ffffff' : 'rgba(235,238,255,0.5)'
  ctx.beginPath()
  ctx.arc(at.x, at.y, area.r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])

  // progress arc
  if (p > 0) {
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    ctx.strokeStyle = ICE
    ctx.shadowColor = ICE
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.arc(at.x, at.y, area.r + 10, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.lineCap = 'butt'
  }

  // no signal: the instrument cannot read this crater
  if (noSignal) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(at.x, at.y, area.r - 2, 0, Math.PI * 2)
    ctx.clip()
    for (let k = 0; k < 90; k++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.22})`
      ctx.fillRect(at.x - area.r + Math.random() * area.r * 2, at.y - area.r + Math.random() * area.r * 2, 3, 2)
    }
    ctx.restore()
    ctx.textAlign = 'center'
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(now / 90)
    ctx.fillStyle = '#fca5a5'
    ctx.font = '700 16px ui-monospace, monospace'
    ctx.fillText('NO SIGNAL', at.x, at.y - 2)
    ctx.font = '600 12px ui-sans-serif, system-ui'
    ctx.fillText(ability.blocked === 'dark' ? "can't see into shadow" : 'reads no ice', at.x, at.y + 16)
    ctx.globalAlpha = 1
  } else if (p >= 1) {
    ctx.textAlign = 'center'
    ctx.fillStyle = '#e0f2fe'
    ctx.font = '700 14px ui-monospace, monospace'
    ctx.fillText('MAPPED', at.x, at.y + 5)
  }

  // its name, on a soft plate: the crater, its share of the ice, and why it matters
  ctx.textAlign = 'center'
  ctx.font = '700 15px ui-sans-serif, system-ui'
  const label = `${area.name.toUpperCase()}  ${area.value}%`
  const sub = p >= 1 ? 'MAPPED' : area.dark ? 'PERMANENT SHADOW \u00b7 ICE LIVES HERE' : 'SUNLIT \u00b7 LESS ICE'
  const plateW = Math.max(ctx.measureText(label).width, 190) + 24
  const top = at.y - area.r - 50
  ctx.fillStyle = 'rgba(6,10,20,0.6)'
  ctx.beginPath()
  ctx.roundRect(at.x - plateW / 2, top, plateW, 40, 10)
  ctx.fill()
  ctx.strokeStyle = p >= 1 ? 'rgba(125,211,252,0.7)' : 'rgba(255,255,255,0.14)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = p >= 1 ? '#bae6fd' : '#ffffff'
  ctx.fillText(label, at.x, top + 17)
  ctx.font = '600 10px ui-sans-serif, system-ui'
  ctx.fillStyle = p >= 1 ? 'rgba(186,230,253,0.8)' : area.dark ? 'rgba(190,200,255,0.85)' : 'rgba(255,236,190,0.85)'
  ctx.fillText(sub, at.x, top + 32)
}

function drawBeam(ctx: CanvasRenderingContext2D, f: Frame) {
  if (f.phase !== 'playing') return
  const { ret, scanning, now } = f
  const beam = beamRadius(f.st.setup)
  const dx = ret.x - CRAFT_X
  const dy = ret.y - CRAFT_Y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const grad = ctx.createLinearGradient(CRAFT_X, CRAFT_Y, ret.x, ret.y)
  grad.addColorStop(0, 'rgba(255,240,205,0)')
  grad.addColorStop(1, `rgba(255,240,205,${scanning ? 0.34 : 0.09})`)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(CRAFT_X + nx * 3, CRAFT_Y + ny * 3)
  ctx.lineTo(ret.x + nx * beam * 0.9, ret.y + ny * beam * 0.9)
  ctx.lineTo(ret.x - nx * beam * 0.9, ret.y - ny * beam * 0.9)
  ctx.lineTo(CRAFT_X - nx * 3, CRAFT_Y - ny * 3)
  ctx.closePath()
  ctx.fill()
  if (scanning) {
    ctx.strokeStyle = 'rgba(255,240,205,0.7)'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 14])
    ctx.lineDashOffset = -now / 12
    ctx.beginPath()
    ctx.moveTo(CRAFT_X, CRAFT_Y)
    ctx.lineTo(ret.x, ret.y)
    ctx.stroke()
    ctx.setLineDash([])
    const pulse = (now / 500) % 1
    ctx.strokeStyle = `rgba(255,240,205,${0.7 * (1 - pulse)})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(ret.x, ret.y, beam * (0.5 + 0.7 * pulse), 0, Math.PI * 2)
    ctx.stroke()
  }
  // the scanner's reach
  ctx.strokeStyle = scanning ? '#fff7e0' : 'rgba(255,255,255,0.85)'
  ctx.lineWidth = scanning ? 3 : 2
  ctx.setLineDash(scanning ? [] : [6, 6])
  ctx.beginPath()
  ctx.arc(ret.x, ret.y, beam, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.lineWidth = 2
  for (const [ax, ay] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    ctx.beginPath()
    ctx.moveTo(ret.x + ax * (beam - 8), ret.y + ay * (beam - 8))
    ctx.lineTo(ret.x + ax * (beam + 8), ret.y + ay * (beam + 8))
    ctx.stroke()
  }
}

function drawFrame(canvas: HTMLCanvasElement, terrain: HTMLCanvasElement | null, view: Viewport, f: Frame) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#04060b'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.offX, view.dpr * view.offY)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, VIEW_W, VIEW_H)
  ctx.clip()

  const s = craftPosition(f.st)
  if (terrain) {
    const srcY = (STRIP_H - 1 - (s + CRAFT_Y + WORLD_MARGIN)) * TS
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(terrain, 0, srcY, terrain.width, VIEW_H * TS, 0, 0, VIEW_W, VIEW_H)
  }
  // the horizon ahead fades into the dark, and the edges close in
  const fade = ctx.createLinearGradient(0, 0, 0, 190)
  fade.addColorStop(0, 'rgba(4,6,11,0.75)')
  fade.addColorStop(1, 'rgba(4,6,11,0)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, VIEW_W, 190)
  const vig = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)

  for (let i = 0; i < AREAS.length; i++) drawArea(ctx, f, i)
  drawBeam(ctx, f)
  drawCraft(ctx, CRAFT_X, CRAFT_Y, f.now)

  // sparks and "+12%" floating up from a crater that was just finished
  for (const sp of f.sparks) {
    const age = (f.now - sp.born) / sp.life
    if (age > 1) continue
    ctx.globalAlpha = 1 - age
    ctx.fillStyle = ICE
    star(ctx, sp.x + sp.vx * age * sp.life * 0.001, sp.y + sp.vy * age * sp.life * 0.001, 3.5)
  }
  ctx.globalAlpha = 1
  ctx.textAlign = 'center'
  for (const fl of f.floaters) {
    const age = (f.now - fl.born) / 1400
    if (age > 1) continue
    ctx.globalAlpha = 1 - age * age
    ctx.font = '800 28px ui-sans-serif, system-ui'
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillText(fl.text, fl.x + 1.5, fl.y - age * 60 + 1.5)
    ctx.fillStyle = fl.color
    ctx.fillText(fl.text, fl.x, fl.y - age * 60)
  }
  ctx.globalAlpha = 1
  ctx.restore()
}

/* ---------------- the component ---------------- */

/** How the pass was taken: flown by the player, watched on autopilot, or skipped (no result) */
export interface PassOutcome {
  how: 'flown' | 'autopilot' | 'skipped'
  result: PassResult | null
}

/** Reticle speed for the arrow keys, nominal pixels a second */
const KEY_SPEED = 620
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/** A touch screen with no mouse: the pass is watched on autopilot there */
function touchOnly(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches
}

/**
 * The first mapping pass, over the whole base while the flight holds (it is a modal, so the agency
 * clock waits). Three moments: the briefing (what the pass is flown with, fly it or watch the
 * autopilot), the pass with a two-gauge HUD, then one line on what it mapped and Continue.
 * Mouse, touch or arrow keys steer; on a touch-only screen the autopilot flies.
 */
export function IceMapperGame({
  design,
  intro,
  skippable = false,
  lineAfter,
  onDone,
}: {
  design: Design
  /** What the pass is flown with, shown in the briefing */
  intro?: ReactNode
  /** After the first pass ever flown, the pass can be skipped */
  skippable?: boolean
  /** The one line after the pass */
  lineAfter: (o: PassOutcome) => string
  onDone: (o: PassOutcome) => void
}) {
  const setup = useMemo(() => setupFromDesign(design), [design])
  const [phase, setPhase] = useState<Phase>('loading')
  const [result, setResult] = useState<PassResult | null>(null)
  const [hud, setHud] = useState({ t: 0, mapped: 0 })
  const [hint, setHint] = useState(true)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [paused, setPaused] = useState(false)
  const [autopilot, setAutopilot] = useState(false)
  const [touch] = useState(touchOnly)
  const keys = useRef(new Set<string>())
  const pausedRef = useRef(false)
  pausedRef.current = paused

  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const terrain = useRef<HTMLCanvasElement | null>(null)
  const st = useRef<PassState>(newPass(setup))
  const ret = useRef<Reticle>({ x: CRAFT_X, y: CRAFT_Y - 220 })
  const scanning = useRef(false)
  const mind = useRef<BotMind>({ target: null, idleUntil: 0 })
  const floaters = useRef<Floater[]>([])
  const sparks = useRef<Spark[]>([])
  const phaseRef = useRef<Phase>('loading')
  phaseRef.current = phase
  const autoRef = useRef(autopilot)
  autoRef.current = autopilot

  // the Moon is drawn once, off screen, a moment after the screen appears
  useEffect(() => {
    const id = window.setTimeout(() => {
      terrain.current = buildTerrain()
      setPhase('briefing')
    }, 40)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const viewport = useCallback((): Viewport => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const scale = Math.min(size.w / VIEW_W, size.h / VIEW_H) || 1
    return { scale, offX: (size.w - VIEW_W * scale) / 2, offY: (size.h - VIEW_H * scale) / 2, width: size.w, height: size.h, dpr }
  }, [size])

  const finish = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    const r = summarize(st.current)
    setResult(r)
    setPhase('result')
    play(r.win ? 'sfx.reveal' : 'sfx.error')
  }, [])

  const begin = useCallback((withAuto: boolean) => {
    st.current = newPass(setup)
    mind.current = { target: null, idleUntil: 0 }
    floaters.current = []
    sparks.current = []
    ret.current = { x: CRAFT_X, y: CRAFT_Y - 220 }
    scanning.current = false
    setResult(null)
    setHint(true)
    setPaused(false)
    setAutopilot(withAuto)
    autoRef.current = withAuto
    setPhase('playing')
    play('sfx.go')
  }, [setup])

  // the frame loop: advances the pass while it is being played, and always draws
  useEffect(() => {
    if (phase === 'loading' || size.w === 0) return
    let raf = 0
    let last = performance.now()
    const el = canvas.current
    if (!el) return
    const view = viewport()
    el.width = Math.round(view.width * view.dpr)
    el.height = Math.round(view.height * view.dpr)
    let hudAt = 0
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const state = st.current
      if (phaseRef.current === 'playing' && !pausedRef.current) {
        if (!autoRef.current && keys.current.size) {
          let dx = 0
          let dy = 0
          for (const k of keys.current) {
            dx += ARROWS[k][0]
            dy += ARROWS[k][1]
          }
          const len = Math.hypot(dx, dy) || 1
          ret.current = {
            x: Math.min(VIEW_W, Math.max(0, ret.current.x + (dx / len) * KEY_SPEED * dt)),
            y: Math.min(VIEW_H, Math.max(0, ret.current.y + (dy / len) * KEY_SPEED * dt)),
          }
          scanning.current = true
        }
        let input = { x: ret.current.x, y: ret.current.y, scanning: scanning.current }
        if (autoRef.current) {
          const aim = botAim(state, mind.current)
          if (aim.target) {
            const dx = aim.target.x - ret.current.x
            const dy = aim.target.y - ret.current.y
            const d = Math.hypot(dx, dy)
            const move = Math.min(d, AUTOPILOT.speed * dt)
            if (d > 0) {
              ret.current.x += (dx / d) * move
              ret.current.y += (dy / d) * move
            }
          }
          input = { x: ret.current.x, y: ret.current.y, scanning: aim.scanning }
          scanning.current = aim.scanning
        }
        for (const e of step(state, input, dt)) {
          if (e.type === 'complete') {
            const at = areaScreen(AREAS[e.index], craftPosition(state))
            floaters.current.push({ x: at.x, y: at.y - 20, text: `+${e.gain}%`, born: now, color: '#e0f2fe' })
            for (let k = 0; k < 18; k++) {
              const ang = (k / 18) * Math.PI * 2
              sparks.current.push({ x: at.x, y: at.y, vx: Math.cos(ang) * 260, vy: Math.sin(ang) * 260, born: now, life: 700 })
            }
            play('sfx.snap')
          } else if (e.type === 'blocked') play('sfx.static')
          else if (e.type === 'end') window.setTimeout(finish, 700)
        }
        if (now - hudAt > 90) {
          hudAt = now
          setHud({ t: state.t, mapped: mapped(state) })
          if (state.t > 7) setHint(false)
        }
      }
      floaters.current = floaters.current.filter((f) => now - f.born < 1400)
      sparks.current = sparks.current.filter((s) => now - s.born < s.life)
      drawFrame(el, terrain.current, view, {
        st: state,
        ret: ret.current,
        scanning: scanning.current && (autoRef.current || overCrater(state, ret.current)),
        phase: phaseRef.current,
        now,
        floaters: floaters.current,
        sparks: sparks.current,
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase === 'loading', size, viewport, finish]) // eslint-disable-line react-hooks/exhaustive-deps

  // mouse, touch and keys
  const toNominal = (e: React.PointerEvent): Reticle => {
    const rect = wrap.current!.getBoundingClientRect()
    const v = viewport()
    return { x: (e.clientX - rect.left - v.offX) / v.scale, y: (e.clientY - rect.top - v.offY) / v.scale }
  }
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (phaseRef.current !== 'playing') return
      if (e.key in ARROWS) {
        e.preventDefault()
        keys.current.add(e.key)
      } else if (e.code === 'Space' || e.code === 'KeyP') {
        e.preventDefault()
        setPaused((p) => !p)
      } else if (e.code === 'Escape') finish() // ends the pass early: the result is what was mapped
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.key)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [finish])

  const secondsLeft = Math.max(0, Math.ceil(setup.duration - hud.t))
  const batteryShare = Math.max(0, 1 - hud.t / setup.duration)
  const batteryTone = batteryShare > 0.5 ? 'bg-go' : batteryShare > 0.22 ? 'bg-caution' : 'bg-nogo'
  const steer = phase === 'playing' && !autopilot
  const outcome: PassOutcome = phase === 'result' ? { how: autopilot ? 'autopilot' : 'flown', result } : { how: 'skipped', result: null }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="First mapping pass"
      data-testid="ice-pass"
      data-phase={phase}
      className="fixed inset-0 z-50 select-none overflow-hidden bg-ink-0 text-paper"
      style={{ touchAction: 'none' }}
    >
      <div
        ref={wrap}
        className="absolute inset-0"
        style={{ cursor: steer ? 'none' : 'default' }}
        onPointerMove={(e) => {
          if (!steer) return
          ret.current = toNominal(e)
          scanning.current = true
        }}
        onPointerDown={(e) => {
          if (!steer) return
          ret.current = toNominal(e)
          scanning.current = true
        }}
        onPointerLeave={() => {
          if (!autopilot) scanning.current = false
        }}
      >
        <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>

      {phase === 'loading' && <div className="absolute inset-0 flex items-center justify-center fp-label">Mapping the south pole…</div>}

      {phase === 'playing' && (
        <>
          {/* Two gauges, three numbers: battery seconds, ice mapped, the target */}
          <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-center gap-3">
            <div className="fp-sheet w-44 px-3 py-2" data-tone="raised">
              <div className="flex items-baseline justify-between">
                <span className="fp-label text-[0.62rem]">Battery</span>
                <span className="fp-data text-sm text-paper">{secondsLeft} s</span>
              </div>
              <div className="mt-1.5 h-1 bg-ink-3">
                <div className={`h-full ${batteryTone}`} style={{ width: `${batteryShare * 100}%` }} />
              </div>
            </div>
            <div className="fp-sheet w-60 px-3 py-2" data-tone="raised">
              <div className="flex items-baseline justify-between">
                <span className="fp-label text-[0.62rem] text-ice">Ice mapped</span>
                <span className="fp-data text-sm text-paper">
                  {Math.round(hud.mapped)}% <span className="text-paper-dim">/ {setup.target}%</span>
                </span>
              </div>
              <div className="relative mt-1.5 h-1 bg-ink-3">
                <div className="h-full bg-ice" style={{ width: `${Math.min(100, hud.mapped)}%` }} />
                <div className="absolute -top-1 h-3 w-px bg-paper" style={{ left: `${setup.target}%` }} />
              </div>
            </div>
          </div>
          {paused && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink-0/60">
              <div className="fp-sheet px-6 py-4 text-center" data-tone="raised">
                <div className="fp-display text-lg text-paper">Paused</div>
                <button type="button" onClick={() => setPaused(false)} className="fp-btn-primary mt-3 justify-center">
                  Resume
                </button>
              </div>
            </div>
          )}
          {hint && !autopilot && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
              <div className="fp-sheet px-4 py-1.5 text-sm text-paper" data-tone="raised">
                Steer the scanner over a crater to map it (mouse or arrow keys) · P pauses · Esc ends the pass
              </div>
            </div>
          )}
        </>
      )}

      {(phase === 'briefing' || phase === 'result' || phase === 'skipped') && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink-0/60 p-4">
          <div className="fp-sheet w-full max-w-md p-5" data-tone="raised">
            {phase === 'briefing' ? (
              <>
                <h2 className="fp-display text-lg text-paper">First pass over the south pole: map the ice</h2>
                <p className="mt-1 text-xs text-paper-dim">
                  A {passHours(setup)}-hour pass, shown in {setup.duration} seconds. A better pass maps more of month 1, up to what this design can do.
                </p>
                {intro}
                <p className="mt-2 text-[11px] text-paper-faint">Real craters; how much ice each holds is a game estimate.</p>
                <div className="mt-4 flex gap-2">
                  {!touch && (
                    <button type="button" autoFocus onClick={() => begin(false)} className="fp-btn-secondary flex-1 justify-center py-2">
                      Fly it myself
                    </button>
                  )}
                  <button type="button" autoFocus={touch} onClick={() => begin(true)} className="fp-btn-secondary flex-1 justify-center py-2">
                    Watch the autopilot
                  </button>
                  {skippable && (
                    <button type="button" onClick={() => setPhase('skipped')} className="fp-btn-ghost justify-center px-4">
                      Skip
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="fp-data text-sm text-paper" data-testid="ice-pass-line">
                  {lineAfter(outcome)}
                </p>
                <button type="button" autoFocus onClick={() => onDone(outcome)} className="fp-btn-primary mt-4 w-full justify-center py-2">
                  Continue
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
