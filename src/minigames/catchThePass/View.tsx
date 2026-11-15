import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { MinigameProps } from '../contract'
import { groundStations, type GroundStation } from '../../data/ground'
import { audio } from '../../assets/audio'
import { sayRoom } from '../../assets/ihVoice'
import {
  HOURS, PASS_S, buildResult, clamp, clampRing, coinsPerHour, countHours, dishTraits, linkKbpsFor, linkQuality,
  maxHours, paintHour, passPosition, passVelocity, pointingError, project, reelFill, reelGain, ringWithHours,
  stepDish, type PassScore, type Sky,
} from './logic'

const K = 0.1 // degrees of sky -> world units
const MODEL = (id: string) => `/assets/models/parts/${id}.glb`
const DISH_H: Record<string, number> = { 'ground-small': 1.5, 'ground-medium': 2.3, 'ground-dsn': 3.1 }
const PAD_X: Record<string, number> = { 'ground-small': -6, 'ground-medium': 0, 'ground-dsn': 6 }
const SHORT: Record<string, string> = { 'ground-small': '4 m', 'ground-medium': '21 m', 'ground-dsn': '34 m' }

type Phase = 'pick' | 'track' | 'result' | 'book'

function safePlay(id: Parameters<typeof audio.play>[0]) {
  try {
    audio.play(id)
  } catch {
    /* audio may be locked or missing: the game still plays */
  }
}
function safeSay(line: 'intro' | 'hint' | 'success') {
  try {
    sayRoom('ground-station', line)
  } catch {
    /* ignore */
  }
}

/** A dish model scaled to a height, standing on y = 0 */
function DishModel({ id, lean = 0 }: { id: string; lean?: number }) {
  const { scene } = useGLTF(MODEL(id))
  const obj = useMemo(() => {
    const c = scene.clone(true)
    const box = new THREE.Box3().setFromObject(c)
    const size = box.getSize(new THREE.Vector3())
    const s = DISH_H[id] / Math.max(size.y, 1e-3)
    c.scale.setScalar(s)
    const b2 = new THREE.Box3().setFromObject(c)
    c.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2)
    return c
  }, [scene, id])
  return (
    <group rotation={[0, 0, lean]}>
      <primitive object={obj} />
    </group>
  )
}

function Stars() {
  const geo = useMemo(() => {
    const n = 420
    const p = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const r = Math.sin(i * 12.9898) * 43758.5453
      const r2 = Math.sin(i * 78.233) * 12345.6789
      p[i * 3] = ((r - Math.floor(r)) * 2 - 1) * 14
      p[i * 3 + 1] = -0.4 + (r2 - Math.floor(r2)) * 12
      p[i * 3 + 2] = -5
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    return g
  }, [])
  return (
    <points geometry={geo}>
      <pointsMaterial color="#cfe0ff" size={0.05} sizeAttenuation transparent opacity={0.85} />
    </points>
  )
}

function Fit() {
  const { camera, size } = useThree()
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    cam.zoom = Math.min(size.width / 20, size.height / 12.4)
    cam.updateProjectionMatrix()
  }, [camera, size])
  return null
}

function CoinTower({ n, x }: { n: number; x: number }) {
  return (
    <group position={[x, 0, 0.6]}>
      {Array.from({ length: n }).map((_, i) => (
        <mesh key={i} position={[0, 0.06 + i * 0.1, 0]}>
          <cylinderGeometry args={[0.28, 0.28, 0.08, 20]} />
          <meshStandardMaterial color="#f2c14e" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
    </group>
  )
}

interface SceneProps {
  phase: Phase
  stationId: string
  focus: string
  onPick: (id: string) => void
  keys: React.MutableRefObject<Sky>
  runId: number
  onTick: (fill: number, q: number) => void
  onDone: (s: PassScore) => void
  kbps: number
}

function Scene({ phase, stationId, focus, onPick, keys, runId, onTick, onDone, kbps }: SceneProps) {
  const dishRef = useRef<THREE.Group>(null)
  const crossRef = useRef<THREE.Mesh>(null)
  const crossMat = useRef<THREE.MeshBasicMaterial>(null)
  const blipRef = useRef<THREE.Mesh>(null)
  const sim = useRef({ t: -1.5, dish: { x: 0, y: 30 } as Sky, acc: 0, qSum: 0, onT: 0, n: 0, done: false, lastServo: 0, lastReel: 0, lastTick: 0 })
  const aim = useRef<Sky | null>(null)
  const traits = dishTraits(stationId)
  const trail = useMemo(() => {
    const pts: number[] = []
    for (let i = 0; i <= 60; i++) {
      const p = passPosition((i / 60) * PASS_S)
      pts.push(p.x * K, p.y * K, -0.2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])

  useEffect(() => {
    sim.current = { t: -1.5, dish: { x: 0, y: 30 }, acc: 0, qSum: 0, onT: 0, n: 0, done: false, lastServo: 0, lastReel: 0, lastTick: 0 }
    aim.current = null
  }, [runId])

  useFrame((state, rawDt) => {
    const s = sim.current
    const dt = Math.min(rawDt, 0.5) // the pass runs on the clock, even on a slow machine
    const now = state.clock.elapsedTime
    if (phase === 'track' && !s.done) {
      s.t += dt
      const t = Math.max(0, s.t)
      const blip = passPosition(t)
      const before = s.dish
      const steps = Math.ceil(dt / 0.05)
      for (let i = 0; i < steps; i++) {
        const ti = Math.max(0, s.t - dt + ((i + 1) * dt) / steps)
        s.dish = stepDish(s.dish, { aim: aim.current, key: keys.current }, passPosition(ti), passVelocity(ti), traits, dt / steps)
      }
      const moved = pointingError(before, s.dish) / Math.max(dt, 1e-3)
      if (moved > 6 && now - s.lastServo > 1.1) {
        s.lastServo = now
        safePlay('sfx.ih-dish-servo')
      }
      if (s.t > 0) {
        const q = linkQuality(pointingError(s.dish, blip), traits.beamDeg)
        s.acc += reelGain(kbps, q, dt)
        s.qSum += q * dt
        if (q > 0) s.onT += dt
        s.n += dt
        if (q > 0.05 && now - s.lastReel > 2.2) {
          s.lastReel = now
          safePlay('sfx.ih-tape-reel-whir')
        }
        if (now - s.lastTick > 0.1) {
          s.lastTick = now
          onTick(reelFill(s.acc), q)
        }
        if (s.t >= PASS_S) {
          s.done = true
          onTick(reelFill(s.acc), 0)
          onDone({ onTarget: s.onT, accuracy: s.qSum / PASS_S })
        }
      }
    }
    const d = s.dish
    if (dishRef.current && phase !== 'pick') dishRef.current.rotation.z = clamp(-d.x / 90, -1, 1) * 0.7
    if (crossRef.current) {
      crossRef.current.position.set(d.x * K, d.y * K, 0)
      crossRef.current.visible = phase === 'track'
      crossRef.current.scale.setScalar(traits.beamDeg * K)
    }
    if (crossMat.current && phase === 'track') {
      const b = passPosition(Math.max(0, s.t))
      const q = linkQuality(pointingError(d, b), traits.beamDeg)
      crossMat.current.color.set(q > 0 ? '#7dffb2' : '#ff9a7a')
    }
    if (blipRef.current) {
      const p = passPosition(Math.max(0, s.t))
      blipRef.current.position.set(p.x * K, p.y * K, 0.1)
      blipRef.current.visible = phase === 'track'
      const m = blipRef.current.material as THREE.MeshBasicMaterial
      m.opacity = 0.55 + 0.45 * Math.sin(now * 9)
    }
  })

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (phase !== 'track') return
    aim.current = { x: clamp(e.point.x / K, -90, 90), y: clamp(e.point.y / K, 0, 90) }
  }

  return (
    <>
      <color attach="background" args={['#050914']} />
      <Fit />
      <ambientLight intensity={0.9} />
      <directionalLight position={[-4, 8, 6]} intensity={1.6} color="#b7caff" />
      <Stars />
      {phase === 'track' && (
        <line>
          <primitive object={trail} attach="geometry" />
          <lineDashedMaterial color="#27406e" dashSize={0.12} gapSize={0.2} />
        </line>
      )}
      <mesh position={[0, -1.6, -1]}>
        <planeGeometry args={[30, 3.2]} />
        <meshStandardMaterial color="#0d1424" />
      </mesh>
      <mesh position={[0, 4.6, -4]} onPointerMove={onMove}>
        <planeGeometry args={[40, 20]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <mesh ref={crossRef} visible={false}>
        <ringGeometry args={[0.92, 1, 48]} />
        <meshBasicMaterial ref={crossMat} color="#7dffb2" transparent opacity={0.9} />
      </mesh>
      <mesh ref={blipRef} visible={false}>
        <circleGeometry args={[0.16, 20]} />
        <meshBasicMaterial color="#ffe08a" transparent />
      </mesh>

      <Suspense fallback={null}>
        {phase === 'pick' || phase === 'result' ? (
          groundStations.map((g) => (
            <group key={g.id} position={[PAD_X[g.id] ?? 0, 0, 0]}>
              <mesh
                position={[0, 0.02, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                onClick={() => onPick(g.id)}
                onPointerOver={() => (document.body.style.cursor = 'pointer')}
                onPointerOut={() => (document.body.style.cursor = '')}
              >
                <circleGeometry args={[1.7, 40]} />
                <meshStandardMaterial
                  color={focus === g.id ? '#2a4d85' : '#162238'}
                  emissive={focus === g.id ? '#1d3b6e' : '#000'}
                />
              </mesh>
              <group onClick={() => onPick(g.id)}>
                <DishModel id={g.id} lean={0} />
              </group>
              <CoinTower n={coinsPerHour(g)} x={1.7} />
              <Html position={[0, -0.7, 0.5]} center zIndexRange={[5, 0]}>
                <div className={`select-none whitespace-nowrap text-sm ${focus === g.id ? 'text-white' : 'text-slate-300'}`}>
                  {SHORT[g.id] ?? g.id}
                </div>
              </Html>
            </group>
          ))
        ) : (
          <group ref={dishRef} position={[0, 0, 0.3]}>
            <DishModel id={stationId} />
          </group>
        )}
      </Suspense>
    </>
  )
}

/** The tape reel: how much came home this pass. No numbers, just tape. */
function Reel({ fill, spinning }: { fill: number; spinning: boolean }) {
  const r = 14 + 26 * fill
  return (
    <svg viewBox="0 0 100 100" width="112" height="112" aria-label="Tape reel" data-testid="tape-reel" data-fill={fill.toFixed(2)}>
      <circle cx="50" cy="50" r="46" fill="#10192b" stroke="#3b4d72" strokeWidth="2" />
      <circle cx="50" cy="50" r={r} fill="#8a6a3d" />
      <g style={{ transformOrigin: '50px 50px', animation: spinning ? 'ctp-spin 0.7s linear infinite' : 'none' }}>
        {[0, 120, 240].map((a) => (
          <rect key={a} x="48" y="12" width="4" height="22" fill="#cfd8ea" transform={`rotate(${a} 50 50)`} />
        ))}
        <circle cx="50" cy="50" r="7" fill="#cfd8ea" />
      </g>
    </svg>
  )
}

interface Coin {
  id: number
  x: number
  y: number
}

function BookRing(props: {
  ring: boolean[]
  cap: number
  onChange: (r: boolean[], painted: { hour: number; on: boolean } | null) => void
  onBlocked: () => void
}) {
  const { ring, cap, onChange, onBlocked } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const mode = useRef<boolean | null>(null)
  const [cursor, setCursor] = useState(8)
  const ringRef = useRef(ring)
  ringRef.current = ring

  const hourAt = (e: React.PointerEvent) => {
    const svg = svgRef.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const dist = Math.hypot(dx, dy) / (r.width / 2)
    if (dist < 0.25 || dist > 1.05) return null
    const ang = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2)
    return Math.floor((ang / (Math.PI * 2)) * HOURS) % HOURS
  }
  const apply = (hour: number, on: boolean) => {
    const next = paintHour(ringRef.current, hour, on, cap)
    if (next === ringRef.current) {
      if (on && !ringRef.current[hour]) onBlocked()
      return
    }
    ringRef.current = next
    onChange(next, { hour, on })
  }
  const down = (e: React.PointerEvent) => {
    const h = hourAt(e)
    if (h == null) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    mode.current = !ringRef.current[h]
    setCursor(h)
    apply(h, mode.current)
  }
  const move = (e: React.PointerEvent) => {
    if (mode.current == null) return
    const h = hourAt(e)
    if (h != null) apply(h, mode.current)
  }
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') setCursor((c) => (c + 1) % HOURS)
    else if (e.key === 'ArrowLeft') setCursor((c) => (c + HOURS - 1) % HOURS)
    else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      apply(cursor, !ringRef.current[cursor])
    } else return
    e.stopPropagation()
  }

  const arc = (h: number) => {
    const a0 = (h / HOURS) * Math.PI * 2 - Math.PI / 2 + 0.012
    const a1 = ((h + 1) / HOURS) * Math.PI * 2 - Math.PI / 2 - 0.012
    const r1 = 98
    const r2 = 150
    const p = (a: number, r: number) => `${(180 + Math.cos(a) * r).toFixed(1)} ${(180 + Math.sin(a) * r).toFixed(1)}`
    return `M ${p(a0, r1)} L ${p(a0, r2)} A ${r2} ${r2} 0 0 1 ${p(a1, r2)} L ${p(a1, r1)} A ${r1} ${r1} 0 0 0 ${p(a0, r1)} Z`
  }

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 360 360"
      className="block touch-none select-none"
      style={{ width: 'min(54vh, 420px)', height: 'min(54vh, 420px)', outline: 'none' }}
      tabIndex={0}
      role="application"
      aria-label="24-hour contact ring. Left and right move, space paints an hour."
      data-testid="hour-ring"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => (mode.current = null)}
      onPointerCancel={() => (mode.current = null)}
      onKeyDown={key}
    >
      <circle cx="180" cy="180" r="172" fill="#0b1325" stroke="#2b3d63" strokeWidth="2" />
      {Array.from({ length: HOURS }).map((_, h) => (
        <path
          key={h}
          d={arc(h)}
          data-hour={h}
          data-on={ring[h] ? '1' : '0'}
          fill={ring[h] ? '#f2c14e' : h >= 6 && h < 18 ? '#1b2b4d' : '#121c35'}
          stroke={cursor === h ? '#ffffff' : 'none'}
          strokeWidth="2.5"
        />
      ))}
      {[0, 6, 12, 18].map((h) => {
        const a = (h / HOURS) * Math.PI * 2 - Math.PI / 2
        return (
          <text key={h} x={180 + Math.cos(a) * 80} y={180 + Math.sin(a) * 80 + 5} textAnchor="middle" fill="#6f84ad" fontSize="15">
            {h === 0 ? '12a' : h === 12 ? '12p' : h === 6 ? '6a' : '6p'}
          </text>
        )
      })}
      <text x="180" y="186" textAnchor="middle" fill="#e8eefc" fontSize="34" fontWeight="600">
        {countHours(ring)}
        <tspan fill="#6f84ad" fontSize="18">{` / ${cap} h`}</tspan>
      </text>
    </svg>
  )
}

function Jar({ fill, mbPerDay, ok }: { fill: number; mbPerDay: number; ok: boolean }) {
  const h = 150 * fill
  return (
    <svg viewBox="0 0 110 200" width="96" height="175" aria-label="Data jar" data-testid="data-jar" data-fill={fill.toFixed(2)}>
      <defs>
        <clipPath id="ctp-jar">
          <rect x="14" y="30" width="82" height="150" rx="14" />
        </clipPath>
      </defs>
      <rect x="24" y="10" width="62" height="20" rx="4" fill="#3b4d72" />
      <rect x="14" y="30" width="82" height="150" rx="14" fill="#0b1325" stroke="#3b4d72" strokeWidth="3" />
      <g clipPath="url(#ctp-jar)">
        <rect x="14" y={180 - h} width="82" height={h} fill={ok ? '#7dffb2' : '#f2c14e'} style={{ transition: 'all .35s ease' }} />
      </g>
      <line x1="8" x2="102" y1="42" y2="42" stroke="#ffe08a" strokeWidth="2" strokeDasharray="4 4" />
      <text x="55" y="196" textAnchor="middle" fill="#cdd9f4" fontSize="14">
        {Math.round(mbPerDay)} MB/day
      </text>
    </svg>
  )
}

export default function CatchThePass({ design, difficulty, onComplete, onExit, replay }: MinigameProps) {
  const initial = groundStations.find((g) => g.id === design.groundStation) ?? groundStations[1]
  const [phase, setPhase] = useState<Phase>('pick')
  const [stationId, setStationId] = useState(initial.id)
  const [focus, setFocus] = useState(initial.id)
  const [runId, setRunId] = useState(0)
  const [fill, setFill] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [score, setScore] = useState<PassScore | null>(null)
  const [ring, setRing] = useState(() => ringWithHours(Math.min(design.contactHours ?? initial.defaultHours, maxHours(initial))))
  const [coins, setCoins] = useState<Coin[]>([])
  const [shake, setShake] = useState(false)
  const keys = useRef<Sky>({ x: 0, y: 0 })
  const t0 = useRef(Date.now())
  const root = useRef<HTMLDivElement>(null)
  const idle = useRef<number | null>(null)
  const coinId = useRef(0)
  const hinted = useRef(false)

  const station: GroundStation = groundStations.find((g) => g.id === stationId) ?? initial
  const kbps = useMemo(() => linkKbpsFor(design, difficulty, stationId), [design, difficulty, stationId])
  const proj = useMemo(() => project(design, difficulty, stationId, Math.max(1, countHours(ring))), [design, difficulty, stationId, ring])

  // Voice: intro on entry, a hint after 20 s of no input, success on complete
  const poke = useCallback(() => {
    if (idle.current) window.clearTimeout(idle.current)
    idle.current = window.setTimeout(() => {
      if (!hinted.current) {
        hinted.current = true
        safeSay('hint')
      }
    }, 20000)
  }, [])
  useEffect(() => {
    safeSay('intro')
    poke()
    root.current?.focus()
    return () => {
      if (idle.current) window.clearTimeout(idle.current)
      document.body.style.cursor = ''
    }
  }, [poke])

  const pick = useCallback(
    (id: string) => {
      poke()
      const g = groundStations.find((s) => s.id === id)
      if (!g) return
      safePlay('sfx.ih-coin-drop')
      setStationId(id)
      setFocus(id)
      setRing((r) => clampRing(r, maxHours(g)))
      setFill(0)
      setScore(null)
      setRunId((n) => n + 1)
      setPhase('track')
    },
    [poke],
  )

  const toBook = useCallback(() => {
    poke()
    setPhase('book')
  }, [poke])

  const finish = useCallback(() => {
    safeSay('success')
    onComplete(buildResult({ design, difficulty, stationId, ring, score, durationS: (Date.now() - t0.current) / 1000 }))
  }, [design, difficulty, stationId, ring, score, onComplete])

  const onKeyDown = (e: React.KeyboardEvent) => {
    poke()
    if (e.key === 'Escape') return onExit()
    const k = keys.current
    if (phase === 'pick' || phase === 'result') {
      const ids = groundStations.map((g) => g.id)
      const i = ids.indexOf(focus)
      if (e.key === 'ArrowLeft') setFocus(ids[(i + ids.length - 1) % ids.length])
      else if (e.key === 'ArrowRight') setFocus(ids[(i + 1) % ids.length])
      else if (e.key === '1' || e.key === '2' || e.key === '3') pick(ids[Number(e.key) - 1])
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        pick(focus)
      } else if ((e.key === 'b' || e.key === 'B') && phase === 'result') toBook()
    } else if (phase === 'track') {
      if (e.key === 'ArrowLeft') k.x = -1
      else if (e.key === 'ArrowRight') k.x = 1
      else if (e.key === 'ArrowUp') k.y = 1
      else if (e.key === 'ArrowDown') k.y = -1
      else return
      e.preventDefault()
    } else if (phase === 'book' && e.key === 'Enter') {
      e.preventDefault()
      finish()
    }
  }
  const onKeyUp = (e: React.KeyboardEvent) => {
    const k = keys.current
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') k.x = 0
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') k.y = 0
  }

  const onTick = useCallback((f: number, q: number) => {
    setFill(f)
    setSpinning(q > 0.02)
  }, [])
  const onDone = useCallback(
    (s: PassScore) => {
      setScore(s)
      setSpinning(false)
      setPhase('result')
    },
    [],
  )

  const onRing = (next: boolean[], painted: { hour: number; on: boolean } | null) => {
    poke()
    setRing(next)
    if (painted?.on) {
      safePlay('sfx.ih-coin-drop')
      const id = ++coinId.current
      const hx = Math.cos((painted.hour / HOURS) * Math.PI * 2 - Math.PI / 2)
      setCoins((c) => [...c.slice(-8), { id, x: hx * 120, y: 0 }])
      window.setTimeout(() => setCoins((c) => c.filter((x) => x.id !== id)), 900)
    }
  }
  const blocked = () => {
    setShake(true)
    window.setTimeout(() => setShake(false), 350)
  }

  const prompt =
    phase === 'pick'
      ? 'Pick a dish. The coins are what one hour costs.'
      : phase === 'track'
        ? dishTraits(stationId).assist > 0
          ? 'Keep the ring on the blinking craft. The big dish helps with its motors.'
          : 'Keep the ring on the blinking craft. Mouse or arrow keys.'
        : phase === 'result'
          ? 'Pass over. Try another dish, or book hours.'
          : `Paint the hours you want. ${station.name} allows ${maxHours(station)} a day.`

  return (
    <div
      ref={root}
      tabIndex={0}
      className="relative h-full w-full select-none overflow-hidden bg-[#050914] text-slate-100 outline-none"
      style={{ minHeight: '100%' }}
      data-testid="catch-the-pass"
      data-phase={phase}
      data-station={stationId}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onPointerDown={() => root.current?.focus({ preventScroll: true })}
      onPointerMove={poke}
    >
      <style>{`@keyframes ctp-spin{to{transform:rotate(360deg)}}@keyframes ctp-drop{0%{transform:translate(var(--x),-30px) scale(1);opacity:1}80%{opacity:1}100%{transform:translate(260px,170px) scale(.6);opacity:0}}@keyframes ctp-shake{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`}</style>
      <Canvas orthographic camera={{ position: [0, 4.6, 20], zoom: 60, near: 0.1, far: 100 }} dpr={[1, 1.5]} className="!absolute inset-0" style={{ opacity: phase === 'book' ? 0.45 : 1 }}>
        <Scene phase={phase} stationId={stationId} focus={focus} onPick={pick} keys={keys} runId={runId} onTick={onTick} onDone={onDone} kbps={kbps} />
      </Canvas>

      {/* HUD 1: one quiet line */}
      <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
        <p className="rounded-full bg-black/40 px-4 py-1.5 text-sm text-slate-200" data-testid="prompt">
          {prompt}
        </p>
      </div>

      {/* HUD 2: the tape reel, on the console */}
      {(phase === 'track' || phase === 'result') && (
        <div className="absolute bottom-4 left-4">
          <Reel fill={fill} spinning={spinning} />
        </div>
      )}

      {phase === 'book' && (
        <div className="absolute inset-0 flex items-center justify-center gap-8 pt-8">
          <div className="relative" style={shake ? { animation: 'ctp-shake .3s' } : undefined}>
            <BookRing ring={ring} cap={maxHours(station)} onChange={onRing} onBlocked={blocked} />
            {coins.map((c) => (
              <span
                key={c.id}
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 rounded-full border border-amber-200 bg-amber-300"
                style={{ ['--x' as string]: `${c.x}px`, animation: 'ctp-drop .85s ease-in forwards' }}
              />
            ))}
          </div>
          <Jar fill={proj.jar} mbPerDay={proj.mbPerDay} ok={proj.jar >= 1} />
        </div>
      )}

      {/* HUD 3: the one action */}
      <div className="absolute bottom-4 right-4 flex items-center gap-3">
        {phase === 'result' && (
          <button type="button" className="fp-btn-secondary" onClick={() => pick(focus)} data-testid="try-again">
            Try another
          </button>
        )}
        {phase === 'result' && (
          <button type="button" className="fp-btn-primary" onClick={toBook} data-testid="to-book">
            Book hours
          </button>
        )}
        {phase === 'book' && (
          <button type="button" className="fp-btn-primary" onClick={finish} data-testid="room-complete">
            Send it
          </button>
        )}
      </div>

      <div className="absolute left-4 top-4 flex gap-3 text-xs">
        <button type="button" className="rounded bg-black/40 px-2 py-1 text-slate-300 hover:text-white" onClick={onExit} data-testid="ctp-leave">
          Back
        </button>
        {replay && (
          <button
            type="button"
            className="rounded bg-black/40 px-2 py-1 text-slate-300 hover:text-white"
            onClick={() => onComplete({ patch: {}, insights: [], durationS: Math.round((Date.now() - t0.current) / 1000) })}
            data-testid="ctp-skip"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  )
}

useGLTF.preload(MODEL('ground-small'))
useGLTF.preload(MODEL('ground-medium'))
useGLTF.preload(MODEL('ground-dsn'))
