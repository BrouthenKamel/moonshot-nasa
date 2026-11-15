import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { audio } from '../../assets/audio'
import { sayRoom } from '../../assets/ihVoice'
import { Earth, Effects, Moon, Starfield } from '../../scene/space'
import {
  EARTH_DIR,
  SUN_DIR,
  hiddenStretch,
  inStretch,
  meanAnomalyOf,
  orbitPoint,
  trueAnomaly,
  type OrbitShape,
  type Stretch,
  type Vec3,
} from '../../viz/orbit/orbitGeometry'
import type { MinigameProps } from '../contract'
import {
  LAPSE_MONTHS,
  TRAIL_POINTS,
  commitFamily,
  evaluate,
  familyById,
  gaugeFill,
  gaugeTone,
  handlesFromRadii,
  lapseCoverage,
  magnet,
  nearestIndex,
  pullToMorph,
  rpOf,
  shapeAt,
  trailMagnet,
  trailPath,
  transferName,
  tripText,
  buildResult,
  type Candidate,
  type Handles,
  type TransferId,
} from './logic'

/* ------------------------------------------------------------------ */
/* Layout constants (world units; Moon radius 1)                        */
/* ------------------------------------------------------------------ */

const TABLE_Y = -3.55
const SUN = new THREE.Vector3(...SUN_DIR)
const EARTH_V = new THREE.Vector3(...EARTH_DIR)
const SHADOW = new THREE.Color('#34407a')
const TAU = Math.PI * 2
/** Seconds the 12-month coverage time-lapse takes */
const LAPSE_SECONDS = 7

/** Phase 2 frame: Earth and Moon on the table, trail drawn in this plane */
const EARTH_POS = new THREE.Vector3(-4.7, 0.1, 0)
const MOON_POS = new THREE.Vector3(3.3, 0.1, 0)
const EARTH_R = 1.5
const TRAIL_D = MOON_POS.x - EARTH_POS.x
const TRAIL_Y = 0.5

const toWorld = (p: [number, number]) =>
  new THREE.Vector3(EARTH_POS.x + p[0] * TRAIL_D, EARTH_POS.y + p[1] * TRAIL_D * TRAIL_Y, 0)

const v3 = (v: Vec3) => new THREE.Vector3(v[0], v[1], v[2])
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

type Phase = 'orbit' | 'transfer'

const TONE_COLOR = { good: '#34d399', warn: '#fbbf24', bad: '#f87171' } as const

function pill(extra = '') {
  return `pointer-events-none whitespace-nowrap rounded-full bg-ink-0/80 px-3 py-1 text-xs text-paper shadow ${extra}`
}

const fmt = (n: number) => n.toLocaleString('en-US')

/* ------------------------------------------------------------------ */
/* Drag plumbing                                                        */
/* ------------------------------------------------------------------ */

type DragKind = 'peri' | 'apo' | 'comet'

interface SceneProps {
  phase: Phase
  /** Where the handles want to be (already magnet-adjusted) */
  target: Handles
  seated: boolean
  committed: boolean
  orbitCand: Candidate
  lapseKey: number
  transferCands: Record<TransferId, Candidate>
  trail: { u: number; idx: number; pick: TransferId | null }
  onDragStart: (kind: DragKind) => void
  onDragPoint: (kind: DragKind, x: number, y: number) => void
  onDragEnd: (kind: DragKind) => void
}

function DragPlane({
  drag,
  onPoint,
  onEnd,
}: {
  drag: React.MutableRefObject<DragKind | null>
  onPoint: (kind: DragKind, x: number, y: number) => void
  onEnd: (kind: DragKind) => void
}) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const latest = useRef({ onPoint, onEnd })
  latest.current = { onPoint, onEnd }
  useEffect(() => {
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const hit = new THREE.Vector3()
    const move = (e: PointerEvent) => {
      const kind = drag.current
      if (!kind) return
      const r = el.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      if (ray.ray.intersectPlane(plane, hit)) latest.current.onPoint(kind, hit.x, hit.y)
    }
    const up = () => {
      const kind = drag.current
      if (!kind) return
      drag.current = null
      latest.current.onEnd(kind)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [gl, camera, drag])
  return null
}

/* ------------------------------------------------------------------ */
/* Camera and table                                                     */
/* ------------------------------------------------------------------ */

const CAM = {
  orbit: { pos: new THREE.Vector3(0, 0.9, 10.6), look: new THREE.Vector3(0, -0.3, 0) },
  transfer: { pos: new THREE.Vector3(0.4, 1.9, 15.4), look: new THREE.Vector3(0.4, -0.5, 0) },
}

function Rig({ phase }: { phase: Phase }) {
  const look = useRef(CAM.orbit.look.clone())
  useFrame(({ camera }, dt) => {
    const c = CAM[phase]
    const k = 1 - Math.exp(-dt * 2.2)
    camera.position.lerp(c.pos, k)
    look.current.lerp(c.look, k)
    camera.lookAt(look.current)
  })
  return null
}

function Table() {
  return (
    <group position={[0, TABLE_Y, 0]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[11, 11, 0.3, 96]} />
        <meshStandardMaterial color="#3a2f27" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[10.6, 10.8, 96]} />
        <meshBasicMaterial color="#6d5a49" />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Phase 1: orbit                                                       */
/* ------------------------------------------------------------------ */

function ringColors(shape: OrbitShape, lit: THREE.Color, sun: Stretch | null, n: number) {
  const pts: THREE.Vector3[] = []
  const cols: THREE.Color[] = []
  for (let i = 0; i <= n; i++) {
    const nu = (i / n) * TAU
    pts.push(v3(orbitPoint(shape, nu)))
    cols.push(inStretch(sun, meanAnomalyOf(shape, nu)) ? SHADOW : lit)
  }
  return { pts, cols }
}

function Handle({
  position,
  active,
  onDown,
  visible,
}: {
  position: THREE.Vector3
  active: boolean
  onDown: () => void
  visible: boolean
}) {
  const ring = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ring.current) ring.current.scale.setScalar(1 + 0.18 * Math.sin(clock.elapsedTime * 3.2) * (active ? 0 : 1))
  })
  if (!visible) return null
  return (
    <group position={position}>
      <mesh
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          onDown()
        }}
        onPointerOver={() => (document.body.style.cursor = 'grab')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <sphereGeometry args={[0.34, 16, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.1, 20, 16]} />
        <meshStandardMaterial color="#fcd34d" emissive="#f59e0b" emissiveIntensity={2.2} />
      </mesh>
      <mesh ref={ring}>
        <torusGeometry args={[0.2, 0.015, 8, 32]} />
        <meshBasicMaterial color="#fde68a" />
      </mesh>
    </group>
  )
}

function Craft({ shape, sun, earth, label }: { shape: OrbitShape; sun: Stretch | null; earth: Stretch | null; label: string }) {
  const group = useRef<THREE.Group>(null)
  const beam = useRef<THREE.Group>(null)
  const beamMat = useRef<THREE.MeshBasicMaterial>(null)
  const dot = useRef<THREE.MeshBasicMaterial>(null)
  const M = useRef(0)
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), EARTH_V), [])
  const latest = useRef({ shape, earth, sun })
  latest.current = { shape, earth, sun }
  useFrame((_, dt) => {
    const { shape: s, earth: e } = latest.current
    M.current = (M.current + (dt * TAU) / s.period) % TAU
    const p = orbitPoint(s, trueAnomaly(s, M.current))
    group.current?.position.set(p[0], p[1], p[2])
    const blocked = inStretch(e, M.current)
    beamMat.current?.color.set(blocked ? '#ef4444' : '#7dd3fc')
    dot.current?.color.set(blocked ? '#ef4444' : '#38bdf8')
    if (beam.current) beam.current.quaternion.copy(q)
  })
  return (
    <group ref={group}>
      <mesh>
        <boxGeometry args={[0.1, 0.1, 0.16]} />
        <meshStandardMaterial color="#e5e7eb" emissive="#9ca3af" emissiveIntensity={0.6} metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.34, 0.01, 0.1]} />
        <meshStandardMaterial color="#1e40af" emissive="#1d4ed8" emissiveIntensity={0.7} />
      </mesh>
      <group ref={beam}>
        <mesh position={[0, 1.0, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 2, 6]} />
          <meshBasicMaterial ref={beamMat} color="#7dd3fc" />
        </mesh>
        <mesh position={[0, 2.0, 0]}>
          <sphereGeometry args={[0.07, 12, 10]} />
          <meshBasicMaterial ref={dot} color="#38bdf8" />
        </mesh>
        <Html position={[0, 2.25, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className={pill()} data-testid="label-comm">
            {label}
          </div>
        </Html>
      </group>
    </group>
  )
}

function FuelGauge({ cand, pending }: { cand: Candidate; pending: boolean }) {
  const fillMesh = useRef<THREE.Mesh>(null)
  const fillMat = useRef<THREE.MeshStandardMaterial>(null)
  const shown = useRef(0)
  const H = 2.4
  const impossible = cand.captureDv === null
  const target = impossible ? 1.2 : gaugeFill(cand.dvNeeded, cand.dvAvailable)
  const tone = gaugeTone(target)
  useFrame((_, dt) => {
    shown.current += (target - shown.current) * Math.min(1, dt * 5)
    const h = Math.max(0.001, shown.current * H)
    if (fillMesh.current) {
      fillMesh.current.scale.y = h
      fillMesh.current.position.y = h / 2
    }
    fillMat.current?.color.set(TONE_COLOR[tone])
    fillMat.current?.emissive.set(TONE_COLOR[tone])
  })
  return (
    <group position={[4.3, TABLE_Y + 0.15, 0.4]}>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.55, 0.62, 0.12, 32]} />
        <meshStandardMaterial color="#52463b" roughness={0.8} />
      </mesh>
      <mesh position={[0, H / 2 + 0.12, 0]}>
        <cylinderGeometry args={[0.3, 0.3, H, 24, 1, true]} />
        <meshStandardMaterial color="#cbd5e1" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group position={[0, 0.12, 0]}>
        <mesh ref={fillMesh}>
          <cylinderGeometry args={[0.24, 0.24, 1, 24]} />
          <meshStandardMaterial ref={fillMat} color="#34d399" emissive="#34d399" emissiveIntensity={0.9} />
        </mesh>
      </group>
      {/* "You have" line at the top of the tube */}
      <mesh position={[0, H + 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.36, 32]} />
        <meshBasicMaterial color="#e2e8f0" />
      </mesh>
      <Html position={[0, H + 0.55, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className={pill(pending ? 'opacity-60' : '')} data-testid="label-fuel">
          {impossible ? (
            <span style={{ color: TONE_COLOR.bad }}>No way to brake</span>
          ) : (
            <>
              <span style={{ color: TONE_COLOR[tone] }}>{fmt(cand.dvNeeded)}</span> / {fmt(cand.dvAvailable)} m/s
            </>
          )}
        </div>
      </Html>
    </group>
  )
}

function OrbitStage({
  disp,
  famId,
  cand,
  seated,
  committed,
  lapseKey,
  drag,
  onDragStart,
  hideHandles,
}: {
  disp: Handles
  famId: string
  cand: Candidate
  seated: boolean
  committed: boolean
  lapseKey: number
  drag: React.MutableRefObject<DragKind | null>
  onDragStart: (k: DragKind) => void
  hideHandles: boolean
}) {
  const fam = familyById(famId)
  const shape = useMemo(() => shapeAt(disp), [disp])
  const sun = useMemo(() => hiddenStretch(shape, SUN_DIR, 1 - cand.sunlitShare), [shape, cand.sunlitShare])
  const earth = useMemo(() => hiddenStretch(shape, EARTH_DIR, 1 - cand.earthVisible), [shape, cand.earthVisible])
  const lit = useMemo(() => new THREE.Color(fam.color), [fam.color])
  const ring = useMemo(() => ringColors(shape, lit, sun, 220), [shape, lit, sun])
  const peri = useMemo(() => v3(orbitPoint(shape, 0)), [shape])
  const apo = useMemo(() => v3(orbitPoint(shape, Math.PI)), [shape])
  const eclipseAt = useMemo(() => (sun ? v3(orbitPoint(shape, trueAnomaly(shape, sun.centre))) : null), [shape, sun])

  // Time-lapse: 12 months in LAPSE_SECONDS, painting the cap with the sim's coverage
  const [lapse, setLapse] = useState(0)
  const t0 = useRef(0)
  const acc = useRef(0)
  useEffect(() => {
    t0.current = 0
    setLapse(0)
  }, [lapseKey, famId])
  useFrame((_, dt) => {
    t0.current += dt
    acc.current += dt
    if (acc.current < 0.08) return
    acc.current = 0
    const p = committed || seated ? Math.min(1, t0.current / LAPSE_SECONDS) : 0
    setLapse((prev) => (Math.abs(prev - p) > 0.004 ? p : prev))
  })
  const pct = lapseCoverage(cand.coveragePct, lapse)
  const month = Math.min(LAPSE_MONTHS, Math.floor(lapse * LAPSE_MONTHS))
  const pending = !seated && !committed
  const commLabel = cand.blackoutPct > 0 ? `Earth hidden ${cand.blackoutPct}% of the time` : 'Earth always in view'

  return (
    <group>
      <Suspense fallback={null}>
        <Moon radius={1} iceCoverage={pct / 100} />
      </Suspense>
      <Line points={ring.pts} vertexColors={ring.cols.map((c) => [c.r, c.g, c.b] as [number, number, number])} lineWidth={2.4} />
      {eclipseAt && cand.eclipseMin > 0 && (
        <Html position={eclipseAt} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className={pill(pending ? 'opacity-60' : '')} style={{ color: '#a5b4fc' }} data-testid="label-eclipse">
            Eclipse {cand.eclipseMin} min
          </div>
        </Html>
      )}
      <Craft shape={shape} sun={sun} earth={earth} label={commLabel} />
      <Handle position={peri} active={drag.current === 'peri'} visible={!hideHandles} onDown={() => onDragStart('peri')} />
      <Handle position={apo} active={drag.current === 'apo'} visible={!hideHandles} onDown={() => onDragStart('apo')} />
      <Html position={[-1.9, -1.55, 0.2]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className={pill(pending ? 'opacity-60' : '')} data-testid="label-coverage">
          <span style={{ color: '#67e8f9' }}>Ice mapped {Math.round(pct)}%</span>
          {pct > 0 || committed || seated ? ` · month ${month}/${LAPSE_MONTHS}` : ''}
        </div>
      </Html>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Phase 2: transfer                                                    */
/* ------------------------------------------------------------------ */

function TransferStage({
  trail,
  cands,
  drag,
  onDragStart,
}: {
  trail: { u: number; idx: number; pick: TransferId | null }
  cands: Record<TransferId, Candidate>
  drag: React.MutableRefObject<DragKind | null>
  onDragStart: (k: DragKind) => void
}) {
  const path = useMemo(() => trailPath(trail.u).map(toWorld), [trail.u])
  const idx = Math.max(1, trail.idx)
  const visible = path.slice(0, idx + 1)
  const colors = useMemo(
    () =>
      visible.map((_, i) => {
        const t = i / Math.max(1, visible.length - 1)
        return [lerp(0.1, 0.85, t), lerp(0.25, 0.97, t), 1] as [number, number, number]
      }),
    [visible],
  )
  const head = path[Math.min(path.length - 1, idx)]
  const near = trailMagnet(trail.u).pick
  const labelCand = cands[trail.pick ?? near]
  const mid = path[Math.floor(TRAIL_POINTS * 0.5)]
  const headMesh = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (headMesh.current) headMesh.current.scale.setScalar(1 + 0.2 * Math.sin(clock.elapsedTime * 5))
  })
  const started = trail.idx > 1
  return (
    <group>
      {started && <Line points={visible} vertexColors={colors} lineWidth={4} />}
      <mesh position={head} ref={headMesh}>
        <sphereGeometry args={[0.13, 16, 12]} />
        <meshStandardMaterial color="#e0f2fe" emissive="#7dd3fc" emissiveIntensity={3} />
      </mesh>
      {/* Grab area: the Earth */}
      <mesh
        position={EARTH_POS}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          onDragStart('comet')
        }}
        onPointerOver={() => (document.body.style.cursor = 'grab')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <sphereGeometry args={[EARTH_R * 1.25, 16, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {started && idx > TRAIL_POINTS * 0.8 && (
        <Html position={[mid.x, mid.y + 0.55, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className={pill()} data-testid="label-trail">
            <b>{transferName(labelCand.transferId)}</b> · {tripText(labelCand.transferMonths, labelCand.transferId)} ·{' '}
            {labelCand.captureDv === null ? 'no way to brake' : `${fmt(labelCand.captureDv)} m/s`}
          </div>
        </Html>
      )}
      {drag.current === null && !started && (
        <Html position={[EARTH_POS.x, EARTH_POS.y - 2.1, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className={pill('opacity-80')}>Earth</div>
        </Html>
      )}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Scene                                                                */
/* ------------------------------------------------------------------ */

declare global {
  interface Window {
    __orbitSling?: { project: (name: 'peri' | 'apo' | 'earth' | 'moon') => { x: number; y: number }; state: () => unknown }
  }
}

function Scene(props: SceneProps & { famId: string; stateRef: React.MutableRefObject<unknown> }) {
  const { phase, target, seated, committed, orbitCand, lapseKey, transferCands, trail, famId } = props
  const drag = useRef<DragKind | null>(null)
  const [disp, setDisp] = useState(target)
  const goal = useRef(target)
  goal.current = target
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 18)
    setDisp((d) => {
      const p = lerp(d.p, goal.current.p, k)
      const q = lerp(d.q, goal.current.q, k)
      return Math.abs(p - d.p) + Math.abs(q - d.q) < 1e-4 ? d : { p, q }
    })
  })
  const moon = useRef<THREE.Group>(null)
  const earthG = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 2.2)
    const tm = phase === 'transfer' ? MOON_POS : new THREE.Vector3()
    moon.current?.position.lerp(tm, k)
    if (earthG.current) {
      const s = lerp(earthG.current.scale.x, phase === 'transfer' ? 1 : 0.001, k)
      earthG.current.scale.setScalar(s)
      earthG.current.visible = s > 0.02
    }
  })
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__orbitSling = {
      project: (name) => {
        const shape = shapeAt(goal.current)
        const w =
          name === 'peri'
            ? v3(orbitPoint(shape, 0))
            : name === 'apo'
              ? v3(orbitPoint(shape, Math.PI))
              : name === 'earth'
                ? EARTH_POS.clone()
                : MOON_POS.clone()
        const v = w.project(camera)
        const r = gl.domElement.getBoundingClientRect()
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
      },
      state: () => props.stateRef.current,
    }
    return () => {
      delete window.__orbitSling
    }
  }, [camera, gl, props.stateRef])

  return (
    <>
      <color attach="background" args={[0x03050a]} />
      <Rig phase={phase} />
      <directionalLight position={SUN.clone().multiplyScalar(20)} intensity={3.1} color={0xfff4e0} />
      <ambientLight intensity={0.35} color="#ffe9d0" />
      <pointLight position={[0, 4, 8]} intensity={18} color="#ffd9a8" />
      <Suspense fallback={null}>
        <Starfield brightness={0.9} />
      </Suspense>
      <Table />
      <DragPlane drag={drag} onPoint={props.onDragPoint} onEnd={props.onDragEnd} />
      <group ref={moon}>
        <OrbitStage
          disp={disp}
          famId={famId}
          cand={orbitCand}
          seated={seated}
          committed={committed}
          lapseKey={lapseKey}
          drag={drag}
          hideHandles={phase !== 'orbit'}
          onDragStart={(k) => {
            drag.current = k
            props.onDragStart(k)
          }}
        />
      </group>
      <group ref={earthG} position={EARTH_POS} scale={0.001}>
        <Suspense fallback={null}>
          <Earth radius={EARTH_R} />
        </Suspense>
      </group>
      {phase === 'orbit' && <FuelGauge cand={orbitCand} pending={!seated && !committed} />}
      {phase === 'transfer' && (
        <TransferStage
          trail={trail}
          cands={transferCands}
          drag={drag}
          onDragStart={(k) => {
            drag.current = k
            props.onDragStart(k)
          }}
        />
      )}
      {phase === 'transfer' && <FuelGaugeAt cand={transferCands[trail.pick ?? trailMagnet(trail.u).pick]} />}
      <Effects />
    </>
  )
}

/** The fuel gauge keeps standing on the table in phase 2, showing the picked trail's total */
function FuelGaugeAt({ cand }: { cand: Candidate }) {
  return (
    <group position={[2.2, 0, 0]}>
      <FuelGauge cand={cand} pending={false} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Room                                                                 */
/* ------------------------------------------------------------------ */

const HINTS = {
  orbit: 'Drag the two golden handles to reshape the orbit. It clicks into a real one.',
  orbitDone: 'Watch the poles fill with ice. Happy with it? Lock the orbit.',
  transfer: 'Pull a comet trail from Earth to the Moon. Straight is quick, a wide loop is cheap.',
  transferDone: 'Direct burns fuel. Low-energy burns months. Pick your trade.',
}

export default function OrbitSling({ design, difficulty, onComplete, onExit, replay }: MinigameProps) {
  const startedAt = useRef(Date.now())
  const startFam = familyById(design.orbit)
  const [phase, setPhase] = useState<Phase>('orbit')
  const raw = useRef<Handles>({ ...startFam.at })
  const [target, setTarget] = useState<Handles>(startFam.at)
  const [famId, setFamId] = useState<string>(startFam.id)
  const [seated, setSeated] = useState(true)
  const [committed, setCommitted] = useState(false)
  const [lapseKey, setLapseKey] = useState(0)
  const [trail, setTrail] = useState<{ u: number; idx: number; pick: TransferId | null }>({ u: 0, idx: 0, pick: null })
  const peak = useRef(0)
  const [idle, setIdle] = useState(false)
  const stateRef = useRef<unknown>(null)

  const orbitCand = useMemo(() => evaluate(design, difficulty, famId, design.transfer), [design, difficulty, famId])
  const transferCands = useMemo(
    () => ({
      'transfer-direct': evaluate(design, difficulty, famId, 'transfer-direct'),
      'transfer-low-energy': evaluate(design, difficulty, famId, 'transfer-low-energy'),
    }),
    [design, difficulty, famId],
  )
  stateRef.current = { phase, famId, seated, committed, trail, target }

  // Voice: intro on arrival, hint after 20 s without a touch, success on finish
  useEffect(() => {
    sayRoom('flight-dynamics', 'intro')
  }, [])
  const touch = useCallback(() => setIdle(false), [])
  useEffect(() => {
    const id = window.setTimeout(() => {
      setIdle(true)
      sayRoom('flight-dynamics', 'hint')
    }, 20000)
    return () => window.clearTimeout(id)
  }, [target, trail, phase])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onExit()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  const click = () => audio.play('sfx.ih-part-click')

  const onDragStart = useCallback(
    (kind: DragKind) => {
      touch()
      if (kind === 'comet') {
        peak.current = 0
        setTrail({ u: 0, idx: 1, pick: null })
      } else {
        setCommitted(false)
      }
    },
    [touch],
  )

  const onDragPoint = useCallback(
    (kind: DragKind, x: number, y: number) => {
      touch()
      if (kind === 'comet') {
        const fx = (x - EARTH_POS.x) / TRAIL_D
        const fy = (y - EARTH_POS.y) / (TRAIL_D * TRAIL_Y)
        peak.current = Math.max(peak.current, fy)
        const m = trailMagnet(pullToMorph(peak.current))
        const idx = nearestIndex(trailPath(m.shown), fx, fy)
        setTrail((t) => ({ u: m.shown, idx: Math.max(1, idx), pick: t.pick }))
        return
      }
      const cur = raw.current
      if (kind === 'peri') {
        const rp = Math.max(0, -y)
        raw.current = { p: handlesFromRadii(rp, 0).p, q: cur.q }
      } else {
        raw.current = { p: cur.p, q: handlesFromRadii(rpOf(cur.p), Math.max(0, y)).q }
      }
      const m = magnet(raw.current)
      setTarget(m.shown)
      setSeated((was) => {
        if (m.seated && !was) click()
        return m.seated
      })
      if (m.seated) setFamId((id) => (id === m.family.id ? id : (click(), m.family.id)))
    },
    [touch],
  )

  const onDragEnd = useCallback(
    (kind: DragKind) => {
      if (kind === 'comet') {
        setTrail((t) => {
          if (t.idx < TRAIL_POINTS * 0.8) return { u: 0, idx: 0, pick: null }
          const pick = trailMagnet(pullToMorph(peak.current)).pick
          click()
          return { u: pick === 'transfer-low-energy' ? 1 : 0, idx: TRAIL_POINTS - 1, pick }
        })
        return
      }
      const fam = commitFamily(raw.current)
      raw.current = { ...fam.at }
      setTarget(fam.at)
      setSeated((was) => {
        if (!was) click()
        return true
      })
      setFamId(fam.id)
      setCommitted(true)
      setLapseKey((k) => k + 1)
    },
    [],
  )

  const pickedCand = trail.pick ? transferCands[trail.pick] : null

  const finish = () => {
    if (!pickedCand) return
    sayRoom('flight-dynamics', 'success')
    onComplete(
      buildResult({
        orbit: { ...orbitCand, transferId: pickedCand.transferId },
        transfer: pickedCand,
        durationS: Math.round((Date.now() - startedAt.current) / 1000),
      }),
    )
  }

  const hint =
    phase === 'orbit' ? (committed ? HINTS.orbitDone : HINTS.orbit) : trail.pick ? HINTS.transferDone : HINTS.transfer

  return (
    <div className="relative h-screen overflow-hidden bg-ink-0 text-paper" data-testid="orbit-sling">
      <Canvas
        className="!absolute inset-0"
        dpr={[1, 2]}
        camera={{ fov: 42, near: 0.05, far: 1000, position: [0, 0.9, 10.6] }}
        gl={{ antialias: true }}
        aria-hidden
      >
        <Scene
          phase={phase}
          target={target}
          seated={seated}
          committed={committed}
          orbitCand={orbitCand}
          lapseKey={lapseKey}
          transferCands={transferCands}
          trail={trail}
          famId={famId}
          stateRef={stateRef}
          onDragStart={onDragStart}
          onDragPoint={onDragPoint}
          onDragEnd={onDragEnd}
        />
      </Canvas>

      {/* HUD: back / skip, one hint line, one confirm */}
      <button
        type="button"
        className="fp-btn-secondary absolute left-4 top-4"
        data-testid={replay ? 'orbit-skip' : 'orbit-back'}
        onClick={() => (replay ? onComplete({ patch: {}, insights: [], durationS: 0 }) : onExit())}
      >
        {replay ? 'Skip' : 'Back to campus'}
      </button>
      <div className="pointer-events-none absolute inset-x-0 top-5 flex justify-center">
        <div
          className={`rounded-full bg-ink-0/75 px-4 py-1.5 text-sm shadow ${idle ? 'ring-2 ring-amber-300' : ''}`}
          data-testid="orbit-hint"
        >
          {hint}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-6 flex justify-center">
        {phase === 'orbit' && committed && (
          <button type="button" className="fp-btn-primary" data-testid="orbit-lock" onClick={() => setPhase('transfer')}>
            Lock {familyById(famId).short.toLowerCase()}
          </button>
        )}
        {phase === 'transfer' && pickedCand && (
          <button type="button" className="fp-btn-primary" data-testid="room-complete" onClick={finish}>
            Plan the flight
          </button>
        )}
      </div>
    </div>
  )
}
