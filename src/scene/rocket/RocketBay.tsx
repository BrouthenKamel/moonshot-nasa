import { Component, Suspense, useEffect, useMemo, useRef, type ComponentRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { ModelId } from '../../assets/manifest'
import { preloadModel, useModel } from '../../assets/models'
import { rocketParts, rocketSlots, type RocketConfig, type RocketPart, type RocketSlot } from '../../data/rocket'
import { layoutRocket, type PlacedPart } from '../../viz/rocket/rocketView'
import { prefersReducedMotion } from '../space/quality'

/**
 * The Rocket step's assembly hall: the player's rocket stands on a pad, built from the kit parts.
 * A part that is picked drops in from the crane; the stack settles under it. Clicking a part
 * (or its tag) picks that slot in the tray. Everything drawn comes from layoutRocket().
 */

/** Scene units per body radius */
const S = 0.55
const ACCENT = '#f97316'
/** Height of the launch table's top above the floor, in scene units: the exhaust passes through its hole */
const TABLE_Y = 3
/** Clearance between the engine bells and the table top */
const GAP = 0.2
/** How far above its place a new part starts, in body radii */
const DROP = 12

for (const p of rocketParts) if (p.model) preloadModel(p.model)

const slotColor = Object.fromEntries(rocketSlots.map((s) => [s.id, s.color])) as Record<RocketSlot, string>
const slotTitle = Object.fromEntries(rocketSlots.map((s) => [s.id, s.title])) as Record<RocketSlot, string>
const SLOT_INDEX = Object.fromEntries(rocketSlots.map((s, i) => [s.id, i])) as Record<RocketSlot, number>

/** How far each slot moves apart in the exploded view, in body radii (up is positive) */
const EXPLODE: Record<RocketSlot, number> = { engine: -3.2, stage1: 0, stage2: 3.5, nose: 7, fins: -1.6, boosters: 0 }

interface ViewProps {
  config: RocketConfig
  exploded: boolean
  firing: boolean
  activeSlot: RocketSlot | null
  onSlotHover: (slot: RocketSlot | null) => void
  onSlotClick: (slot: RocketSlot) => void
}

/* ---------------- one part ---------------- */

function PartModel({
  placed,
  exploded,
  highlighted,
  reduced,
  onHover,
  onClick,
}: {
  placed: PlacedPart
  exploded: boolean
  highlighted: boolean
  reduced: boolean
  onHover: (slot: RocketSlot | null) => void
  onClick: (slot: RocketSlot) => void
}) {
  const { part, slot } = placed
  const root = useModel(part.model!)
  // Own copies of the materials, so highlighting one part never tints another
  const { obj, materials } = useMemo(() => {
    const mats: THREE.MeshStandardMaterial[] = []
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const own = (m: THREE.Material) => {
        const c = m.clone() as THREE.MeshStandardMaterial
        mats.push(c)
        return c
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material)
    })
    return { obj: root, materials: mats }
  }, [root])

  const group = useRef<THREE.Group>(null)
  const state = useRef({ y: placed.y, drop: reduced ? 0 : DROP, wait: reduced ? 0 : 0.14 * SLOT_INDEX[slot], explode: 0 })
  const color = useMemo(() => new THREE.Color(slotColor[slot]), [slot])

  useFrame((frame, dt) => {
    const s = state.current
    const k = reduced ? 1 : 1 - Math.exp(-dt * 8)
    s.y += (placed.y - s.y) * k
    s.explode += ((exploded ? EXPLODE[slot] : 0) - s.explode) * (reduced ? 1 : 1 - Math.exp(-dt * 5))
    if (s.wait > 0) s.wait -= dt
    else s.drop += (0 - s.drop) * (reduced ? 1 : 1 - Math.exp(-dt * 4.5))
    const g = group.current
    if (g) {
      g.position.y = (s.y + s.explode + s.drop) * S
      g.visible = s.wait <= 0
    }
    const glow = highlighted ? 0.3 + 0.18 * Math.sin(frame.clock.elapsedTime * 5) : 0
    for (const m of materials) {
      m.emissive.copy(color)
      m.emissiveIntensity = glow
    }
  })

  return (
    <group
      ref={group}
      scale={S}
      visible={false}
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
            <meshStandardMaterial color="#1c2638" metalness={0.7} roughness={0.5} />
          </mesh>
          {[2, 6, 10, 14].map((y) => (
            <mesh key={y} position={[-s * 0.9, y, 0]}>
              <boxGeometry args={[1.8, 0.1, 0.5]} />
              <meshStandardMaterial color="#26334a" metalness={0.6} />
            </mesh>
          ))}
          <mesh position-y={17.6}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshBasicMaterial color="#ef4444" />
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
        <meshStandardMaterial color="#0c1322" roughness={0.45} metalness={0.5} />
      </mesh>
      <gridHelper args={[80, 80, '#3a2410', '#101a2e']} position-y={0.01} />
      {/* the launch table: a thick ring on legs, with a hole for the exhaust, over a scorched trench */}
      <mesh position-y={0.02} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[2.6, 48]} />
        <meshStandardMaterial color="#05070b" roughness={0.9} metalness={0.2} />
      </mesh>
      <mesh position-y={TABLE_Y} castShadow receiveShadow>
        <latheGeometry args={[TABLE_PROFILE, 64]} />
        <meshStandardMaterial color="#1a2438" roughness={0.5} metalness={0.7} side={THREE.DoubleSide} />
      </mesh>
      <mesh position-y={TABLE_Y + 0.26} rotation-x={Math.PI / 2}>
        <torusGeometry args={[3.5, 0.05, 8, 96]} />
        <meshBasicMaterial color={ACCENT} />
      </mesh>
      {[
        [-2.4, -2.4],
        [2.4, -2.4],
        [-2.4, 2.4],
        [2.4, 2.4],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, TABLE_Y / 2, z]} castShadow>
          <boxGeometry args={[0.42, TABLE_Y, 0.42]} />
          <meshStandardMaterial color="#202c42" metalness={0.7} roughness={0.5} />
        </mesh>
      ))}
      {/* back wall with ribs, as in the other factory rooms */}
      <mesh position={[0, 14, -14]}>
        <planeGeometry args={[80, 32]} />
        <meshStandardMaterial color="#0a0f1c" />
      </mesh>
      {[-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[i * 6, 14, -13.8]}>
          <boxGeometry args={[0.5, 32, 0.6]} />
          <meshStandardMaterial color="#111a2c" />
        </mesh>
      ))}
      {/* NASA launch gantry framing the vehicle bay + astronaut technician for scale */}
      <SafeHangarModel id="model.env-launch-gantry" position={[0, 0, -4.5]} scale={0.9} fallback={<ServiceTowersFallback />} />
      <SafeHangarModel id="model.env-astronaut" position={[4.35, 0, 2.6]} rotation={[0, -0.55, 0]} scale={1.15} />
      {/* the crane rail and hook above the rocket */}
      <mesh position={[0, Math.max(18, topY + 4), 0]}>
        <boxGeometry args={[26, 0.5, 0.7]} />
        <meshStandardMaterial color="#1f2a3d" metalness={0.7} />
      </mesh>
      <mesh position={[0, Math.max(18, topY + 4) - 0.6, 0]}>
        <boxGeometry args={[1.4, 0.6, 1]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.3} />
      </mesh>
      {[-14, -5, 5, 14].map((x) => (
        <mesh key={x} position={[x, 19.5, 2]}>
          <boxGeometry args={[6, 0.1, 0.5]} />
          <meshBasicMaterial color="#ffe9d2" />
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
      <ambientLight intensity={0.25} color="#9fb2d8" />
      <hemisphereLight args={['#bcd0ff', '#1a1208', 0.5]} />
      <directionalLight ref={key} position={[8, 16, 9]} intensity={3.2} color="#fff1e0" castShadow />
      <pointLight position={[-9, 5, 6]} intensity={80} distance={28} color="#ff9a52" />
      <pointLight position={[8, 3, -6]} intensity={50} distance={24} color="#6ea8ff" />
    </>
  )
}

/* ---------------- engine test ---------------- */

function Plume({ firing, bottom, width }: { firing: boolean; bottom: number; width: number }) {
  const outer = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const power = useRef(0)
  useFrame((st, dt) => {
    power.current += ((firing ? 1 : 0) - power.current) * (1 - Math.exp(-dt * 9))
    const p = power.current
    const flick = 1 + 0.12 * Math.sin(st.clock.elapsedTime * 45) + 0.06 * Math.sin(st.clock.elapsedTime * 71)
    for (const m of [outer.current, inner.current]) {
      if (!m) continue
      m.visible = p > 0.02
      m.scale.set(p, p * flick, p)
    }
    if (light.current) light.current.intensity = p * 200 * flick
  })
  const len = 7 * S
  return (
    <group position={[0, bottom * S, 0]}>
      {/* each cone hangs from a group at the nozzle, so the flame grows down from the engine */}
      <group ref={outer} visible={false}>
        <mesh position-y={-len / 2} rotation-x={Math.PI}>
          <coneGeometry args={[width * S, len, 32, 1, true]} />
          <meshBasicMaterial color="#ff8a3a" transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <group ref={inner} visible={false}>
        <mesh position-y={-(len * 0.7) / 2} rotation-x={Math.PI}>
          <coneGeometry args={[width * S * 0.55, len * 0.7, 32, 1, true]} />
          <meshBasicMaterial color="#fff2c9" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <pointLight ref={light} position-y={-1.2} color="#ffb067" distance={22} intensity={0} />
    </group>
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

function Tag({ placed, part, active, onHover, onClick }: { placed: PlacedPart; part: RocketPart; active: boolean; onHover: (s: RocketSlot | null) => void; onClick: (s: RocketSlot) => void }) {
  const right = placed.slot === 'fins' || placed.slot === 'boosters'
  const color = slotColor[placed.slot]
  return (
    <Html position={[right ? 3.4 : -3.4, tagHeight(placed) * S, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <button
        onMouseEnter={() => onHover(placed.slot)}
        onMouseLeave={() => onHover(null)}
        onClick={() => onClick(placed.slot)}
        className="flex items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm transition-colors"
        style={{
          pointerEvents: 'auto',
          borderColor: active ? color : `${color}77`,
          color: active ? '#fff' : '#e2e8f0',
          background: active ? `${color}55` : 'rgba(2,6,23,0.6)',
          flexDirection: right ? 'row-reverse' : 'row',
        }}
      >
        <span className="h-2 w-2 flex-none rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        <span>
          <span className="opacity-60">{slotTitle[placed.slot]}: </span>
          {part.label}
        </span>
      </button>
    </Html>
  )
}

/* ---------------- camera ---------------- */

type Controls = ComponentRef<typeof OrbitControls>

function CameraRig({ top, bottom, lift }: { top: number; bottom: number; lift: number }) {
  const controls = useRef<Controls>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const settle = useRef(1.4)
  const midY = lift + ((top + bottom) / 2) * S
  const fit = Math.max(16, ((top - bottom) * S * 1.3) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))))

  useEffect(() => {
    settle.current = 1.4
  }, [midY, fit])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    if (settle.current > 0) {
      settle.current -= dt
      const k = 1 - Math.exp(-dt * 5)
      c.target.y += (midY - c.target.y) * k
      const dir = camera.position.clone().sub(c.target)
      const d = dir.length()
      dir.setLength(d + (fit - d) * k)
      camera.position.copy(c.target).add(dir)
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
      autoRotate
      autoRotateSpeed={0.55}
      minPolarAngle={0.5}
      maxPolarAngle={Math.PI / 2 - 0.04}
      minDistance={7}
      maxDistance={60}
      target={[0, midY, 0]}
    />
  )
}

/* ---------------- the scene ---------------- */

function Rocket({ config, exploded, firing, activeSlot, onSlotHover, onSlotClick }: ViewProps) {
  const layout = useMemo(() => layoutRocket(config), [config])
  const reduced = useMemo(() => prefersReducedMotion(), [])
  /** The engine bells hang below the core's base: lift the whole rocket so they clear the table */
  const lift = TABLE_Y + 0.26 + GAP - layout.bottom * S
  const engineWidth = layout.placed.find((p) => p.slot === 'engine')!.part.engines === 9 ? 1 : 0.95
  return (
    <>
      <Hangar topY={lift + (layout.top + (exploded ? EXPLODE.nose : 0)) * S} />
      <CameraRig top={exploded ? layout.top + EXPLODE.nose : layout.top} bottom={exploded ? layout.bottom + EXPLODE.engine : layout.bottom} lift={lift} />
      <group position-y={lift}>
        {layout.placed.map((p) => (
          <Suspense key={`${p.slot}:${p.part.id}`} fallback={null}>
            <PartModel
              placed={p}
              exploded={exploded}
              highlighted={activeSlot === p.slot}
              reduced={reduced}
              onHover={onSlotHover}
              onClick={onSlotClick}
            />
          </Suspense>
        ))}
        {layout.placed.map((p) => (
          <Tag key={`tag:${p.slot}`} placed={p} part={p.part} active={activeSlot === p.slot} onHover={onSlotHover} onClick={onSlotClick} />
        ))}
        <Plume firing={firing} bottom={layout.bottom} width={engineWidth} />
      </group>
    </>
  )
}

export function RocketBay(props: ViewProps) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 35, position: [14, 9, 24], near: 0.1, far: 200 }}
        gl={{ antialias: true }}
        onCreated={({ scene, gl }) => {
          scene.background = new THREE.Color('#05080f')
          scene.fog = new THREE.Fog('#05080f', 40, 90)
          const pmrem = new THREE.PMREMGenerator(gl)
          scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
          scene.environmentIntensity = 0.55
          pmrem.dispose()
        }}
      >
        <Lights />
        <Rocket {...props} />
      </Canvas>
    </div>
  )
}
