import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

type Phase = 'loading' | 'briefing' | 'playing' | 'result'

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

export interface IceMapperDemo {
  /** Skip the briefing */
  start?: boolean
  /** Let the autopilot fly it */
  auto?: boolean
  /** Fast-forward this many seconds into the pass before showing it */
  skip?: number
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

function Stars({ n }: { n: number }) {
  return (
    <div className="flex justify-center gap-2 text-4xl" aria-label={`${n} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? 'text-sky-300 drop-shadow-[0_0_14px_rgba(125,211,252,0.9)]' : 'text-slate-700'}>
          ★
        </span>
      ))}
    </div>
  )
}

export function IceMapperGame({
  design,
  onExit,
  onComplete,
  demo,
}: {
  design?: Design
  onExit: () => void
  onComplete?: (r: PassResult) => void
  demo?: IceMapperDemo
}) {
  const setup = useMemo(() => setupFromDesign(design), [design])
  const [phase, setPhase] = useState<Phase>('loading')
  const [result, setResult] = useState<PassResult | null>(null)
  const [auto, setAuto] = useState(false)
  const [hud, setHud] = useState({ t: 0, mapped: 0 })
  const [hint, setHint] = useState(true)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [paused, setPaused] = useState(false)
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
  const autoRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  phaseRef.current = phase
  autoRef.current = auto

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
    const r = summarize(st.current)
    setResult(r)
    setPhase('result')
    onCompleteRef.current?.(r)
    play(r.win ? 'sfx.reveal' : 'sfx.error')
  }, [])

  const begin = useCallback(
    (withAuto: boolean) => {
      st.current = newPass(setup)
      mind.current = { target: null, idleUntil: 0 }
      floaters.current = []
      sparks.current = []
      ret.current = { x: CRAFT_X, y: CRAFT_Y - 220 }
      scanning.current = false
      setResult(null)
      setAuto(withAuto)
      setHint(true)
      setPaused(false)
      // for demos and screenshots: play ahead with the bot so the pass is already under way
      if (demo?.skip) {
        const dt = 1 / 60
        while (!st.current.done && st.current.t < demo.skip) {
          const aim = botAim(st.current, mind.current)
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
          step(st.current, { x: ret.current.x, y: ret.current.y, scanning: aim.scanning }, dt)
        }
        scanning.current = true
      }
      setPhase('playing')
      play('sfx.go')
    },
    [setup, demo?.skip]
  )

  // demos skip the briefing
  const started = useRef(false)
  useEffect(() => {
    if (phase === 'briefing' && demo?.start && !started.current) {
      started.current = true
      begin(!!demo.auto)
    }
  }, [phase, demo, begin])

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
      if (e.code === 'Space' || e.code === 'KeyP') {
        e.preventDefault()
        if (phaseRef.current === 'playing') setPaused((p) => !p)
      } else if (e.code === 'Escape') onExit()
    }
    window.addEventListener('keydown', down)
    return () => {
      window.removeEventListener('keydown', down)
    }
  }, [onExit])

  const secondsLeft = Math.max(0, Math.ceil(setup.duration - hud.t))
  const batteryShare = Math.max(0, 1 - hud.t / setup.duration)
  const batteryColor = batteryShare > 0.5 ? '#4ade80' : batteryShare > 0.22 ? '#fbbf24' : '#f87171'
  const unreachable = setup.areas.reduce((sum, a) => sum + (scanAbility(setup, a).blocked ? a.value : 0), 0)
  const hopeless = unreachable > 100 - setup.target
  const noIce = !setup.scanners.some((s) => s.mapsIce)

  const btn = 'rounded-xl px-6 py-3 font-semibold transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70'

  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-[#04060b] text-slate-100" style={{ touchAction: 'none' }}>
      <div
        ref={wrap}
        className="absolute inset-0"
        style={{ cursor: phase === 'playing' && !auto ? 'none' : 'default' }}
        onPointerMove={(e) => {
          if (phase === 'playing' && !auto) {
            ret.current = toNominal(e)
            scanning.current = true
          }
        }}
        onPointerDown={(e) => {
          if (phase === 'playing' && !auto) {
            ret.current = toNominal(e)
            scanning.current = true
          }
        }}
        onPointerLeave={() => {
          if (!auto) scanning.current = false
        }}
      >
        <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>

      {phase === 'loading' && <div className="absolute inset-0 flex items-center justify-center text-slate-400">Mapping the south pole…</div>}

      {phase === 'playing' && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4">
            <div className="w-64 rounded-2xl border border-white/10 bg-slate-950/60 p-3 backdrop-blur">
              <div className="flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                <span>Battery</span>
                <span className="font-mono text-sm tabular-nums" style={{ color: batteryColor }}>
                  {secondsLeft} s
                </span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${batteryShare * 100}%`, background: batteryColor, boxShadow: `0 0 10px ${batteryColor}` }} />
              </div>
            </div>
            <div className="w-80 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-center backdrop-blur">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">Ice mapped</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-white">
                {Math.round(hud.mapped)}%<span className="ml-2 text-base font-normal text-slate-400">of {setup.target}% needed</span>
              </div>
              <div className="relative mt-2 h-2.5 rounded-full bg-white/10">
                <div className="h-full rounded-full bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.8)] transition-[width] duration-100" style={{ width: `${Math.min(100, hud.mapped)}%` }} />
                <div className="absolute -top-1 h-4.5 w-0.5 bg-white" style={{ left: `${setup.target}%`, height: 18 }} />
              </div>
            </div>
            <div className="pointer-events-auto flex flex-col items-end gap-2">
              <button onClick={onExit} className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300 backdrop-blur hover:text-white">
                Exit
              </button>
              <div className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-right text-xs backdrop-blur">
                {setup.scanners.map((s) => (
                  <div key={s.id} className="font-semibold text-slate-200">
                    {s.name}
                  </div>
                ))}
                {auto && <div className="mt-1 text-[10px] uppercase tracking-widest text-amber-300">Autopilot</div>}
              </div>
            </div>
          </div>
          {paused && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
              <div className="rounded-2xl border border-white/10 bg-slate-950/85 px-8 py-6 text-center">
                <div className="text-2xl font-semibold text-white">Paused</div>
                <div className="mt-1 text-sm text-slate-400">The battery is holding. Press P or SPACE to carry on.</div>
                <button onClick={() => setPaused(false)} className="mt-4 rounded-xl bg-sky-500 px-5 py-2 font-semibold text-slate-950 hover:brightness-110">Resume</button>
              </div>
            </div>
          )}
          {hint && !auto && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
              <div className="rounded-full border border-white/10 bg-slate-950/70 px-5 py-2 text-sm text-slate-100 backdrop-blur">Move the scanner over a crater to map it: no clicking. P or SPACE pauses</div>
            </div>
          )}
        </>
      )}

      {phase === 'briefing' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-950/85 p-7 shadow-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">Lunar south pole</div>
            <h1 className="mt-1 font-display text-4xl font-bold text-white">Map the ice</h1>
            <p className="mt-3 text-slate-300">
              The craft flies on and the craters slip away. Scan each one before it is gone, and map <b className="text-white">{setup.target}%</b> of the ice before the battery dies.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/5 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Battery</div>
                <div className="mt-1 font-mono text-3xl font-bold text-white">{setup.duration} s</div>
                <div className="text-xs text-slate-400">
                  {Math.round(setup.batteryWh)} Wh at {setup.watts} W
                </div>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Scanner</div>
                {setup.scanners.length === 0 && <div className="mt-1 text-sm text-red-300">No instrument on board</div>}
                {setup.scanners.map((s) => (
                  <div key={s.id} className="mt-1">
                    <div className="text-sm font-semibold text-white">{s.name}</div>
                    <div className="text-xs text-slate-400">{s.blurb}</div>
                  </div>
                ))}
              </div>
            </div>
            {(hopeless || noIce) && (
              <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
                {noIce
                  ? 'This craft carries nothing that can read ice.'
                  : `With this instrument ${Math.round(unreachable)}% of the ice is out of reach: it cannot see into permanent shadow, so ${setup.target}% is not possible. You can still fly it and see why.`}
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => begin(false)} className={`${btn} bg-gradient-to-r from-sky-400 to-blue-600 text-white shadow-[0_0_28px_rgba(56,189,248,0.35)]`}>
                Start the pass
              </button>
              <button onClick={() => begin(true)} className={`${btn} border border-white/15 bg-white/5 text-slate-200`}>
                Watch the autopilot
              </button>
              <button onClick={onExit} className="px-3 py-3 text-sm text-slate-400 hover:text-slate-200">
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'result' && result && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-950/90 p-7 shadow-2xl">
            <div className={`text-center text-xs font-semibold uppercase tracking-[0.35em] ${result.win ? 'text-sky-300' : 'text-amber-300'}`}>{result.win ? 'Target reached' : 'Pass over'}</div>
            <h2 className="mt-1 text-center font-display text-4xl font-bold text-white">{result.win ? 'Ice mapped!' : 'Not enough ice mapped'}</h2>
            <div className="mt-3">
              <Stars n={result.stars} />
            </div>
            <div className="mt-3 text-center font-mono text-5xl font-bold text-white">
              {Math.round(result.mapped)}%<span className="ml-2 text-lg font-normal text-slate-400">of {result.target}% needed</span>
            </div>
            <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {result.perArea.map((a) => (
                <li key={a.name} className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="w-28 truncate">{a.name}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <span className="block h-full rounded-full bg-sky-300" style={{ width: `${a.pct}%` }} />
                  </span>
                  <span className="w-9 text-right font-mono tabular-nums text-slate-400">{a.blocked ? '🔒' : `${a.pct}%`}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-2xl bg-white/5 p-3 text-sm leading-relaxed text-slate-200">{result.insight}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button onClick={() => begin(false)} className={`${btn} bg-gradient-to-r from-sky-400 to-blue-600 text-white`}>
                Fly it again
              </button>
              <button onClick={() => begin(true)} className={`${btn} border border-white/15 bg-white/5 text-slate-200`}>
                Watch the autopilot
              </button>
              <button onClick={onExit} className="px-3 py-3 text-sm text-slate-400 hover:text-slate-200">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
