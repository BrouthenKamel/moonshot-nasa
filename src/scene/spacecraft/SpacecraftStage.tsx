import { Suspense, useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { preloadModel, useModel } from '../../assets/models'
import { kitModel, type Vec3 } from '../../data/craftKit'
import { allCraftParts, craftLabel, type CraftInstance, type CraftSlot } from '../../viz/spacecraft/craftBuild'
import { prefersReducedMotion } from '../space/quality'

/**
 * The spacecraft step's assembly bay: the 6U craft hovers over a turntable in a dark bay, built from
 * the kit's real hardware models. Parts fly in when a choice changes, and the view can explode, deploy
 * the wings and close the panels. Real scale, metres: the camera does the enlarging.
 */

const ACCENT = '#8b5cf6'
/** The craft hovers with its centre here, above the turntable */
const CRAFT_CENTRE: Vec3 = [0, 0.42, 0]

for (const id of allCraftParts()) preloadModel(kitModel(id))

export type ViewPreset = 'closeup' | 'overview' | 'avionics' | 'propulsion' | 'payload'

interface Pose {
  pos: Vec3
  target: Vec3
}
const c = CRAFT_CENTRE
const at = (dx: number, dy: number, dz: number): Vec3 => [c[0] + dx, c[1] + dy, c[2] + dz]
/** Where the camera sits for each preset, and what it looks at */
export const VIEW_POSES: Record<ViewPreset, Pose> = {
  // the body fills the screen, wings running off the sides
  closeup: { pos: at(0.34, 0.23, 0.46), target: at(0.0, -0.004, 0.01) },
  overview: { pos: at(0.7, 0.42, 1.15), target: at(0, 0.01, 0) },
  avionics: { pos: at(-0.3, 0.24, 0.4), target: at(-0.05, -0.005, 0.0) },
  propulsion: { pos: at(0.36, 0.13, -0.55), target: at(0.05, -0.005, -0.12) },
  payload: { pos: at(0.2, 0.1, 0.58), target: at(-0.005, 0, 0.13) },
}

const slotColor: Record<CraftSlot, string> = {
  structure: '#94a3b8',
  solar: '#3b82f6',
  battery: '#22c55e',
  computer: '#a855f7',
  attitude: '#f97316',
  propulsion: '#eab308',
  instrument: '#c084fc',
  radio: '#60a5fa',
  bus: '#94a3b8',
}

export interface StageProps {
  craft: CraftInstance[]
  /** 0 = together, 1 = fully exploded */
  explode: number
  deployed: boolean
  panels: boolean
  view: ViewPreset
  /** Colour of the turntable ring: the mass check's colour */
  ringColor: string
  activeSlot: CraftSlot | null
  onHover: (slot: CraftSlot | null) => void
  onSelect: (slot: CraftSlot) => void
}

/* ---------------- a craft part ---------------- */

interface Hinge {
  node: THREE.Object3D
  stowed: THREE.Euler
  deployed: THREE.Euler
}

function CraftPart({
  inst,
  index,
  stagger,
  props,
  reduced,
}: {
  inst: CraftInstance
  index: number
  /** The first build of the craft lands part by part; a part swapped in later just flies in */
  stagger: boolean
  props: StageProps
  reduced: boolean
}) {
  const root = useModel(kitModel(inst.part))
  const prepared = useMemo(() => {
    const hinges: Hinge[] = []
    const mats: Array<{ m: THREE.MeshStandardMaterial; emissive: THREE.Color; intensity: number; skip: boolean }> = []
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      const stowed = o.userData?.stowed as number[] | undefined
      if (Array.isArray(stowed) && stowed.length === 3) hinges.push({ node: o, stowed: new THREE.Euler(stowed[0], stowed[1], stowed[2]), deployed: o.rotation.clone() })
      if (!mesh.isMesh) return
      mesh.castShadow = true
      const own = (m: THREE.Material) => {
        const k = m.clone() as THREE.MeshStandardMaterial
        // lights and glows already carry their own emissive: leave them alone
        const glows = /glow|laser|led/i.test(k.name) || (k.emissive && k.emissive.getHex() !== 0)
        mats.push({ m: k, emissive: k.emissive.clone(), intensity: k.emissiveIntensity, skip: !!glows })
        return k
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material)
    })
    return { hinges, mats }
  }, [root])

  // Hide the nodes this build leaves out (a wing's extra panels, a face panel), and bring back any it no longer does
  const hiddenNow = inst.hidden.join('|')
  const hiddenBefore = useRef<string[]>([])
  useEffect(() => {
    const now = hiddenNow ? hiddenNow.split('|') : []
    root.traverse((o) => {
      if (now.includes(o.name)) o.visible = false
      else if (hiddenBefore.current.includes(o.name)) o.visible = true
    })
    hiddenBefore.current = now
  }, [root, hiddenNow])

  const group = useRef<THREE.Group>(null)
  const state = useRef({
    fly: reduced ? 0 : 1,
    wait: reduced || !stagger ? 0 : Math.min(0.07 * index, 1.4),
    open: reduced ? 1 : 0,
    explode: 0,
    scale: inst.scale,
  })
  const flyDir = useMemo(() => new THREE.Vector3(...inst.explode.dir).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.45, 0.2)), [inst.explode.dir])
  const color = useMemo(() => new THREE.Color(slotColor[inst.slot]), [inst.slot])
  const highlighted = props.activeSlot === inst.slot && inst.slot !== 'structure' && inst.slot !== 'bus'

  useFrame((frame, dt) => {
    const s = state.current
    const g = group.current
    if (!g) return
    const ease = (k: number) => (reduced ? 1 : 1 - Math.exp(-dt * k))
    if (s.wait > 0) s.wait -= dt
    else s.fly += (0 - s.fly) * ease(4.2)
    s.explode += (props.explode - s.explode) * ease(5)
    s.scale += (inst.scale - s.scale) * ease(8)
    const openTarget = props.deployed && !inst.foldedAlways ? 1 : 0
    s.open += (openTarget - s.open) * ease(3.2)

    const e = s.explode * 1.5
    g.visible = s.wait <= 0 && (!inst.panel || props.panels)
    g.position.set(
      inst.position[0] + inst.explode.dir[0] * inst.explode.dist * e + flyDir.x * s.fly,
      inst.position[1] + inst.explode.dir[1] * inst.explode.dist * e + flyDir.y * s.fly,
      inst.position[2] + inst.explode.dir[2] * inst.explode.dist * e + flyDir.z * s.fly
    )
    g.scale.setScalar(s.scale)
    for (const h of prepared.hinges) {
      h.node.rotation.set(
        h.stowed.x + (h.deployed.x - h.stowed.x) * s.open,
        h.stowed.y + (h.deployed.y - h.stowed.y) * s.open,
        h.stowed.z + (h.deployed.z - h.stowed.z) * s.open
      )
    }
    const glow = highlighted ? 0.22 + 0.14 * Math.sin(frame.clock.elapsedTime * 5) : 0
    for (const m of prepared.mats) {
      if (m.skip) continue
      if (glow > 0) {
        m.m.emissive.copy(color)
        m.m.emissiveIntensity = glow
      } else {
        m.m.emissive.copy(m.emissive)
        m.m.emissiveIntensity = m.intensity
      }
    }
  })

  const interactive = inst.slot !== 'structure' && inst.slot !== 'bus'
  return (
    <group
      ref={group}
      position={inst.position}
      rotation={new THREE.Euler(inst.rotation[0], inst.rotation[1], inst.rotation[2], 'XYZ')}
      visible={false}
      onPointerOver={
        interactive
          ? (e) => {
              e.stopPropagation()
              props.onHover(inst.slot)
            }
          : undefined
      }
      onPointerOut={interactive ? () => props.onHover(null) : undefined}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation()
              props.onSelect(inst.slot)
            }
          : undefined
      }
    >
      <primitive object={root} />
    </group>
  )
}

/** Which parts get a name tag: one per choice the player can read in the tray */
const TAG_KEYS: Record<string, CraftSlot> = {
  wing_py: 'solar',
  battery: 'battery',
  obc: 'computer',
  rw_cluster: 'attitude',
  wheel: 'attitude',
  engine: 'propulsion',
  transponder: 'radio',
  uhf: 'radio',
}

function TagProjector({
  tags,
  floater,
  elements,
}: {
  tags: CraftInstance[]
  floater: RefObject<THREE.Group | null>
  elements: RefObject<(HTMLDivElement | null)[]>
}) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    const els = elements.current
    if (!els) return
    const floaterY = floater.current?.position.y ?? CRAFT_CENTRE[1]
    tags.forEach((i, idx) => {
      const el = els[idx]
      if (!el) return
      v.set(i.position[0], floaterY + i.position[1] + 0.045, i.position[2]).project(camera)
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

function TagOverlay({ tags, tagEls, props }: { tags: CraftInstance[]; tagEls: RefObject<(HTMLDivElement | null)[]>; props: StageProps }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {tags.map((i, idx) => {
        const slot = i.slot
        const color = slotColor[slot]
        const active = props.activeSlot === slot
        return (
          <div
            key={`tag:${i.key}`}
            ref={(el) => {
              tagEls.current[idx] = el
            }}
            className="invisible absolute left-0 top-0"
          >
            <button
              type="button"
              onMouseEnter={() => props.onHover(slot)}
              onMouseLeave={() => props.onHover(null)}
              onClick={() => props.onSelect(slot)}
              aria-label={craftLabel(i.from)}
              className="pointer-events-auto flex items-center gap-1.5 whitespace-nowrap rounded-full border text-[10px] font-semibold backdrop-blur-sm transition-all"
              style={{
                borderColor: active ? color : `${color}aa`,
                color: '#fff',
                background: active ? `${color}cc` : 'rgba(2,6,23,0.55)',
                padding: active ? '2px 8px 2px 6px' : '0',
                width: active ? 'auto' : 14,
                height: active ? 'auto' : 14,
                justifyContent: 'center',
              }}
            >
              <span className="h-2 w-2 flex-none rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
              {active && craftLabel(i.from).replace(/\s*\(.*\)$/, '')}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- the bay ---------------- */

function Bay({ ringColor, reduced }: { ringColor: string; reduced: boolean }) {
  const ring = useRef<THREE.MeshBasicMaterial>(null)
  const beam = useRef<THREE.MeshBasicMaterial>(null)
  const accent = useRef<THREE.PointLight>(null)
  useFrame((st) => {
    if (ring.current) ring.current.color.set(ringColor)
    if (beam.current) beam.current.opacity = 0.07 + (reduced ? 0 : 0.025 * Math.sin(st.clock.elapsedTime * 1.6))
    if (accent.current) accent.current.color.set(ringColor === '#ef4444' ? '#ef4444' : ACCENT)
  })
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[40, 30]} />
        <meshStandardMaterial color="#0b1220" roughness={0.3} metalness={0.55} />
      </mesh>
      <gridHelper args={[40, 120, '#2e1f5e', '#101a2e']} position-y={0.002} />
      <mesh position={[0, 3, -2.4]}>
        <planeGeometry args={[40, 8]} />
        <meshStandardMaterial color="#0a0f1c" />
      </mesh>
      {[-7, -5, -3, -1, 1, 3, 5, 7].map((x) => (
        <mesh key={x} position={[x * 0.9, 3, -2.3]}>
          <boxGeometry args={[0.1, 8, 0.12]} />
          <meshStandardMaterial color="#111a2c" />
        </mesh>
      ))}
      {[-3.4, 0, 3.4].map((x) => (
        <mesh key={x} position={[x, 3.4, 0.2]}>
          <boxGeometry args={[2, 0.03, 0.2]} />
          <meshBasicMaterial color="#e4dcff" />
        </mesh>
      ))}
      {/* the turntable */}
      <mesh position-y={0.04}>
        <cylinderGeometry args={[0.52, 0.58, 0.08, 64]} />
        <meshStandardMaterial color="#141d2e" metalness={0.65} roughness={0.35} />
      </mesh>
      <mesh position-y={0.085} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.5, 0.012, 8, 96]} />
        <meshBasicMaterial ref={ring} color={ringColor} toneMapped={false} />
      </mesh>
      {/* a faint beam holds the craft up */}
      <mesh position-y={0.095 + 0.15}>
        <cylinderGeometry args={[0.3, 0.46, 0.3, 48, 1, true]} />
        <meshBasicMaterial ref={beam} color="#a78bfa" transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <pointLight ref={accent} position={[-1.8, 1.8, -1.2]} intensity={9} distance={7} color={ACCENT} />
    </group>
  )
}

function Lights() {
  return (
    <>
      <ambientLight color="#8fa3c8" intensity={0.55} />
      <spotLight position={[-0.9, 2.6, 1.8]} angle={0.55} penumbra={0.6} intensity={42} distance={9} color="#e3ecff" />
      <pointLight position={[1.1, 0.9, 1.1]} intensity={4.5} distance={4} color="#9ec5ff" />
      <pointLight position={[-0.9, 0.5, -0.8]} intensity={3.2} distance={4} color="#ffd9b0" />
      <pointLight position={[0.3, -0.05, 0.4]} intensity={1.6} distance={2} color="#a78bfa" />
    </>
  )
}

/* ---------------- camera ---------------- */

type Controls = ComponentRef<typeof OrbitControls>

function CameraRig({ view }: { view: ViewPreset }) {
  const controls = useRef<Controls>(null)
  const camera = useThree((s) => s.camera)
  const anim = useRef(1.6)
  const goal = VIEW_POSES[view]
  useEffect(() => {
    anim.current = 1.6
  }, [view])
  useFrame((_, dt) => {
    const ctl = controls.current
    if (!ctl) return
    if (anim.current > 0) {
      anim.current -= dt
      const k = 1 - Math.exp(-dt * 4.5)
      camera.position.lerp(new THREE.Vector3(...goal.pos), k)
      ctl.target.lerp(new THREE.Vector3(...goal.target), k)
    }
    ctl.update()
  })
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      autoRotate={view === 'closeup' || view === 'overview'}
      autoRotateSpeed={0.4}
      minDistance={0.2}
      maxDistance={4}
      minPolarAngle={0.2}
      maxPolarAngle={Math.PI / 2 + 0.25}
      target={goal.target}
    />
  )
}

/* ---------------- the scene ---------------- */

function Scene({
  props,
  tags,
  tagEls,
}: {
  props: StageProps
  tags: CraftInstance[]
  tagEls: RefObject<(HTMLDivElement | null)[]>
}) {
  const reduced = useMemo(() => prefersReducedMotion(), [])
  // The first few seconds are the build-up; after that a swapped part flies in on its own
  const [first, setFirst] = useState(true)
  useEffect(() => {
    const t = window.setTimeout(() => setFirst(false), 4500)
    return () => window.clearTimeout(t)
  }, [])
  const floater = useRef<THREE.Group>(null)
  useFrame((st) => {
    // the craft hovers: a slow bob
    if (floater.current) floater.current.position.y = CRAFT_CENTRE[1] + (reduced ? 0 : 0.008 * Math.sin(st.clock.elapsedTime * 0.9))
  })
  return (
    <>
      <Lights />
      <Bay ringColor={props.ringColor} reduced={reduced} />
      <CameraRig view={props.view} />
      <group ref={floater} position={CRAFT_CENTRE}>
        {props.craft.map((i, n) => (
          <Suspense key={`${i.key}:${i.part}`} fallback={null}>
            <CraftPart inst={i} index={n} stagger={first} props={props} reduced={reduced} />
          </Suspense>
        ))}
      </group>
      <TagProjector tags={tags} floater={floater} elements={tagEls} />
    </>
  )
}

export function SpacecraftStage(props: StageProps) {
  const tags = useMemo(() => props.craft.filter((i) => TAG_KEYS[i.key] !== undefined || i.slot === 'instrument'), [props.craft])
  const tagEls = useRef<(HTMLDivElement | null)[]>([])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 34, position: VIEW_POSES.closeup.pos, near: 0.02, far: 60 }}
        gl={{ antialias: true }}
        onCreated={({ scene, gl }) => {
          scene.background = new THREE.Color('#03050a')
          scene.fog = new THREE.Fog('#03050a', 5, 14)
          const pmrem = new THREE.PMREMGenerator(gl)
          scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
          scene.environmentIntensity = 0.55
          pmrem.dispose()
        }}
      >
        <Scene props={props} tags={tags} tagEls={tagEls} />
      </Canvas>
      <TagOverlay tags={tags} tagEls={tagEls} props={props} />
    </div>
  )
}
