import { Component, Suspense, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { ModelId } from '../../assets/manifest'
import { preloadModel, useModel } from '../../assets/models'
import { rocketParts, rocketSlots, type RocketConfig, type RocketSlot } from '../../data/rocket'
import { layoutRocket, type PlacedPart } from '../../viz/rocket/rocketView'
import { prefersReducedMotion } from '../space/quality'
import { Effects } from '../space/Effects'

/**
 * The Craft step's rocket hall: the standard launch rocket stands on its pad, and the player's
 * CubeSat, sealed in its 6U deployer, is carried up and lowered into the payload fairing. Once it
 * is inside, the fairing turns see-through so the craft shows, and each part of the rocket can be
 * picked to fly the camera to it. It explains; nothing here is chosen. Everything drawn comes from
 * layoutRocket(); the deployer is drawn larger than life so it can be seen at all.
 */

/** Scene units per body radius */
const S = 0.55
/** Kapton amber: safety markings and the crane hook (FLIGHT PLAN) */
const ACCENT = '#e8a33d'
const ACCENT_DIM = '#9a6b26'
/** Height of the launch table's top above the floor, in scene units: the exhaust passes through its hole */
const TABLE_Y = 3
/** Clearance between the engine bells and the table top */
const GAP = 0.2
/** Metres per scene unit: one body radius is BODY_RADIUS_M (1.85 m) and S scene units */
const M_PER_UNIT = 1.85 / S
/** The deployer the CubeSat rides in, closed. Drawn three times life size (about a metre long), or it would vanish beside a 34 m rocket */
const DEPLOYER: ModelId = 'model.sc-deployer_6u_closed'
const DEPLOYER_SCALE = 3
preloadModel(DEPLOYER)

for (const p of rocketParts) if (p.model) preloadModel(p.model)

const slotColor = Object.fromEntries(rocketSlots.map((s) => [s.id, s.color])) as Record<RocketSlot, string>
const slotTitle = Object.fromEntries(rocketSlots.map((s) => [s.id, s.title])) as Record<RocketSlot, string>

/** What the camera looks at once the craft is inside: one part, the payload, or the whole rocket */
export type RocketFocus = RocketSlot | 'payload' | 'whole'

interface ViewProps {
  config: RocketConfig
  activeSlot: RocketSlot | null
  onSlotHover: (slot: RocketSlot | null) => void
  onSlotClick: (slot: RocketSlot) => void
  /** 'loading' plays the carry into the fairing, then calls onLoaded; 'inside' shows it seated */
  payload: 'loading' | 'inside'
  /** How fast the carry plays: 1 the first time, faster on a repeat */
  speed?: number
  focus: RocketFocus
  onLoaded: () => void
  /** Called once, when the rocket and the craft have loaded and the scene is drawn */
  onReady?: () => void
}

/* ---------------- one part ---------------- */

function PartModel({
  placed,
  ghost,
  highlighted,
  reduced,
  onHover,
  onClick,
}: {
  placed: PlacedPart
  /** See-through, so the payload inside shows (the fairing once the craft is in) */
  ghost: boolean
  highlighted: boolean
  reduced: boolean
  onHover: (slot: RocketSlot | null) => void
  onClick: (slot: RocketSlot) => void
}) {
  const { part, slot } = placed
  const root = useModel(part.model!)
  // Own copies of the materials, so highlighting or fading one part never touches another
  const obj = useMemo(() => {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const own = (m: THREE.Material) => m.clone()
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material)
    })
    return root
  }, [root])
  // Read back what the meshes actually wear: in development React runs the memo above twice, and
  // only the second set of copies ends up on the meshes
  const materials = useRef<THREE.MeshStandardMaterial[]>([])
  useEffect(() => {
    const mats: THREE.MeshStandardMaterial[] = []
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mats.push(...((Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]))
    })
    materials.current = mats
  }, [obj])

  const group = useRef<THREE.Group>(null)
  const state = useRef({ y: placed.y, opacity: 1 })
  const color = useMemo(() => new THREE.Color(ACCENT), [])

  useFrame((frame, dt) => {
    const s = state.current
    const k = reduced ? 1 : 1 - Math.exp(-dt * 8)
    s.y += (placed.y - s.y) * k
    s.opacity += ((ghost ? 0.2 : 1) - s.opacity) * (reduced ? 1 : 1 - Math.exp(-dt * 3))
    const g = group.current
    if (g) {
      g.position.y = s.y * S
    }
    const glow = highlighted ? 0.3 + 0.18 * Math.sin(frame.clock.elapsedTime * 5) : 0
    const see = s.opacity < 0.98
    for (const m of materials.current) {
      m.emissive.copy(color)
      m.emissiveIntensity = glow
      if (m.transparent !== see) {
        // switching blending needs a new shader
        m.transparent = see
        m.depthWrite = !see
        m.needsUpdate = true
      }
      m.opacity = s.opacity
    }
  })

  return (
    <group
      ref={group}
      scale={S}
      onPointerOver={(e) => {
        e.stopPropagation()
        onHover(slot)
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation()
        onClick(slot)
      }}
    >
      <primitive object={obj} />
    </group>
  )
}

/* ---------------- the hangar ---------------- */

/** Cross-section of the table ring (radius, height), turned into a solid of revolution */
const TABLE_PROFILE = [
  new THREE.Vector2(1.4, -0.25),
  new THREE.Vector2(3.6, -0.25),
  new THREE.Vector2(3.6, 0.25),
  new THREE.Vector2(1.4, 0.25),
  new THREE.Vector2(1.4, -0.25),
]

class HangarModelBoundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}

function LoadedHangarModel({
  id,
  position,
  rotation,
  scale = 1,
}: {
  id: ModelId
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
}) {
  const scene = useModel(id)
  return <primitive object={scene} position={position} rotation={rotation} scale={scale} />
}

function SafeHangarModel({
  id,
  fallback = null,
  ...props
}: {
  id: ModelId
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
  fallback?: ReactNode
}) {
  return (
    <HangarModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedHangarModel id={id} {...props} />
      </Suspense>
    </HangarModelBoundary>
  )
}

function ServiceTowersFallback() {
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 7, 0, -4]}>
          <mesh position-y={9} castShadow>
            <boxGeometry args={[0.9, 18, 0.9]} />
            <meshStandardMaterial color="#2a2c30" metalness={0.6} roughness={0.6} />
          </mesh>
          {[2, 6, 10, 14].map((y) => (
            <mesh key={y} position={[-s * 0.9, y, 0]}>
              <boxGeometry args={[1.8, 0.1, 0.5]} />
              <meshStandardMaterial color="#34363b" metalness={0.5} roughness={0.6} />
            </mesh>
          ))}
          <mesh position-y={17.6}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshBasicMaterial color="#d0533f" />
          </mesh>
        </group>
      ))}
    </>
  )
}

/** `topY` is the highest point of the rocket in scene units; the crane rail hangs above it */
function Hangar({ topY }: { topY: number }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[80, 60]} />
        <meshStandardMaterial color="#16181c" roughness={0.78} metalness={0.15} />
      </mesh>
      <gridHelper args={[80, 40, '#2a2620', '#1c1f25']} position-y={0.01} />
      <SafetyMarkings />
      {/* the launch table: a thick ring on legs, with a hole for the exhaust, over a scorched trench */}
      <mesh position-y={0.02} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[2.6, 48]} />
        <meshStandardMaterial color="#0a0b0d" roughness={0.95} metalness={0.05} />
      </mesh>
      <mesh position-y={TABLE_Y} castShadow receiveShadow>
        <latheGeometry args={[TABLE_PROFILE, 64]} />
        <meshStandardMaterial color="#2b2d31" roughness={0.62} metalness={0.55} side={THREE.DoubleSide} />
      </mesh>
      {/* painted Kapton safety band on the table's rim: matte, lit by the room */}
      <mesh position-y={TABLE_Y + 0.255} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[3.2, 3.55, 96]} />
        <meshStandardMaterial color={ACCENT_DIM} roughness={0.8} metalness={0} />
      </mesh>
      {[
        [-2.4, -2.4],
        [2.4, -2.4],
        [-2.4, 2.4],
        [2.4, 2.4],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, TABLE_Y / 2, z]} castShadow>
          <boxGeometry args={[0.42, TABLE_Y, 0.42]} />
          <meshStandardMaterial color="#2a2c30" metalness={0.55} roughness={0.6} />
        </mesh>
      ))}
      {/* back wall with ribs, as in the other factory rooms */}
      <mesh position={[0, 14, -14]}>
        <planeGeometry args={[80, 32]} />
        <meshStandardMaterial color="#121418" roughness={0.9} />
      </mesh>
      {[-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[i * 6, 14, -13.8]}>
          <boxGeometry args={[0.5, 32, 0.6]} />
          <meshStandardMaterial color="#1b1d22" roughness={0.85} />
        </mesh>
      ))}
      {/* NASA launch gantry framing the vehicle bay + astronaut technician for scale */}
      {/* the plain service towers, not the full gantry: its platforms would hide the fairing in the close-ups */}
      <ServiceTowersFallback />
      <SafeHangarModel id="model.env-astronaut" position={[4.35, 0, 2.6]} rotation={[0, -0.55, 0]} scale={1.15} />
      {/* the crane rail and hook above the rocket */}
      <mesh position={[0, Math.max(18, topY + 4), 0]}>
        <boxGeometry args={[26, 0.5, 0.7]} />
        <meshStandardMaterial color="#2d2f34" metalness={0.6} roughness={0.55} />
      </mesh>
      <mesh position={[0, Math.max(18, topY + 4) - 0.6, 0]}>
        <boxGeometry args={[1.4, 0.6, 1]} />
        <meshStandardMaterial color={ACCENT} roughness={0.6} metalness={0.1} />
      </mesh>
      {[-14, -5, 5, 14].map((x) => (
        <mesh key={x} position={[x, 19.5, 2]}>
          <boxGeometry args={[6, 0.1, 0.5]} />
          <meshBasicMaterial color="#f3e3c4" />
        </mesh>
      ))}
    </group>
  )
}

function Lights() {
  const key = useRef<THREE.DirectionalLight>(null)
  useEffect(() => {
    const l = key.current
    if (!l) return
    l.shadow.mapSize.set(2048, 2048)
    const c = l.shadow.camera
    c.left = -14
    c.right = 14
    c.top = 20
    c.bottom = -4
    c.near = 1
    c.far = 60
    l.shadow.bias = -0.0004
    c.updateProjectionMatrix()
  }, [])
  return (
    <>
      {/* tungsten key from the roof lamps, a cool fluorescent fill, a low sodium kicker */}
      <ambientLight intensity={0.22} color="#b8b4ac" />
      <hemisphereLight args={['#d6dde6', '#1a1610', 0.42]} />
      <directionalLight ref={key} position={[8, 16, 9]} intensity={3.2} color="#ffdcb0" castShadow />
      <pointLight position={[-9, 5, 6]} intensity={60} distance={28} color="#cfdde6" />
      <pointLight position={[8, 3, -6]} intensity={40} distance={24} color="#ffb060" />
    </>
  )
}

/* ---------------- slot tags ---------------- */

/** Where a slot's tag sits on the rocket, in body radii */
function tagHeight(p: PlacedPart): number {
  if (p.slot === 'engine') return 1.2
  if (p.slot === 'fins') return p.y + p.part.height * 0.4
  if (p.slot === 'boosters') return p.y + p.part.height * 0.5
  return p.y + p.part.height / 2
}

/** World position of a slot's tag; `lift` raises the whole rocket */
function tagPosition(p: PlacedPart, lift: number): [number, number, number] {
  const right = p.slot === 'fins' || p.slot === 'boosters'
  return [right ? 3.4 : -3.4, lift + tagHeight(p) * S, 0]
}

/**
 * Projects each tag's anchor to the screen and moves its DOM element there. The tags
 * themselves live outside the Canvas (see TagOverlay), so tearing the Canvas down
 * never has to remove DOM nodes it does not own (drei <Html> did, and threw
 * "removeChild ... not a child of this node" on leaving the step).
 */
function TagProjector({ anchors, elements }: { anchors: [number, number, number][]; elements: RefObject<(HTMLDivElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    const els = elements.current
    if (!els) return
    anchors.forEach((a, idx) => {
      const el = els[idx]
      if (!el) return
      v.set(a[0], a[1], a[2]).project(camera)
      if (v.z > 1) {
        el.style.visibility = 'hidden'
        return
      }
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`
      el.style.visibility = 'visible'
    })
  })
  return null
}

function TagOverlay({
  placed,
  activeSlot,
  elements,
  onHover,
  onClick,
}: {
  placed: PlacedPart[]
  activeSlot: RocketSlot | null
  elements: RefObject<(HTMLDivElement | null)[]>
  onHover: (s: RocketSlot | null) => void
  onClick: (s: RocketSlot) => void
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {placed.map((p, idx) => {
        const right = p.slot === 'fins' || p.slot === 'boosters'
        const color = slotColor[p.slot]
        const active = activeSlot === p.slot
        return (
          <div
            key={`tag:${p.slot}`}
            ref={(el) => {
              elements.current[idx] = el
            }}
            className="invisible absolute left-0 top-0"
          >
            <button
              type="button"
              onMouseEnter={() => onHover(p.slot)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onClick(p.slot)}
              className={`pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-[2px] border px-2 py-1 font-mono text-[11px] font-medium transition-colors`}
              style={{
                borderColor: active ? ACCENT : '#3a4254',
                color: active ? '#ede6d6' : '#b9b2a3',
                background: active ? 'rgba(42,30,12,0.94)' : 'rgba(11,14,20,0.86)',
                flexDirection: right ? 'row-reverse' : 'row',
              }}
            >
              <span className="h-2 w-2 flex-none" style={{ background: color }} />
              <span>
                <span style={{ color: '#948d7f' }}>{slotTitle[p.slot]}: </span>
                {p.part.label}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Painted hazard dashes and walkway lines on the hangar floor */
function SafetyMarkings() {
  const stripes = useMemo(() => {
    const out: { x: number; z: number; r: number }[] = []
    // a square keep-out border round the launch table, made of short diagonal dashes
    const half = 5.4
    for (let i = -half; i <= half + 0.01; i += 0.9) {
      out.push({ x: i, z: -half, r: 0 }, { x: i, z: half, r: 0 }, { x: -half, z: i, r: Math.PI / 2 }, { x: half, z: i, r: Math.PI / 2 })
    }
    return out
  }, [])
  return (
    <group position-y={0.015}>
      {stripes.map((st, i) => (
        <mesh key={i} position={[st.x, 0, st.z]} rotation={[-Math.PI / 2, 0, st.r + 0.6]}>
          <planeGeometry args={[0.16, 0.6]} />
          <meshStandardMaterial color={ACCENT_DIM} roughness={0.85} />
        </mesh>
      ))}
      {[-7.2, 7.2].map((x) => (
        <mesh key={x} position={[x, 0, 6]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.12, 20]} />
          <meshStandardMaterial color="#8a8270" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------- camera ---------------- */

type Controls = ComponentRef<typeof OrbitControls>

/** Where the camera looks and how far it stands back, in scene units */
interface Goal {
  target: THREE.Vector3
  dist: number
}

/** The carry is filmed from the front left, the side the deployer comes from: the gantry stands on the right */
const CARRY_VIEW = new THREE.Vector3(-1.6, 0.35, 0.9).normalize()

/**
 * Orbit controls that glide to a goal: the moving payload while it is carried in (every frame,
 * from a fixed side), else the focused part for a moment after the focus changes, then the
 * player's to turn and zoom.
 */
function CameraRig({ follow, still }: { follow: RefObject<Goal | null>; still: Goal }) {
  const controls = useRef<Controls>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const settle = useRef(1.6)
  const key = `${still.target.x.toFixed(2)},${still.target.y.toFixed(2)},${still.dist.toFixed(2)}`

  useEffect(() => {
    settle.current = 1.6
  }, [key])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    const goal = follow.current ?? (settle.current > 0 ? still : null)
    if (!follow.current && settle.current > 0) settle.current -= dt
    if (goal) {
      const k = 1 - Math.exp(-dt * (follow.current ? 4.5 : 4))
      c.target.lerp(goal.target, k)
      if (follow.current) {
        camera.position.lerp(c.target.clone().addScaledVector(CARRY_VIEW, goal.dist), k)
      } else {
        const dir = camera.position.clone().sub(c.target)
        const d = dir.length()
        dir.setLength(d + (goal.dist - d) * k)
        camera.position.copy(c.target).add(dir)
      }
    }
    c.update()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={0.5}
      maxPolarAngle={Math.PI / 2 - 0.04}
      minDistance={1.2}
      maxDistance={60}
    />
  )
}

/* ---------------- the payload ---------------- */

/** The carry, in seconds: wait on the floor, rise beside the rocket, swing over, lower into the fairing */
const LOAD = { hold: 0.8, rise: 3.4, over: 4.6, lower: 6.0, end: 6.6, open: 4.0 }

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

/** Where the deployer is `t` seconds into the carry */
function payloadAt(t: number, start: THREE.Vector3, high: number, seat: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  if (t < LOAD.rise) {
    const k = ease((t - LOAD.hold) / (LOAD.rise - LOAD.hold))
    return out.set(start.x, start.y + (high - start.y) * k, start.z)
  }
  if (t < LOAD.over) {
    const k = ease((t - LOAD.rise) / (LOAD.over - LOAD.rise))
    return out.set(start.x * (1 - k), high, start.z * (1 - k))
  }
  const k = ease((t - LOAD.over) / (LOAD.lower - LOAD.over))
  return out.set(0, high + (seat.y - high) * k, 0)
}

function Payload({
  loading,
  speed,
  seat,
  high,
  wideY,
  wideDist,
  follow,
  tagEl,
  onOpen,
  onLoaded,
}: {
  loading: boolean
  speed: number
  seat: THREE.Vector3
  high: number
  /** The whole-rocket shot the carry starts from */
  wideY: number
  wideDist: number
  follow: RefObject<Goal | null>
  tagEl: RefObject<HTMLDivElement | null>
  onOpen: () => void
  onLoaded: () => void
}) {
  const root = useModel(DEPLOYER)
  const group = useRef<THREE.Group>(null)
  const time = useRef(0)
  const fired = useRef({ open: false, end: false })
  // on the hangar floor, front left of the launch table
  const start = useMemo(() => new THREE.Vector3(-3.6, 0.12, 3.2), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const goal = useMemo<Goal>(() => ({ target: new THREE.Vector3(), dist: 14 }), [])

  useEffect(() => {
    time.current = 0
    fired.current = { open: false, end: false }
    return () => {
      follow.current = null
    }
  }, [loading, follow])

  useFrame(({ camera, size }, dt) => {
    if (loading) {
      // a slow or hidden frame must not skip the carry
      time.current += Math.min(dt, 1 / 20) * speed
      const t = time.current
      payloadAt(t, start, high, seat, pos)
      // the camera follows: the whole rocket while the craft waits on the floor, close as it goes in
      const near = ease((t - LOAD.hold) / (LOAD.over - LOAD.hold))
      const wide = Math.max(0, 1 - near)
      goal.target.set(pos.x * near, pos.y * near + wideY * wide, pos.z * near)
      goal.dist = wideDist + (4.2 - wideDist) * near
      follow.current = goal
      if (t >= LOAD.open && !fired.current.open) {
        fired.current.open = true
        onOpen()
      }
      if (t >= LOAD.end && !fired.current.end) {
        fired.current.end = true
        follow.current = null
        onLoaded()
      }
    } else {
      pos.copy(seat)
    }
    group.current?.position.copy(pos)
    const el = tagEl.current
    if (el) {
      v.set(pos.x, pos.y + 0.32, pos.z).project(camera)
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
      el.style.visibility = v.z > 1 ? 'hidden' : 'visible'
    }
  })

  return (
    <group ref={group}>
      {/* the deployer stands upright, door up, as it rides on the adapter */}
      <group scale={DEPLOYER_SCALE / M_PER_UNIT} rotation-x={-Math.PI / 2}>
        <primitive object={root} />
      </group>
      {/* a warm work light so the small box reads against the big rocket */}
      <pointLight position={[0.25, 0.3, 0.25]} intensity={3} distance={2.2} color={ACCENT} />
    </group>
  )
}

/* ---------------- the scene ---------------- */

/** Mounts only once everything in its Suspense boundary has loaded */
function Ready({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.()
  }, [onReady])
  return null
}

type Layout = ReturnType<typeof layoutRocket>
/** The engine bells hang below the core's base: lift the whole rocket so they clear the table */
const liftOf = (layout: Layout) => TABLE_Y + 0.26 + GAP - layout.bottom * S

/** Height the camera looks at for one part, in body radii above the core's base */
function focusHeight(p: PlacedPart): number {
  if (p.slot === 'engine') return 0
  return tagHeight(p)
}

function Rocket({
  layout,
  activeSlot,
  onSlotHover,
  onSlotClick,
  payload,
  speed,
  focus,
  onLoaded,
  onReady,
  tagEls,
  payloadTag,
}: ViewProps & { layout: Layout; tagEls: RefObject<(HTMLDivElement | null)[]>; payloadTag: RefObject<HTMLDivElement | null> }) {
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const lift = liftOf(layout)
  const anchors = useMemo(() => layout.placed.map((p) => tagPosition(p, lift)), [layout, lift])
  const nose = layout.placed.find((p) => p.slot === 'nose')
  const seat = useMemo(() => new THREE.Vector3(0, lift + (nose ? nose.y : layout.top - 3) * S + 0.12, 0), [lift, nose, layout.top])
  const high = lift + layout.top * S + 1.2
  const follow = useRef<Goal | null>(null)
  const wholeDist = Math.max(16, ((layout.top - layout.bottom + 2) * S * 1.3) / (2 * Math.tan(THREE.MathUtils.degToRad(35 / 2))))
  // the fairing turns see-through as the craft goes in, and stays so once it is inside
  const [opened, setOpened] = useState(false)
  const open = payload === 'inside' || opened

  const still = useMemo<Goal>(() => {
    if (focus === 'payload') return { target: new THREE.Vector3(0, seat.y + 0.4, 0), dist: 4.2 }
    const part = focus === 'whole' ? undefined : layout.placed.find((p) => p.slot === focus)
    if (part) return { target: new THREE.Vector3(0, lift + focusHeight(part) * S, 0), dist: Math.max(6, part.part.height * S * 2.6) }
    return { target: new THREE.Vector3(0, lift + ((layout.top + layout.bottom) / 2) * S, 0), dist: wholeDist }
  }, [focus, seat, layout, lift, wholeDist])

  return (
    <>
      <Hangar topY={lift + layout.top * S} />
      <CameraRig follow={follow} still={still} />
      {/* One boundary for the rocket and the craft, so they appear together and onReady fires once both are in */}
      <Suspense fallback={null}>
        <group position-y={lift}>
          {layout.placed.map((p) => (
            <PartModel
              key={`${p.slot}:${p.part.id}`}
              placed={p}
              ghost={p.slot === 'nose' && open}
              highlighted={activeSlot === p.slot}
              reduced={reduced}
              onHover={onSlotHover}
              onClick={onSlotClick}
            />
          ))}
        </group>
        <Payload
          loading={payload === 'loading'}
          speed={speed ?? 1}
          seat={seat}
          high={high}
          wideY={(lift + ((layout.top + layout.bottom) / 2) * S) * 0.75}
          wideDist={wholeDist}
          follow={follow}
          tagEl={payloadTag}
          onOpen={() => setOpened(true)}
          onLoaded={onLoaded}
        />
        <Ready onReady={onReady} />
      </Suspense>
      <TagProjector anchors={anchors} elements={tagEls} />
    </>
  )
}

export function RocketBay(props: ViewProps) {
  const layout = useMemo(() => layoutRocket(props.config), [props.config])
  const tagEls = useRef<(HTMLDivElement | null)[]>([])
  const payloadTag = useRef<HTMLDivElement | null>(null)
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 35, position: [-14, 9, 24], near: 0.05, far: 200 }}
        gl={{ antialias: true }}
        onCreated={({ scene, gl }) => {
          scene.background = new THREE.Color('#0d0e10')
          scene.fog = new THREE.Fog('#0d0e10', 40, 90)
          const pmrem = new THREE.PMREMGenerator(gl)
          scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
          scene.environmentIntensity = 0.55
          pmrem.dispose()
        }}
      >
        <Lights />
        <Rocket {...props} layout={layout} tagEls={tagEls} payloadTag={payloadTag} />
        <Effects preset="interior" />
      </Canvas>
      <TagOverlay placed={layout.placed} activeSlot={props.activeSlot} elements={tagEls} onHover={props.onSlotHover} onClick={props.onSlotClick} />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div ref={payloadTag} className="invisible absolute left-0 top-0">
          <span
            className="flex items-center gap-2 whitespace-nowrap rounded-[2px] border px-2 py-1 font-mono text-[11px] font-medium"
            style={{ borderColor: ACCENT, color: '#ede6d6', background: 'rgba(42,30,12,0.94)' }}
          >
            <span className="h-2 w-2 flex-none" style={{ background: ACCENT }} />
            Your CubeSat, in its deployer
          </span>
        </div>
      </div>
    </div>
  )
}
