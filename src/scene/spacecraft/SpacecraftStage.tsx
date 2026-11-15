import { Suspense, useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { ModelId } from '../../assets/manifest'
import { preloadModel, useModel } from '../../assets/models'
import { kitModel, type Vec3 } from '../../data/craftKit'
import { allCraftParts, craftLabel, type CraftInstance, type CraftSlot } from '../../viz/spacecraft/craftBuild'
import { getPartById, solarPanels, batteries, computers, attitudeControls, propulsionSystems } from '../../data/parts'
import { audio } from '../../assets/audio'
import { useDragStore } from '../../ui/interaction/dragStore'
import { trackDrag } from '../../ui/interaction/drag'
import { useInsidePlaying } from '../../ui/interaction/insideStore'
import { DropSlot } from '../interaction/DropSlot'
import { HoldStillWhileDragging, SnapNudge, SnapPuff } from '../interaction/snap'
import { useInsidePath, type CamKey } from '../interaction/InsideCam'
import { brownout, ledBrightness, scaleState, springStep, volumeRefusal } from '../interaction/reactions'
import { prefersReducedMotion } from '../space/quality'
import { Effects } from '../space/Effects'
import { ModelRocket } from '../rocket/ModelRocket'
import type { RocketConfig } from '../../data/rocket'

/**
 * The spacecraft step's assembly bay: the 6U craft hovers over a turntable in a dark bay, built from
 * the kit's real hardware models. Parts fly in when a choice changes, and the view can explode, deploy
 * the wings and close the panels. Real scale, metres: the camera does the enlarging.
 */

/** Kapton amber: the one warm accent in the clean room */
const ACCENT = '#e8a33d'
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
  // Muted family swatches, as on the catalogue cards and the tray
  structure: '#948d7f',
  solar: '#7c9cc9',
  battery: '#a3b865',
  computer: '#a394cc',
  attitude: '#c48a7c',
  propulsion: '#d98e55',
  instrument: '#c9b27a',
  radio: '#8aa39b',
  bus: '#948d7f',
}

export type FactorySlot = 'solar' | 'battery' | 'computer' | 'attitude' | 'propulsion'

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
  /** Live budget numbers for scene reactions (mass scale, brownout LEDs, propellant fill, volume check) */
  massKg?: number
  massLimitKg?: number
  volumeMarginU?: number
  powerMarginW?: number
  powerGeneratedW?: number
  propellantMassKg?: number
  sunLamp?: boolean
  selected?: Record<FactorySlot, string>
  /** The launch rocket, shown as a scale model behind the craft: what it will ride in */
  rocket?: RocketConfig
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
              if (useDragStore.getState().held) return
              e.stopPropagation()
              props.onHover(inst.slot)
            }
          : undefined
      }
      onPointerOut={
        interactive
          ? () => {
              if (!useDragStore.getState().held) props.onHover(null)
            }
          : undefined
      }
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
  const dragging = useDragStore((s) => !!s.held)
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {tags.map((i, idx) => {
        const slot = i.slot
        const color = slotColor[slot]
        const active = props.activeSlot === slot
        const fromLab = slot === 'instrument'
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
              aria-label={fromLab ? `${craftLabel(i.from)} (from Research Lab)` : craftLabel(i.from)}
              className={`${dragging ? 'pointer-events-none' : 'pointer-events-auto'} flex items-center gap-1.5 whitespace-nowrap rounded-[2px] border font-mono text-[10px] font-semibold transition-all`}
              style={{
                borderColor: active ? color : `${color}aa`,
                color: active ? '#07090d' : '#ede6d6',
                background: active ? color : 'rgba(11,14,20,0.82)',
                padding: active ? '2px 8px 2px 6px' : '0',
                width: active ? 'auto' : 14,
                height: active ? 'auto' : 14,
                justifyContent: 'center',
              }}
            >
              <span className="h-2 w-2 flex-none rounded-full" style={{ background: active ? '#07090d' : color }} />
              {active && (
                <>
                  {craftLabel(i.from).replace(/\s*\(.*\)$/, '')}
                  {fromLab && <span className="ml-1 border-l border-current/40 pl-1 text-[9px] opacity-80">from Research Lab</span>}
                </>
              )}
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
    if (accent.current) accent.current.color.set(ringColor === '#d0533f' || ringColor === '#ef4444' ? '#d0533f' : ACCENT)
  })
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[40, 30]} />
        <meshStandardMaterial color="#1b1e23" roughness={0.42} metalness={0.25} />
      </mesh>
      {/* conductive floor tiles: a fine ESD grid */}
      <gridHelper args={[40, 66, '#3a3324', '#20242b']} position-y={0.002} />
      {/* a Kapton safety line around the work area */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.003}>
        <ringGeometry args={[1.18, 1.22, 96]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, 3, -2.4]}>
        <planeGeometry args={[40, 8]} />
        <meshStandardMaterial color="#15181d" roughness={0.85} />
      </mesh>
      {/* wall panels with HEPA return grilles */}
      {[-7, -5, -3, -1, 1, 3, 5, 7].map((x) => (
        <mesh key={x} position={[x * 0.9, 3, -2.3]}>
          <boxGeometry args={[0.06, 8, 0.08]} />
          <meshStandardMaterial color="#22262d" roughness={0.6} />
        </mesh>
      ))}
      {[-5.4, -1.8, 1.8, 5.4].map((x) => (
        <mesh key={x} position={[x, 0.3, -2.34]}>
          <boxGeometry args={[1.2, 0.36, 0.02]} />
          <meshStandardMaterial color="#2a2e35" roughness={0.9} />
        </mesh>
      ))}
      {[-3.4, 0, 3.4].map((x) => (
        <mesh key={x} position={[x, 3.4, 0.2]}>
          <boxGeometry args={[2, 0.03, 0.2]} />
          <meshBasicMaterial color={[1.25, 1.27, 1.3]} toneMapped={false} />
        </mesh>
      ))}
      {/* the turntable */}
      <mesh position-y={0.04}>
        <cylinderGeometry args={[0.52, 0.58, 0.08, 64]} />
        <meshStandardMaterial color="#23262c" metalness={0.7} roughness={0.32} />
      </mesh>
      <mesh position-y={0.085} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.5, 0.012, 8, 96]} />
        <meshBasicMaterial ref={ring} color={ringColor} toneMapped={false} />
      </mesh>
      {/* Laser alignment cross projected on the turntable floor */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.086}>
        <planeGeometry args={[0.88, 0.003]} />
        <meshBasicMaterial color="#5ee6f0" transparent opacity={0.45} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.086}>
        <planeGeometry args={[0.003, 0.88]} />
        <meshBasicMaterial color="#5ee6f0" transparent opacity={0.45} toneMapped={false} />
      </mesh>
      {/* Overhead cleanroom spotlight directly over spacecraft */}
      <spotLight position={[0, 4.2, 0]} angle={0.5} penumbra={0.7} intensity={16} color="#f0f6ff" />
      {/* a faint beam holds the craft up */}
      <mesh position-y={0.095 + 0.15}>
        <cylinderGeometry args={[0.3, 0.46, 0.3, 48, 1, true]} />
        <meshBasicMaterial ref={beam} color="#cfd8e3" transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <pointLight ref={accent} position={[-1.8, 1.8, -1.2]} intensity={9} distance={7} color={ACCENT} />
      <CleanRoomProps />
    </group>
  )
}

/* ---------------- clean-room dressing ---------------- */

/**
 * Ground-support hardware from the kit, set around the turntable at real size (metres). Every
 * piece sits outside the camera's orbit (radius > 1.4 m) so no preset clips through it; the
 * bench, fairing and hook fill the backdrop behind the craft in the default views.
 * Most models stand on their origin; the deployers and the ring are centred on theirs.
 */
const DRESSING: { id: ModelId; pos: Vec3; rotY?: number }[] = [
  { id: 'model.sc-esd_workbench', pos: [-1.05, 0, -1.9], rotY: 0.15 },
  { id: 'model.sc-fairing_half', pos: [1.25, 0, -2.0], rotY: -0.35 },
  { id: 'model.sc-assembly_stand', pos: [-2.15, 0, -0.75], rotY: 1.2 },
  { id: 'model.sc-laptop_cart', pos: [-1.9, 0, 0.95], rotY: 2.2 },
  { id: 'model.sc-shipping_container', pos: [1.95, 0, 0.55], rotY: -1.25 },
  { id: 'model.sc-deployer_6u_closed', pos: [1.95, 0.83, 0.55], rotY: -1.0 },
  { id: 'model.sc-deployer_6u_open', pos: [0.2, 0.067, -1.6], rotY: 0.4 },
  { id: 'model.sc-separation_ring', pos: [-0.3, 0.038, -1.55] },
  { id: 'model.sc-crane_hook', pos: [0.45, 2.2, -1.55] },
]

function Prop({ id, pos, rotY = 0 }: { id: ModelId; pos: Vec3; rotY?: number }) {
  const root = useModel(id)
  return (
    <group position={pos} rotation-y={rotY}>
      <primitive object={root} />
    </group>
  )
}

function CleanRoomProps() {
  return (
    <>
      {DRESSING.map((d) => (
        <Suspense key={d.id} fallback={null}>
          <Prop {...d} />
        </Suspense>
      ))}
    </>
  )
}

/* ---------------- weighing scale, brownout, propellant, workbench parts ---------------- */

/** Physical weighing dial built onto the front rim of the turntable pedestal */
function WeighingScale({ massKg, massLimitKg, reduced }: { massKg: number; massLimitKg: number; reduced: boolean }) {
  const s = scaleState(massKg, massLimitKg)
  const needleRef = useRef<THREE.Group>(null)
  const phys = useRef({ angle: s.angle, vel: 0 })
  const wasOver = useRef(s.over)

  useEffect(() => {
    if (s.over && !wasOver.current) audio.play('sfx.fit-error')
    wasOver.current = s.over
  }, [s.over])

  useFrame((frame, dt) => {
    const p = phys.current
    if (reduced) {
      p.angle = s.angle
      p.vel = 0
    } else {
      ;[p.angle, p.vel] = springStep(p.angle, p.vel, s.angle, dt, 70, 9)
    }
    const jitter = !reduced && s.shake > 0 ? Math.sin(frame.clock.elapsedTime * 58) * s.shake : 0
    if (needleRef.current) needleRef.current.rotation.z = -(p.angle + jitter)
  })

  return (
    <group position={[0.19, 0.11, 0.34]} rotation={[-0.45, 0.48, 0]}>
      {/* brass/ink housing */}
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.072, 0.076, 0.022, 32]} />
        <meshStandardMaterial color="#1a1f2b" metalness={0.5} roughness={0.45} />
      </mesh>
      {/* dial face */}
      <mesh position={[0, 0, 0.012]}>
        <circleGeometry args={[0.064, 32]} />
        <meshBasicMaterial color="#0b0e14" />
      </mesh>
      {/* red limit tick */}
      <group rotation-z={-s.redLine} position={[0, 0, 0.013]}>
        <mesh position={[0, 0.048, 0]}>
          <boxGeometry args={[0.005, 0.018, 0.002]} />
          <meshBasicMaterial color="#d0533f" />
        </mesh>
      </group>
      {/* paper scale ticks */}
      {[-0.8, -0.4, 0, 0.4].map((frac) => (
        <group key={frac} rotation-z={-(frac * Math.PI * 0.6)} position={[0, 0, 0.013]}>
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[0.0025, 0.01, 0.002]} />
            <meshBasicMaterial color="#948d7f" />
          </mesh>
        </group>
      ))}
      {/* spring-damped needle */}
      <group ref={needleRef} position={[0, 0, 0.015]}>
        <mesh position={[0, 0.022, 0]}>
          <boxGeometry args={[0.004, 0.048, 0.002]} />
          <meshBasicMaterial color={s.over ? '#d0533f' : '#e8a33d'} toneMapped={false} />
        </mesh>
        <mesh rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.007, 0.007, 0.004, 16]} />
          <meshBasicMaterial color="#ede6d6" />
        </mesh>
      </group>
    </group>
  )
}

/** Bus power harness + status LEDs: steady when positive, flickering brownout when short */
function BusPowerIndicators({
  powerMarginW,
  powerGeneratedW,
  sunLamp,
  reduced,
}: {
  powerMarginW: number
  powerGeneratedW: number
  sunLamp: boolean
  reduced: boolean
}) {
  const b = brownout(powerMarginW, powerGeneratedW)
  const ledMat = useRef<THREE.MeshBasicMaterial>(null)
  const harnessMat = useRef<THREE.MeshBasicMaterial>(null)

  useFrame((st) => {
    const bright = !sunLamp ? 0.25 : reduced ? (b.steady ? 1 : 0.45) : ledBrightness(b, st.clock.elapsedTime)
    if (ledMat.current) {
      ledMat.current.color.set(b.steady ? '#6faf7a' : '#d0533f')
      ledMat.current.opacity = bright
    }
    if (harnessMat.current) {
      harnessMat.current.opacity = sunLamp ? b.glow * bright : 0.1
    }
  })

  return (
    <group>
      {/* thin kapton harness glow along the avionics spine */}
      <mesh position={[-0.052, 0.014, -0.02]}>
        <boxGeometry args={[0.006, 0.004, 0.16]} />
        <meshBasicMaterial ref={harnessMat} color={b.steady ? '#e8a33d' : '#d0533f'} transparent opacity={0.6} toneMapped={false} />
      </mesh>
      {/* bus LED indicators on the side rail */}
      {[-0.06, -0.02, 0.02].map((z) => (
        <mesh key={z} position={[-0.114, 0.032, z]}>
          <sphereGeometry args={[0.004, 8, 8]} />
          <meshBasicMaterial ref={z === -0.06 ? ledMat : undefined} color={b.steady ? '#6faf7a' : '#d0533f'} transparent opacity={b.steady ? 1 : 0.45} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/** Visible propellant tank gauge beside the rear engine bay */
function PropellantTankGauge({ propellantMassKg }: { propellantMassKg: number }) {
  const frac = Math.min(1, Math.max(0.06, propellantMassKg / 3.5))
  if (propellantMassKg <= 0) return null
  const h = 0.062
  const fillH = h * frac
  return (
    <group position={[0.095, -0.005, -0.14]}>
      <mesh>
        <cylinderGeometry args={[0.012, 0.012, h, 14]} />
        <meshBasicMaterial color="#948d7f" wireframe transparent opacity={0.3} />
      </mesh>
      <mesh position={[0, -(h - fillH) / 2, 0]}>
        <cylinderGeometry args={[0.01, 0.01, fillH, 14]} />
        <meshBasicMaterial color="#d98e55" transparent opacity={0.85} />
      </mesh>
    </group>
  )
}

const BENCH_PARTS: Array<{ slot: FactorySlot; pos: Vec3; options: Array<{ id: string; name: string }> }> = [
  { slot: 'solar', pos: [-1.36, 0.86, -1.74], options: solarPanels },
  { slot: 'battery', pos: [-1.20, 0.86, -1.78], options: batteries },
  { slot: 'computer', pos: [-1.04, 0.86, -1.82], options: computers },
  { slot: 'attitude', pos: [-0.88, 0.86, -1.86], options: attitudeControls },
  { slot: 'propulsion', pos: [-0.72, 0.86, -1.90], options: propulsionSystems },
]

/** Hardware parts laid out on the ESD workbench: drag straight off the bench into the 6U frame */
function WorkbenchParts({ selected }: { selected?: Record<FactorySlot, string> }) {
  return (
    <group>
      {BENCH_PARTS.map((b) => {
        const cur = selected?.[b.slot]
        const idx = Math.max(0, b.options.findIndex((o) => o.id === cur))
        const next = b.options[(idx + 1) % b.options.length]
        return (
          <mesh
            key={b.slot}
            position={b.pos}
            onPointerDown={(e) => {
              e.stopPropagation()
              trackDrag({ field: b.slot, value: next.id, label: next.name }, e.nativeEvent, true)
            }}
          >
            <boxGeometry args={[0.11, 0.06, 0.11]} />
            <meshStandardMaterial color={slotColor[b.slot]} roughness={0.45} metalness={0.35} />
          </mesh>
        )
      })}
    </group>
  )
}

/** 6U slot volumes as hairline drop targets + oversized nogo outline if a held part doesn't fit */
function CraftDropSlots({
  volumeMarginU,
  selected,
}: {
  volumeMarginU: number
  selected?: Record<FactorySlot, string>
}) {
  const over = useDragStore((s) => s.over)
  const refuseVolume = (p: { field: string; value: string }) => {
    const f = p.field as FactorySlot
    const curId = selected?.[f]
    const curVol = (curId ? getPartById(curId)?.volume : undefined) ?? 0
    const nextVol = getPartById(p.value)?.volume ?? 0
    return volumeRefusal(volumeMarginU, curVol, nextVol)
  }

  return (
    <group>
      <DropSlot id="slot:solar" accepts={['solar']} position={[0, 0.048, 0]} size={[0.21, 0.03, 0.34]} refuse={refuseVolume} />
      <DropSlot id="slot:battery" accepts={['battery']} position={[-0.052, -0.015, -0.088]} size={[0.1, 0.05, 0.105]} refuse={refuseVolume} />
      <DropSlot id="slot:computer" accepts={['computer']} position={[-0.052, 0.002, 0.012]} size={[0.1, 0.045, 0.105]} refuse={refuseVolume} />
      <DropSlot id="slot:attitude" accepts={['attitude']} position={[0.048, 0.01, 0.01]} size={[0.1, 0.068, 0.12]} refuse={refuseVolume} />
      <DropSlot id="slot:propulsion" accepts={['propulsion']} position={[0.055, -0.008, -0.11]} size={[0.1, 0.075, 0.14]} refuse={refuseVolume} />
      <DropSlot id="slot:frame" accepts={['solar', 'battery', 'computer', 'attitude', 'propulsion']} position={[0, 0, 0]} size={[0.25, 0.13, 0.39]} refuse={refuseVolume} />
      {/* If the held part exceeds the remaining U, a nogo ghost box sticks out of the frame */}
      {over && !over.ok && (
        <mesh position={[0.02, 0.015, 0]}>
          <boxGeometry args={[0.28, 0.15, 0.44]} />
          <meshBasicMaterial color="#d0533f" wireframe transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  )
}

const INTEGRATE_KEYS: CamKey[] = [
  { t: 0, pos: [0.34, 0.65, 0.46], target: [0, 0.42, 0], caption: 'Panels closed, wings stowed for the 6U deployer.' },
  { t: 2.4, pos: [0.46, 0.34, -1.05], target: [0.2, 0.12, -1.6], caption: 'Sliding the spacecraft into the 6U orbital deployer…' },
  { t: 4.8, pos: [0.34, 0.24, -1.32], target: [0.2, 0.1, -1.6], caption: 'INTEGRATED — ready for the launch fairing.' },
]

function IntegrateDirector() {
  useInsidePath('factory-integrate', INTEGRATE_KEYS, { still: 2, endAfterS: 5.5 })
  return null
}

function Lights({ sunLamp }: { sunLamp: boolean }) {
  return (
    <>
      {/* clean-room key: cool, even, from the ceiling diffusers */}
      <ambientLight color="#aab6c4" intensity={sunLamp ? 0.5 : 0.28} />
      <hemisphereLight color="#dfe8f2" groundColor="#1b1e23" intensity={sunLamp ? 0.45 : 0.22} />
      <spotLight position={[-0.9, 2.6, 1.8]} angle={0.55} penumbra={0.6} intensity={42} distance={9} color="#e6eef6" />
      {sunLamp && <spotLight position={[0.9, 1.8, 0.7]} angle={0.45} penumbra={0.5} intensity={36} distance={6} color="#fff2d6" />}
      <pointLight position={[1.1, 0.9, 1.1]} intensity={4} distance={4} color="#c9d6e4" />
      {/* warm Kapton accent from behind: rim light on the foil and panels */}
      <pointLight position={[-0.9, 0.5, -0.8]} intensity={3.4} distance={4} color="#e8a33d" />
      <pointLight position={[0.3, -0.05, 0.4]} intensity={1.2} distance={2} color="#f0c88a" />
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
  const inside = useInsidePlaying('factory-integrate')
  const dragging = useDragStore((s) => !!s.held)
  useEffect(() => {
    anim.current = 1.6
  }, [view])
  useFrame((_, dt) => {
    const ctl = controls.current
    if (!ctl || inside) return
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
      autoRotate={!inside && !dragging && (view === 'closeup' || view === 'overview')}
      autoRotateSpeed={0.4}
      minDistance={0.2}
      maxDistance={4}
      minPolarAngle={0.2}
      maxPolarAngle={Math.PI / 2 + 0.25}
      target={goal.target}
    />
  )
}

/* ---------------- the rocket it will ride in ---------------- */

/** Height of the scale model, in metres, and how far in front of the camera it stands */
const MODEL_ROCKET_M = 0.1
const MODEL_ROCKET_DIST = 0.4

/**
 * The launch rocket as a small turning model, held in the lower left of the view wherever the
 * camera orbits: context while the craft is built, so the player sees what it will ride in.
 * It stands upright in the room and is drawn over it, so a wing swinging past never hides it.
 */
function RocketBesideCamera({ config }: { config: RocketConfig }) {
  const holder = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const inside = useInsidePlaying('factory-integrate')
  const at = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }, dt) => {
    const g = holder.current
    if (!g) return
    const cam = camera as THREE.PerspectiveCamera
    const h = MODEL_ROCKET_DIST * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const w = h * (size.width / Math.max(1, size.height))
    at.set(-0.82 * w, -0.78 * h, -MODEL_ROCKET_DIST).applyMatrix4(cam.matrixWorld)
    g.position.copy(at)
    g.visible = !inside
    if (spin.current) spin.current.rotation.y += dt * 0.5
  })
  return (
    <group ref={holder}>
      <group ref={spin}>
        <Suspense fallback={null}>
          <ModelRocket config={config} position={[0, 0, 0]} heightM={MODEL_ROCKET_M} onTop />
        </Suspense>
      </group>
    </group>
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
  const massKg = props.massKg ?? 10
  const massLimitKg = props.massLimitKg ?? 14
  const volumeMarginU = props.volumeMarginU ?? 1
  const powerMarginW = props.powerMarginW ?? 10
  const powerGeneratedW = props.powerGeneratedW ?? 40
  const propellantMassKg = props.propellantMassKg ?? 1
  const sunLamp = props.sunLamp ?? true
  const overweight = massLimitKg > 0 && massKg > massLimitKg

  useFrame((st) => {
    // the craft hovers, and visibly sags when overweight
    const sag = overweight ? -0.024 : 0
    if (floater.current) floater.current.position.y = CRAFT_CENTRE[1] + sag + (reduced ? 0 : 0.008 * Math.sin(st.clock.elapsedTime * 0.9))
  })
  return (
    <>
      <Lights sunLamp={sunLamp} />
      <Bay ringColor={props.ringColor} reduced={reduced} />
      <WeighingScale massKg={massKg} massLimitKg={massLimitKg} reduced={reduced} />
      <WorkbenchParts selected={props.selected} />
      {props.rocket && <RocketBesideCamera config={props.rocket} />}
      <CameraRig view={props.view} />
      <HoldStillWhileDragging />
      <SnapNudge />
      <SnapPuff at={CRAFT_CENTRE} />
      <IntegrateDirector />
      <group ref={floater} position={CRAFT_CENTRE}>
        {props.craft.map((i, n) => (
          <Suspense key={`${i.key}:${i.part}`} fallback={null}>
            <CraftPart inst={i} index={n} stagger={first} props={props} reduced={reduced} />
          </Suspense>
        ))}
        <BusPowerIndicators powerMarginW={powerMarginW} powerGeneratedW={powerGeneratedW} sunLamp={sunLamp} reduced={reduced} />
        <PropellantTankGauge propellantMassKg={propellantMassKg} />
        <CraftDropSlots volumeMarginU={volumeMarginU} selected={props.selected} />
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
          scene.background = new THREE.Color('#0d0f13')
          scene.fog = new THREE.Fog('#0d0f13', 5, 14)
          const pmrem = new THREE.PMREMGenerator(gl)
          scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
          scene.environmentIntensity = 0.55
          pmrem.dispose()
        }}
      >
        <Scene props={props} tags={tags} tagEls={tagEls} />
        <Effects preset="interior" />
      </Canvas>
      <TagOverlay tags={tags} tagEls={tagEls} props={props} />
    </div>
  )
}
