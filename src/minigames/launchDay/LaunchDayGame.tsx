import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { audio } from '../../assets/audio'
import type { Design } from '../../sim/types'
import {
  EVENTS,
  TARGET_V,
  currentEvent,
  eventTime,
  newLaunch,
  press,
  release,
  setupFromDesign,
  simSpeed,
  speed,
  step,
  summarize,
  type Feedback,
  type LaunchResult,
  type LaunchState,
} from './logic'

/**
 * Launch Day: the screen. The rules are in logic.ts; this file only draws them and passes the
 * player's one button in.
 *
 * The rocket fills the top of the screen with the sky changing around it, and the bottom is a
 * timeline: markers slide right to left into a needle, and you tap as each arrives. Everything
 * drawn here is read from the LaunchState, so the picture is always the flight the logic flew.
 */

const SKY_GROUND = '#4f6a3e'
/** Height the rocket is drawn at, as a share of the view (capped, so it stays a sprite on tall screens) */
const ROCKET_SHARE = 0.5
/** Pixels on the timeline per second of flight */
const TIMELINE_PX_PER_S = 58

const lerp = (t: number, a: number, b: number, va: number, vb: number) =>
  va + ((Math.min(Math.max(t, a), b) - a) / (b - a)) * (vb - va)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function play(id: Parameters<typeof audio.play>[0]) {
  try {
    audio.play(id)
  } catch {
    // sound is a nicety: a locked audio context must never stop the game
  }
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  g: number
  life: number
  color: string
}

const fmtAlt = (h: number) =>
  h < 1000 ? `${Math.round(h)} m` : `${(h / 1e3).toFixed(h < 10e3 ? 2 : h < 100e3 ? 1 : 0)} km`
const fmtVel = (v: number) => (v < 1000 ? `${Math.round(v * 3.6)} km/h` : `${(v / 1e3).toFixed(2)} km/s`)

/** The sky, the ground falling away, the rocket and everything it has shed */
function drawSky(
  canvas: HTMLCanvasElement,
  s: LaunchState,
  particles: Particle[],
  stars: { x: number; y: number; s: number }[],
  clouds: { x: number; h: number; w: number; d: number }[],
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width
  const H = canvas.height
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const hkm = s.h / 1e3

  // Blue at the pad, black by about 70 km
  const k = clamp(hkm / 70, 0, 1)
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, `rgb(${lerp(k, 0, 1, 70, 2) | 0},${lerp(k, 0, 1, 140, 4) | 0},${lerp(k, 0, 1, 230, 12) | 0})`)
  g.addColorStop(1, `rgb(${lerp(k, 0, 1, 160, 10) | 0},${lerp(k, 0, 1, 200, 20) | 0},${lerp(k, 0, 1, 240, 50) | 0})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  ctx.globalAlpha = clamp((hkm - 25) / 40, 0, 1)
  ctx.fillStyle = '#fff'
  for (const st of stars) ctx.fillRect(st.x * W, st.y * H, st.s * dpr, st.s * dpr)
  ctx.globalAlpha = 1

  ctx.save()
  if (s.shake > 0.01) {
    ctx.translate((Math.random() - 0.5) * s.shake * 14 * dpr, (Math.random() - 0.5) * s.shake * 14 * dpr)
  }
  const rx = W / 2
  const ry = H * 0.56
  const L = Math.min(H * ROCKET_SHARE, 320 * dpr)

  // The ground: about 1 px per 2 m of rocket, so the pad shrinks away as the craft climbs
  const gScale = L / 70 / 2.4
  const groundY = ry + L * 0.5 + s.h * gScale
  if (groundY < H + 50 * dpr) {
    ctx.fillStyle = SKY_GROUND
    ctx.fillRect(0, groundY, W, H)
    ctx.fillStyle = '#8a8f99'
    ctx.fillRect(rx - L * 0.5, groundY - 6 * dpr, L, 8 * dpr)
    ctx.fillStyle = '#b8402f'
    ctx.fillRect(rx + L * 0.16, groundY - L * 1.05, L * 0.06, L * 1.05)
    for (let i = 1; i <= 8; i++) ctx.fillRect(rx + L * 0.1, groundY - L * 0.13 * i, L * 0.12, 3 * dpr)
    if (s.engineOn && s.h < 400) {
      ctx.fillStyle = 'rgba(235,235,240,0.85)'
      const sp = clamp((s.t + 3) / 4, 0, 1)
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath()
        ctx.ellipse(rx + i * L * 0.16 * (1 + sp), groundY - 10 * dpr + Math.abs(i) * 4 * dpr, L * 0.16 * sp, L * 0.07 * sp, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  if (hkm < 14) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    for (const c of clouds) {
      const cs = 0.09 * dpr * c.d
      const cy = ry + (s.h - c.h) * cs
      const cx = rx + (c.x * W - s.x * cs * 0.3)
      const cw = c.w * W * c.d
      if (cy > -60 * dpr && cy < H + 60 * dpr) {
        ctx.beginPath()
        ctx.ellipse(cx, cy, cw, cw * 0.3, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // The Earth's limb rising from below, once high enough to see the curve
  if (hkm > 60) {
    const a = clamp((hkm - 60) / 200, 0, 1)
    const rad = W * 1.4
    const top = H - a * H * 0.28
    const gl = ctx.createRadialGradient(rx, top + rad, rad * 0.92, rx, top + rad, rad * 1.04)
    gl.addColorStop(0, '#1f4a8a')
    gl.addColorStop(0.75, '#3b7fd1')
    gl.addColorStop(0.92, 'rgba(120,190,255,0.5)')
    gl.addColorStop(1, 'rgba(120,190,255,0)')
    ctx.fillStyle = gl
    ctx.beginPath()
    ctx.arc(rx, top + rad, rad * 1.04, 0, Math.PI * 2)
    ctx.fill()
  }

  const v = speed(s)
  if (v > 300 && hkm < 90) {
    ctx.strokeStyle = `rgba(255,255,255,${clamp((v - 300) / 2000, 0, 0.35)})`
    ctx.lineWidth = 1.5 * dpr
    for (let i = 0; i < 14; i++) {
      const sx = (i * 97 + ((s.t * 300) % 50)) % W
      const sy = (i * 173 + s.t * v * 0.3) % H
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx, sy + 30 * dpr * clamp(v / 2000, 0.2, 1))
      ctx.stroke()
    }
  }

  const dScale = L / 70
  for (const d of s.debris) {
    drawDebris(ctx, d, rx + (d.x - s.x) * dScale * 0.5, ry + (s.h - d.h) * dScale * 0.5, L, W, H)
  }
  drawRocket(ctx, s, rx, ry, L)
  for (const q of particles) {
    ctx.globalAlpha = clamp(q.life, 0, 1)
    ctx.fillStyle = q.color
    ctx.fillRect(rx + q.x * L, ry + q.y * L, 5 * dpr, 5 * dpr)
  }
  ctx.globalAlpha = 1
  ctx.restore()

  drawLadder(ctx, s, H, dpr)
}

function drawRocket(ctx: CanvasRenderingContext2D, s: LaunchState, x: number, y: number, L: number) {
  const w = L * 0.055
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((s.pitch * Math.PI) / 180)

  if (s.flame > 0.02) {
    // The plume fans out as the air thins: the same engine looks very different up high
    const spreadFactor = 1 + 2.2 * (1 - s.rho / 1.225)
    const base = s.staged ? L * 0.18 : L * 0.5
    const len = L * (0.45 + 0.45 * s.flame) * (0.92 + Math.random() * 0.16)
    const grd = ctx.createLinearGradient(0, base, 0, base + len)
    grd.addColorStop(0, 'rgba(255,255,235,1)')
    grd.addColorStop(0.25, 'rgba(255,190,70,0.9)')
    grd.addColorStop(1, 'rgba(255,90,20,0)')
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.moveTo(-w * 0.9, base)
    ctx.lineTo(w * 0.9, base)
    ctx.lineTo(w * 1.8 * spreadFactor, base + len)
    ctx.lineTo(-w * 1.8 * spreadFactor, base + len)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.beginPath()
    ctx.moveTo(-w * 0.5, base)
    ctx.lineTo(w * 0.5, base)
    ctx.lineTo(0, base + len * 0.4)
    ctx.fill()
  }

  if (!s.staged) {
    ctx.fillStyle = '#eceef3'
    ctx.fillRect(-w, -L * 0.05, w * 2, L * 0.55)
    ctx.fillStyle = '#c9ced9'
    ctx.fillRect(-w, L * 0.1, w * 2, L * 0.02)
    ctx.fillRect(-w, L * 0.3, w * 2, L * 0.02)
    ctx.fillStyle = '#2b2f3a'
    ctx.fillRect(-w * 1.15, L * 0.42, w * 2.3, L * 0.08)
    ctx.fillStyle = '#5a6172'
    for (const fx of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(fx * w, L * 0.33)
      ctx.lineTo(fx * w * 2.6, L * 0.5)
      ctx.lineTo(fx * w, L * 0.5)
      ctx.fill()
    }
  }
  ctx.fillStyle = '#dde1ea'
  ctx.fillRect(-w, -L * 0.28, w * 2, L * 0.24)
  ctx.fillStyle = '#ffb454'
  ctx.fillRect(-w, -L * 0.06, w * 2, L * 0.015)
  if (s.fairing) {
    ctx.fillStyle = '#f6f6fa'
    ctx.beginPath()
    ctx.moveTo(-w, -L * 0.28)
    ctx.quadraticCurveTo(-w, -L * 0.45, 0, -L * 0.5)
    ctx.quadraticCurveTo(w, -L * 0.45, w, -L * 0.28)
    ctx.fill()
  } else {
    // The CubeSat, riding bare on top once the nose cone is gone
    ctx.fillStyle = '#3f8ae0'
    ctx.fillRect(-w * 0.45, -L * 0.37, w * 0.9, L * 0.09)
    ctx.fillStyle = '#ffd36b'
    ctx.fillRect(-w * 1.8, -L * 0.34, w * 3.6, L * 0.02)
  }
  if (s.staged) {
    ctx.fillStyle = '#2b2f3a'
    ctx.fillRect(-w * 0.9, -L * 0.04, w * 1.8, L * 0.2)
  }
  ctx.restore()
}

function drawDebris(
  ctx: CanvasRenderingContext2D,
  d: LaunchState['debris'][number],
  x: number,
  y: number,
  L: number,
  W: number,
  H: number,
) {
  // Off-screen pieces are skipped: the stage keeps falling for the whole flight
  if (x < -L || x > W + L || y < -L || y > H + L) return
  const w = L * 0.055
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(d.rot)
  if (d.kind === 'stage') {
    ctx.fillStyle = '#cfd3dc'
    ctx.fillRect(-w, -L * 0.3, w * 2, L * 0.55)
    ctx.fillStyle = '#2b2f3a'
    ctx.fillRect(-w * 1.15, L * 0.17, w * 2.3, L * 0.08)
  } else if (d.kind === 'fairing') {
    ctx.fillStyle = '#f6f6fa'
    ctx.beginPath()
    ctx.moveTo(0, -L * 0.22)
    ctx.quadraticCurveTo((d.side ?? 1) * w, -L * 0.15, (d.side ?? 1) * w, 0)
    ctx.lineTo(0, 0)
    ctx.fill()
  } else {
    ctx.fillStyle = '#ffd36b'
    ctx.fillRect(-w * 1.6, -w * 0.3, w * 3.2, w * 0.6)
    ctx.fillStyle = '#3f8ae0'
    ctx.fillRect(-w * 0.45, -w * 0.9, w * 0.9, w * 1.8)
  }
  ctx.restore()
}

/** The climb as a ladder up the left edge: where you are between the pad and orbit */
function drawLadder(ctx: CanvasRenderingContext2D, s: LaunchState, H: number, dpr: number) {
  const marks: [number, string][] = [
    [0, 'PAD'],
    [2, 'clouds'],
    [11, 'MAX Q'],
    [65, 'staging'],
    [110, 'SPACE · fairing'],
    [200, 'ORBIT'],
  ]
  // A log scale, so the pad and orbit both have room
  const pos = (km: number) => Math.log10(1 + km) / Math.log10(201)
  const x = 28 * dpr
  const top = H * 0.12
  const bot = H * 0.9
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 2 * dpr
  ctx.beginPath()
  ctx.moveTo(x, top)
  ctx.lineTo(x, bot)
  ctx.stroke()
  ctx.font = `700 ${11 * dpr}px system-ui, sans-serif`
  ctx.textAlign = 'left'
  for (const [km, label] of marks) {
    const y = bot - pos(km) * (bot - top)
    ctx.fillStyle = s.h / 1e3 >= km ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)'
    ctx.fillRect(x - 5 * dpr, y - 1 * dpr, 10 * dpr, 2 * dpr)
    ctx.fillText(label, x + 10 * dpr, y + 4 * dpr)
  }
  const y = bot - pos(s.h / 1e3) * (bot - top)
  ctx.fillStyle = '#ffb454'
  ctx.beginPath()
  ctx.moveTo(x, y - 7 * dpr)
  ctx.lineTo(x + 6 * dpr, y + 5 * dpr)
  ctx.lineTo(x - 6 * dpr, y + 5 * dpr)
  ctx.fill()
}

/** The timeline: every mark still to come, sliding right to left into the needle */
function drawTimeline(canvas: HTMLCanvasElement, s: LaunchState) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width
  const H = canvas.height
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const cx = W * 0.5
  const PX = TIMELINE_PX_PER_S * dpr

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#0d1120'
  ctx.fillRect(0, H * 0.35, W, H * 0.3)
  // What counts as good and perfect, drawn where it happens
  ctx.fillStyle = 'rgba(255,180,84,0.12)'
  ctx.fillRect(cx - 1.4 * PX, H * 0.3, 2.8 * PX, H * 0.4)
  ctx.fillStyle = 'rgba(95,211,138,0.22)'
  ctx.fillRect(cx - 0.55 * PX, H * 0.3, 1.1 * PX, H * 0.4)

  for (let i = s.idx; i < EVENTS.length; i++) {
    const ev = EVENTS[i]
    const tt = eventTime(s, ev)
    if (Array.isArray(tt)) {
      const x0 = cx + (tt[0] - s.t) * PX
      const x1 = cx + (tt[1] - s.t) * PX
      if (x1 < 0 || x0 > W) continue
      const holdingNow = i === s.idx && s.holding && s.t >= tt[0] && s.t <= tt[1]
      ctx.fillStyle = holdingNow ? '#5fd38a' : '#ff6b6b'
      ctx.fillRect(x0, H * 0.38, x1 - x0, H * 0.24)
      ctx.fillStyle = '#fff'
      ctx.font = `800 ${12 * dpr}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('HOLD · MAX Q', clamp((x0 + x1) / 2, 60 * dpr, W - 60 * dpr), H * 0.2)
    } else {
      const x = cx + (tt - s.t) * PX
      if (x < -40 * dpr || x > W + 40 * dpr) continue
      const near = i === s.idx
      ctx.fillStyle = near ? '#ffb454' : '#6fb3ff'
      ctx.beginPath()
      ctx.moveTo(x, H * 0.3)
      ctx.lineTo(x + 8 * dpr, H * 0.5)
      ctx.lineTo(x, H * 0.7)
      ctx.lineTo(x - 8 * dpr, H * 0.5)
      ctx.fill()
      ctx.fillStyle = near ? '#fff' : '#93a0b8'
      ctx.font = `800 ${12 * dpr}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(ev.label, x, H * 0.2)
      if (near && tt - s.t > 1.5 && tt - s.t < 30) {
        ctx.fillStyle = '#93a0b8'
        ctx.font = `${11 * dpr}px system-ui, sans-serif`
        ctx.fillText(`${(tt - s.t).toFixed(0)}s`, x, H * 0.9)
      }
    }
  }

  ctx.fillStyle = '#fff'
  ctx.fillRect(cx - 1.5 * dpr, H * 0.15, 3 * dpr, H * 0.7)
  ctx.beginPath()
  ctx.moveTo(cx - 7 * dpr, H * 0.08)
  ctx.lineTo(cx + 7 * dpr, H * 0.08)
  ctx.lineTo(cx, H * 0.2)
  ctx.fill()

  const warp = simSpeed(s)
  if (warp > 2.5) {
    ctx.fillStyle = '#6fb3ff'
    ctx.font = `800 ${11 * dpr}px system-ui, sans-serif`
    ctx.textAlign = 'right'
    ctx.fillText(`▶▶ ${warp.toFixed(0)}× time`, W - 10 * dpr, H * 0.92)
  }
}

const GRADE_TEXT = { perfect: 'text-go', good: 'text-kapton', off: 'text-nogo', early: 'text-nogo' } as const
const GRADE_CHIP = { perfect: 'bg-go/20 text-go', good: 'bg-kapton/20 text-kapton', off: 'bg-nogo/20 text-nogo' } as const

export interface LaunchDayDemo {
  /** Skip the briefing */
  start?: boolean
  /** Let the autopilot fly it */
  auto?: boolean
}

/**
 * The launch, played. `onDone` is called with the result once the player leaves the result slip;
 * the caller decides what happens next (in the mission, it opens the space view).
 */
export function LaunchDayGame({
  design,
  demo,
  onDone,
}: {
  design?: Design
  demo?: LaunchDayDemo
  onDone: (result: LaunchResult) => void
}) {
  const setup = useMemo(() => setupFromDesign(design ?? null), [design])
  const sky = useRef<HTMLCanvasElement>(null)
  const timeline = useRef<HTMLCanvasElement>(null)
  const state = useRef<LaunchState>(newLaunch(setup))
  const particles = useRef<Particle[]>([])
  const [phase, setPhase] = useState<'briefing' | 'flying' | 'result'>(demo?.start ? 'flying' : 'briefing')
  const [result, setResult] = useState<LaunchResult | null>(null)

  // Redrawn every frame from the state; React only holds what the player reads
  const [hud, setHud] = useState({ alt: 0, vel: 0, score: 0, combo: 0, verb: '—', live: false, hold: false, holding: false })
  const [callout, setCallout] = useState<{ a: string; b: string }>({ a: 'Go for launch', b: 'Counting down' })
  const [pop, setPop] = useState<{ big: string; small: string; grade: keyof typeof GRADE_TEXT; key: number } | null>(null)
  const [fact, setFact] = useState<{ title: string; text: string; key: number } | null>(null)

  const stars = useMemo(
    () => Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 1.6 + 0.3 })),
    [],
  )
  const clouds = useMemo(
    () =>
      Array.from({ length: 40 }, () => ({
        x: Math.random() * 3 - 1.5,
        h: 800 + Math.random() * 5000,
        w: 0.035 + Math.random() * 0.06,
        d: 0.6 + Math.random() * 0.6,
      })),
    [],
  )

  const burst = useCallback((oy: number, n: number, color: string | null) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 0.2 + Math.random() * 0.6
      particles.current.push({
        x: 0,
        y: oy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.2,
        g: 0.5,
        life: 1 + Math.random(),
        color: color ?? `hsl(${Math.random() * 360},90%,65%)`,
      })
    }
  }, [])

  /** Everything that happens when an event resolves: the pop, the sound, the fact, the next call */
  const applyFeedback = useCallback(
    (fb: Feedback | null) => {
      if (!fb) return
      setPop({ big: fb.big, small: fb.small, grade: fb.grade, key: Date.now() })
      if (fb.grade === 'perfect') play('sfx.go')
      else if (fb.grade === 'good') play('sfx.turn')
      else play('sfx.error')
      if (!fb.id) return

      const ev = EVENTS.find((e) => e.id === fb.id)!
      setFact({ title: ev.title, text: ev.short, key: Date.now() })
      const s = state.current
      switch (fb.id) {
        case 'ignite':
          play('sfx.ignition')
          setCallout({ a: 'Ignition!', b: 'Engines coming up to full thrust' })
          break
        case 'pitch':
          setCallout({ a: 'Pitch program started', b: 'Tipping over toward orbit' })
          break
        case 'maxq':
          setCallout({ a: 'Max Q passed', b: 'Throttle back up to 100%' })
          break
        case 'stage':
          play('sfx.burn')
          burst(0.28, 18, '#ffd36b')
          setCallout({ a: 'Stage separation', b: 'The empty first stage falls away' })
          break
        case 'fairing':
          play('sfx.whoosh')
          burst(-0.3, 10, '#ffffff')
          setCallout({ a: 'Fairing away', b: 'The spacecraft sees space for the first time' })
          break
        case 'cutoff':
          play('sfx.capture')
          setCallout({
            a: 'SECO',
            b: s.orbit ? `Orbit ${s.orbit.perigeeKm.toFixed(0)} × ${s.orbit.apogeeKm.toFixed(0)} km` : 'Engine off',
          })
          break
        case 'deploy':
          play('sfx.reveal')
          burst(-0.35, 60, null)
          setCallout({ a: 'CubeSat deployed!', b: 'Welcome to orbit' })
          break
      }
    },
    [burst],
  )

  const doPress = useCallback(() => {
    if (phase !== 'flying') return
    applyFeedback(press(state.current))
  }, [phase, applyFeedback])

  const doRelease = useCallback(() => {
    release(state.current)
  }, [])

  // Keep the canvases the size of their boxes
  useEffect(() => {
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      for (const ref of [sky, timeline]) {
        const c = ref.current
        if (!c) continue
        const r = c.getBoundingClientRect()
        c.width = Math.max(1, Math.round(r.width * dpr))
        c.height = Math.max(1, Math.round(r.height * dpr))
      }
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [phase])

  // Space is the button; it also moves past the briefing and the result
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      e.preventDefault()
      if (phase === 'briefing') setPhase('flying')
      else if (phase === 'flying') doPress()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') doRelease()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [phase, doPress, doRelease])

  // The loop: step the logic at a fixed rate, then draw whatever it says
  useEffect(() => {
    if (phase !== 'flying') return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const DT = 1 / 120

    const frame = (now: number) => {
      const s = state.current
      const real = Math.min(0.1, (now - last) / 1000)
      last = now
      acc += real * simSpeed(s)
      while (acc >= DT) {
        if (demo?.auto) {
          const ev = currentEvent(s)
          if (ev) {
            const tt = eventTime(s, ev)
            if (Array.isArray(tt)) {
              const inBand = s.t >= tt[0] && s.t <= tt[1]
              if (inBand && !s.holding) press(s)
              if (!inBand && s.holding) release(s)
            } else if (s.t >= tt) applyFeedback(press(s))
          }
        }
        applyFeedback(step(s, DT))
        acc -= DT
      }

      for (const q of particles.current) {
        q.x += q.vx * real
        q.y += q.vy * real
        q.vy += q.g * real
        q.life -= real
      }
      particles.current = particles.current.filter((q) => q.life > 0)

      if (sky.current) drawSky(sky.current, s, particles.current, stars, clouds)
      if (timeline.current) drawTimeline(timeline.current, s)

      const ev = currentEvent(s)
      setHud({
        alt: s.h,
        vel: speed(s),
        score: s.score,
        combo: s.combo,
        verb: ev ? ev.verb : s.deployed ? '✓' : '—',
        live: !!ev,
        hold: ev?.kind === 'hold',
        holding: s.holding,
      })

      if (!s.running) {
        setResult(summarize(s))
        setPhase('result')
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [phase, demo?.auto, applyFeedback, stars, clouds])

  // The flight director announces each event a moment after the last one lands
  useEffect(() => {
    if (phase !== 'flying') return
    const id = window.setInterval(() => {
      const ev = currentEvent(state.current)
      if (ev) setCallout((c) => (c.a === ev.call[0] ? c : { a: ev.call[0], b: ev.call[1] }))
    }, 1800)
    return () => window.clearInterval(id)
  }, [phase])

  // The fact banner clears itself so it never covers the rocket for long
  useEffect(() => {
    if (!fact) return
    const id = window.setTimeout(() => setFact(null), 7000)
    return () => window.clearTimeout(id)
  }, [fact])
  useEffect(() => {
    if (!pop) return
    const id = window.setTimeout(() => setPop(null), 1100)
    return () => window.clearTimeout(id)
  }, [pop])

  if (phase === 'briefing') {
    return (
      <Overlay>
        <div className="fp-label text-kapton">Launch day · {setup.rideName}</div>
        <h2 className="mt-1 fp-display text-2xl text-paper">Fly the ride to orbit</h2>
        <p className="mt-3 text-sm leading-relaxed text-paper-dim">
          Your CubeSat is bolted inside the fairing. The rocket flies itself, but <b className="text-paper">seven moments</b>{' '}
          need a hand. Markers slide along the timeline toward the needle:
        </p>
        <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm text-paper-dim">
          <span className="inline-block h-2.5 w-3.5 rounded-full bg-go" />
          <span>
            <b className="text-paper">Tap</b> when a marker reaches the needle. Closer is worth more.
          </span>
          <span className="inline-block h-2.5 w-12 rounded-full bg-go" />
          <span>
            <b className="text-paper">Hold</b> while a band passes under the needle.
          </span>
        </div>
        <p className="mt-3 text-xs text-paper-faint">
          Press <kbd className="rounded border border-rule bg-ink-1 px-1.5 py-0.5">space</kbd> or tap the big button. Chain
          clean hits for a combo. Nothing you do can lose the CubeSat.
        </p>
        <button type="button" onClick={() => setPhase('flying')} className="fp-btn-primary mt-5 w-full justify-center py-3">
          Start countdown ▸
        </button>
      </Overlay>
    )
  }

  if (phase === 'result' && result) {
    return (
      <Overlay>
        <div className="fp-label text-kapton">Flight complete</div>
        <div className="mt-1 text-3xl tracking-[0.3em] text-kapton" aria-label={`${result.stars} of 3 stars`}>
          {'★'.repeat(result.stars)}
          <span className="text-rule-strong">{'★'.repeat(3 - result.stars)}</span>
        </div>
        <h2 className="mt-1 fp-display text-2xl text-paper">{result.score.toLocaleString()} points</h2>
        <p className="mt-2 text-sm leading-relaxed text-paper-dim">{result.verdict}</p>
        <table className="mt-3 w-full border-collapse text-xs">
          <tbody>
            {EVENTS.map((e) => (
              <tr key={e.id} className="border-b border-rule">
                <td className="py-1 pr-2 text-paper">{e.title}</td>
                <td className="py-1 pr-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 fp-label text-[0.6rem] ${GRADE_CHIP[result.grades[e.id] ?? 'off']}`}>
                    {(result.grades[e.id] ?? 'off').toUpperCase()}
                  </span>
                </td>
                <td className="py-1 text-paper-dim">{result.notes[e.id] ?? ''}</td>
              </tr>
            ))}
            <tr className="border-b border-rule">
              <td className="py-1 pr-2 text-paper">Orbit</td>
              <td className="py-1 text-paper-dim" colSpan={2}>
                {result.orbit.perigeeKm.toFixed(0)} × {result.orbit.apogeeKm.toFixed(0)} km {result.stable ? '✅' : '⚠️'}
              </td>
            </tr>
            <tr>
              <td className="py-1 pr-2 text-paper">Best combo</td>
              <td className="py-1 text-paper-dim" colSpan={2}>
                ×{result.bestCombo} · fuel left for the Moon trip: {result.fuelLeftPct.toFixed(0)}%
              </td>
            </tr>
          </tbody>
        </table>
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer fp-label text-ice">📘 Launch logbook: what you just did, for real</summary>
          {EVENTS.map((e) => (
            <p key={e.id} className="mt-2 leading-relaxed text-paper-dim">
              <b className="text-paper">{e.title}.</b> {e.fact}
            </p>
          ))}
        </details>
        <button type="button" onClick={() => onDone(result)} className="fp-btn-primary mt-5 w-full justify-center py-3">
          Watch it fly to the Moon ▸
        </button>
      </Overlay>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex select-none flex-col bg-[#04060b] text-paper" style={{ touchAction: 'none' }}>
      <div
        className="relative min-h-0 flex-1"
        onPointerDown={(e) => {
          e.preventDefault()
          doPress()
        }}
        onPointerUp={doRelease}
        onPointerLeave={doRelease}
        onPointerCancel={doRelease}
      >
        <canvas ref={sky} className="block h-full w-full" />
        <div className="pointer-events-none absolute right-3 top-3 text-right">
          <div className="fp-data text-2xl font-bold tabular-nums text-paper drop-shadow">{hud.score.toLocaleString()}</div>
          <div className="fp-label h-4 text-[0.65rem] text-kapton">{hud.combo > 1 ? `×${hud.combo} COMBO` : ''}</div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-4 mx-auto w-[min(92%,40rem)] text-center">
          <div className="fp-display text-2xl text-paper drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] sm:text-3xl">{callout.a}</div>
          <div className="mt-0.5 text-sm text-paper-dim drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">{callout.b}</div>
        </div>
        {pop && (
          <div
            key={`pop-${pop.key}`}
            className={`pointer-events-none absolute inset-x-0 top-[34%] text-center fp-display text-4xl tracking-widest drop-shadow-[0_3px_12px_rgba(0,0,0,0.9)] ${GRADE_TEXT[pop.grade]}`}
          >
            {pop.big}
            <div className="mt-1 fp-data text-base tracking-normal">{pop.small}</div>
          </div>
        )}
        {fact && (
          <div
            key={`fact-${fact.key}`}
            className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-[min(92%,38rem)] border border-rule border-l-[3px] border-l-ice bg-ink-1/95 px-3 py-2 text-xs leading-relaxed text-paper-dim"
          >
            <b className="text-ice">{fact.title}:</b> {fact.text}
          </div>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-2 border-t-2 border-rule-strong bg-ink-1 px-3 pb-3 pt-2">
        <div className="col-span-3 h-[70px] overflow-hidden rounded-lg border border-rule bg-[#070a12]">
          <canvas ref={timeline} className="block h-full w-full" />
        </div>
        <div>
          <div className="fp-label text-[0.6rem]">Altitude</div>
          <div className="fp-data text-xl font-bold tabular-nums text-go sm:text-2xl">{fmtAlt(hud.alt)}</div>
        </div>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault()
            doPress()
          }}
          onPointerUp={doRelease}
          onPointerLeave={doRelease}
          onPointerCancel={doRelease}
          disabled={!hud.live}
          aria-label={hud.live ? `${hud.verb} now` : 'Nothing to do yet'}
          className={`h-[72px] w-[min(16rem,40vw)] rounded-2xl border-[3px] fp-display text-lg tracking-widest transition-transform ${
            !hud.live
              ? 'border-rule bg-ink-2 text-paper-faint'
              : hud.hold
                ? `border-go bg-go/20 text-paper ${hud.holding ? 'scale-95' : ''}`
                : 'border-kapton bg-kapton/20 text-paper active:scale-95'
          }`}
        >
          {hud.verb}
        </button>
        <div className="text-right">
          <div className="fp-label text-[0.6rem]">Speed</div>
          <div
            className={`fp-data text-xl font-bold tabular-nums sm:text-2xl ${
              hud.live && hud.verb === 'CUTOFF'
                ? Math.abs(hud.vel - TARGET_V) < 60
                  ? 'text-go'
                  : hud.vel > TARGET_V
                    ? 'text-nogo'
                    : 'text-kapton'
                : 'text-go'
            }`}
          >
            {fmtVel(hud.vel)}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The briefing and the result slip share one card over the dark */
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex overflow-y-auto bg-ink-0/95 p-5">
      <div className="fp-sheet m-auto w-[min(100%,34rem)] p-6" data-tone="raised">
        {children}
      </div>
    </div>
  )
}
