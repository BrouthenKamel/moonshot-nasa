import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { preloadModel, useModel } from '../../assets/models'
import { rocketParts, type RocketConfig, type RocketSlot } from '../../data/rocket'
import type { Design } from '../../sim/types'
import { layoutRocket, type PlacedPart } from '../../viz/rocket/rocketView'
import { DropSlot } from '../../scene/interaction/DropSlot'
import { SnapNudge } from '../../scene/interaction/snap'
import { CubeSat } from '../../scene/space/CubeSat'
import { prefersReducedMotion } from '../../scene/space/quality'
import { trackDrag } from '../../ui/interaction/drag'
import { dragPointer, useDragStore } from '../../ui/interaction/dragStore'
import type { MassFit } from './logic'

for (const p of rocketParts) if (p.model) preloadModel(p.model)

/** Scene units per body radius of the rocket kit */
const S = 0.26
const ROCKET_X = -4.4
const RACK_X = 0.7
const RACK_Y = 1.35
const TRAY_DY = 0.78
const CART = new THREE.Vector3(4.3, 0.78, 0.6)
const CRAFT_SCALE = 3.2
const KAPTON = '#e8a33d'
const GO = '#6faf7a'
const CAUTION = '#d9b23f'
const NOGO = '#d0533f'
const LID_OPEN = -1.75

export interface SceneProps {
  phase: 'board' | 'load'
  rocket: RocketConfig
  craft: Design
  loaded: boolean
  /** Lids target: closed, jammed (half shut then bounce) or open */
  lids: 'open' | 'jam' | 'closed'
  /** Rack rolls toward the rocket */
  shipped: boolean
  fit: MassFit | null
  onDropped: () => void
  onClunk: () => void
  onSwap: (slot: RocketSlot) => void
}

/* ---------------- rocket ---------------- */

function RocketPart({ placed, onSwap }: { placed: PlacedPart; onSwap: (slot: RocketSlot) => void }) {
  const root = useModel(placed.part.model!)
  return (
    <group
      scale={S}
      position={[0, placed.y * S, 0]}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
      onClick={(e) => {
        e.stopPropagation()
        onSwap(placed.slot)
      }}
    >
      <primitive object={root} />
    </group>
  )
}

function Rocket({ config, onSwap, showLabel }: { config: RocketConfig; onSwap: (slot: RocketSlot) => void; showLabel: boolean }) {
  const layout = useMemo(() => layoutRocket(config), [config])
  const base = -layout.bottom * S + 0.35
  return (
    <group position={[ROCKET_X, 0, -0.6]}>
      {/* launch table */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[1.3, 1.5, 0.24, 32]} />
        <meshStandardMaterial color="#2a303c" roughness={0.8} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.0, 1.25, 48]} />
        <meshBasicMaterial color={KAPTON} />
      </mesh>
      <group position={[0, base, 0]}>
        {layout.placed.map((p) => (
          <RocketPart key={`${p.slot}-${p.part.id}`} placed={p} onSwap={onSwap} />
        ))}
      </group>
      {showLabel && (
        <Html position={[0, 0.9, 1.8]} center style={{ pointerEvents: 'none' }}>
          <div className="fp-data whitespace-nowrap rounded-sm bg-ink-1/80 px-2 py-0.5 text-[11px] text-paper-dim">your rocket · cosmetic · tap a part to swap it</div>
        </Html>
      )}
    </group>
  )
}

/* ---------------- dispenser rack ---------------- */

const GREY = '#6c717b'
const GREY_DARK = '#4a4f58'

function GreyPayload({ w }: { w: number }) {
  return (
    <group>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[w, 0.28, 0.36]} />
        <meshStandardMaterial color={GREY} roughness={0.7} metalness={0.4} />
      </mesh>
      <mesh position={[w * 0.1, 0.17, 0]}>
        <boxGeometry args={[w * 0.5, 0.04, 0.26]} />
        <meshStandardMaterial color={GREY_DARK} roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[-w * 0.5 - 0.04, 0.02, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.08, 16]} />
        <meshStandardMaterial color={GREY_DARK} roughness={0.5} metalness={0.6} />
      </mesh>
    </group>
  )
}

const TRAY_W = 1.7
const TRAY_D = 0.62

function Tray({ y, lid, grey }: { y: number; lid: React.RefObject<THREE.Group | null>; grey?: number }) {
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, -0.18, 0]}>
        <boxGeometry args={[TRAY_W, 0.05, TRAY_D]} />
        <meshStandardMaterial color="#39404c" roughness={0.7} metalness={0.5} />
      </mesh>
      <mesh position={[0, -0.04, -TRAY_D / 2 + 0.02]}>
        <boxGeometry args={[TRAY_W, 0.3, 0.04]} />
        <meshStandardMaterial color="#39404c" roughness={0.7} metalness={0.5} />
      </mesh>
      <mesh position={[0, -0.12, TRAY_D / 2 - 0.02]}>
        <boxGeometry args={[TRAY_W, 0.14, 0.04]} />
        <meshStandardMaterial color="#39404c" roughness={0.7} metalness={0.5} />
      </mesh>
      {grey && (
        <group position={[0.05, -0.02, 0]}>
          <GreyPayload w={grey} />
        </group>
      )}
      {/* the door: hinged on the back edge, kapton edge so the player sees it close */}
      <group ref={lid} position={[0, 0.13, -TRAY_D / 2]} rotation={[LID_OPEN, 0, 0]}>
        <mesh position={[0, 0, TRAY_D / 2]}>
          <boxGeometry args={[TRAY_W, 0.04, TRAY_D]} />
          <meshStandardMaterial color="#4d5564" roughness={0.6} metalness={0.5} />
        </mesh>
        <mesh position={[0, 0.0, TRAY_D - 0.02]}>
          <boxGeometry args={[TRAY_W, 0.045, 0.04]} />
          <meshBasicMaterial color={KAPTON} />
        </mesh>
      </group>
    </group>
  )
}

function Gauge({ fit }: { fit: MassFit }) {
  const H = 1.9
  const top = fit.limit * 1.25
  const fill = Math.min(1, fit.mass / top) * H
  const limitY = (fit.limit / top) * H
  const color = fit.status === 'over' ? NOGO : fit.status === 'tight' ? CAUTION : GO
  return (
    <group position={[1.18, -TRAY_DY - 0.3, 0.3]}>
      <mesh position={[0, H / 2, 0]}>
        <boxGeometry args={[0.16, H, 0.08]} />
        <meshStandardMaterial color="#1a1f2b" roughness={0.9} />
      </mesh>
      <mesh position={[0, fill / 2, 0.05]}>
        <boxGeometry args={[0.1, Math.max(fill, 0.01), 0.04]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, limitY, 0.07]}>
        <boxGeometry args={[0.36, 0.025, 0.04]} />
        <meshBasicMaterial color={KAPTON} />
      </mesh>
      <Html position={[0.3, limitY, 0.1]} style={{ pointerEvents: 'none' }}>
        <div className="fp-data whitespace-nowrap text-[12px]" style={{ color }} data-testid="mass-readout">
          {fit.mass.toFixed(1)} / {fit.limit} kg
        </div>
      </Html>
    </group>
  )
}

function Rack({ props }: { props: SceneProps }) {
  const group = useRef<THREE.Group>(null)
  const lids = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  const st = useRef({ angle: LID_OPEN, vel: 0, clunked: false, shake: 0, x: RACK_X })
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const propsRef = useRef(props)
  propsRef.current = props
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const p = propsRef.current
    const s = st.current
    const target = p.lids === 'closed' ? 0 : p.lids === 'jam' ? -0.5 : LID_OPEN
    if (p.lids !== 'closed') s.clunked = false
    if (reduced) {
      s.angle = target
    } else {
      // a stiff spring with a hard stop at 0: a door that slams
      const stiff = p.lids === 'closed' ? 120 : 40
      s.vel += (target - s.angle) * stiff * dt - s.vel * 7 * dt
      s.angle += s.vel * dt
      if (s.angle > 0) {
        s.angle = 0
        s.vel = -s.vel * 0.18
      }
    }
    if (p.lids === 'closed' && !s.clunked && s.angle > -0.04) {
      s.clunked = true
      s.shake = 1
      p.onClunk()
    }
    s.shake *= Math.exp(-dt * 9)
    lids.forEach((l) => {
      if (l.current) l.current.rotation.x = s.angle
    })
    const gx = p.shipped ? ROCKET_X + 1.75 : RACK_X
    s.x += (gx - s.x) * (reduced ? 1 : 1 - Math.exp(-dt * 2.2))
    if (group.current) {
      group.current.position.x = s.x
      group.current.position.y = RACK_Y + Math.sin(performance.now() * 0.06) * 0.015 * s.shake
    }
  })
  const { fit, loaded } = props
  return (
    <group ref={group} position={[RACK_X, RACK_Y, 0]}>
      <Tray y={TRAY_DY} lid={lids[0]} grey={1.15} />
      <Tray y={0} lid={lids[1]} />
      <Tray y={-TRAY_DY} lid={lids[2]} grey={0.95} />
      {/* legs */}
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, -RACK_Y / 2 - TRAY_DY / 2 - 0.1, -0.2]}>
          <boxGeometry args={[0.08, RACK_Y + TRAY_DY - 0.1, 0.08]} />
          <meshStandardMaterial color="#2a303c" roughness={0.8} metalness={0.4} />
        </mesh>
      ))}
      {props.phase === 'load' && !loaded && (
        <DropSlot id="rideshare-bay" accepts={['craft']} position={[0, 0.02, 0]} size={[TRAY_W - 0.1, 0.5, TRAY_D - 0.06]} preview={false} onDrop={props.onDropped} idleVisible />
      )}
      {loaded && fit && <Gauge fit={fit} />}
    </group>
  )
}

/* ---------------- the CubeSat: on the cart, in your hand, in the bay ---------------- */

function Craft({ props }: { props: SceneProps }) {
  const group = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.0), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const held = useDragStore((s) => s.held?.field === 'craft')
  const propsRef = useRef(props)
  propsRef.current = props
  const pos = useRef(CART.clone())
  const rot = useRef(new THREE.Euler(0.3, 1.1, 0))

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const g = group.current
    if (!g) return
    const p = propsRef.current
    const k = reduced ? 1 : 1 - Math.exp(-dt * (held ? 18 : 9))
    const want = tmp
    let wantRot = [0.3, 1.1, 0]
    if (p.loaded) {
      // sit in the middle bay, and roll along with the rack
      want.set(p.shipped ? ROCKET_X + 1.75 : RACK_X, RACK_Y + 0.02, 0)
      wantRot = [0, Math.PI / 2, 0]
    } else if (held) {
      const rect = gl.domElement.getBoundingClientRect()
      ndc.set(((dragPointer.x - rect.left) / rect.width) * 2 - 1, -((dragPointer.y - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      if (raycaster.ray.intersectPlane(plane, hit)) want.copy(hit)
      else want.copy(CART)
      wantRot = [0, Math.PI / 2, 0]
    } else {
      want.copy(CART)
    }
    pos.current.lerp(want, k)
    rot.current.x += (wantRot[0] - rot.current.x) * k
    rot.current.y += (wantRot[1] - rot.current.y) * k
    g.position.copy(pos.current)
    g.rotation.copy(rot.current)
  })

  return (
    <group
      ref={group}
      position={CART}
      onPointerOver={() => {
        if (!propsRef.current.loaded) document.body.style.cursor = 'grab'
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
      onPointerDown={(e) => {
        if (propsRef.current.loaded || propsRef.current.phase !== 'load') return
        e.stopPropagation()
        trackDrag({ field: 'craft', value: 'cubesat', label: 'Your CubeSat', sound: 'sfx.ih-part-click' }, e.nativeEvent, true)
      }}
    >
      <CubeSat design={props.craft} deploy={0} scale={CRAFT_SCALE} />
      {/* generous invisible grab box: the model is thin */}
      <mesh visible={false}>
        <boxGeometry args={[0.9, 0.9, 1.6]} />
      </mesh>
    </group>
  )
}

/** The weigh pad the CubeSat starts on */
function Cart({ fit, visible }: { fit: MassFit | null; visible: boolean }) {
  if (!visible) return null
  return (
    <group position={[CART.x, 0, CART.z]}>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[1.4, 0.08, 0.9]} />
        <meshStandardMaterial color="#3a4254" roughness={0.6} metalness={0.5} />
      </mesh>
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} position={[x, 0.15, 0]}>
          <boxGeometry args={[0.08, 0.3, 0.7]} />
          <meshStandardMaterial color="#2a303c" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 0.36, 0.5]}>
        <boxGeometry args={[0.7, 0.04, 0.02]} />
        <meshBasicMaterial color={KAPTON} />
      </mesh>
      {fit && (
        <Html position={[0, 0.2, 0.7]} center style={{ pointerEvents: 'none' }}>
          <div className="fp-data whitespace-nowrap text-[12px] text-paper-dim" data-testid="scale-readout">
            {fit.mass.toFixed(1)} kg on the scale
          </div>
        </Html>
      )}
    </group>
  )
}

/* ---------------- hangar and camera ---------------- */

function Hangar() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[60, 40]} />
        <meshStandardMaterial color="#171b23" roughness={0.9} metalness={0.1} />
      </mesh>
      {[-5, 0, 5].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x * 2, 0.005, 2]}>
          <planeGeometry args={[0.06, 30]} />
          <meshBasicMaterial color="#2a3040" />
        </mesh>
      ))}
      <mesh position={[0, 5, -6]}>
        <planeGeometry args={[60, 14]} />
        <meshStandardMaterial color="#1c222c" roughness={0.9} />
      </mesh>
      {[-12, -8, -4, 0, 4, 8, 12].map((x) => (
        <mesh key={x} position={[x, 5, -5.95]}>
          <boxGeometry args={[0.25, 14, 0.2]} />
          <meshStandardMaterial color="#2a303c" roughness={0.8} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 0.9, -5.9]}>
        <boxGeometry args={[60, 0.1, 0.05]} />
        <meshBasicMaterial color={KAPTON} />
      </mesh>
    </group>
  )
}

const CAM = {
  board: { pos: new THREE.Vector3(-0.4, 2.2, 17), look: new THREE.Vector3(-0.4, 1.9, 0) },
  load: { pos: new THREE.Vector3(0.0, 2.5, 10.2), look: new THREE.Vector3(0.0, 1.7, 0) },
}

function CameraRig({ phase }: { phase: 'board' | 'load' }) {
  const look = useRef(CAM[phase].look.clone())
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useFrame(({ camera }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const goal = CAM[phase]
    const k = reduced ? 1 : 1 - Math.exp(-dt * 2.6)
    camera.position.lerp(goal.pos, k)
    look.current.lerp(goal.look, k)
    camera.lookAt(look.current)
  })
  return null
}

function Env() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = tex
    scene.environmentIntensity = 0.7
    pmrem.dispose()
    return () => {
      scene.environment = null
      tex.dispose()
    }
  }, [gl, scene])
  return null
}

/** Dev only: lets the browser check find the CubeSat on screen */
function DevProbe() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  useFrame(() => {
    if (!import.meta.env.DEV) return
    const rect = gl.domElement.getBoundingClientRect()
    const project = (v: THREE.Vector3) => {
      const p = v.clone().project(camera)
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height }
    }
    ;(window as unknown as { __rideshare?: unknown }).__rideshare = {
      cart: project(CART),
      bay: project(new THREE.Vector3(RACK_X, RACK_Y, 0)),
      rocket: project(new THREE.Vector3(ROCKET_X, 2, -0.6)),
    }
  })
  return null
}

export function HangarScene(props: SceneProps) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ fov: 38, position: [-0.4, 2.2, 17], near: 0.1, far: 120 }} gl={{ antialias: true }} onCreated={({ scene }) => {
      scene.background = new THREE.Color('#0d1015')
      scene.fog = new THREE.Fog('#0d1015', 30, 70)
    }}>
      <Env />
      <hemisphereLight args={['#c9d4e6', '#1a1d24', 0.5]} />
      <directionalLight position={[6, 12, 8]} intensity={1.6} color="#fff1d6" />
      <pointLight position={[-4, 6, 4]} intensity={30} color="#ffb870" distance={20} />
      <CameraRig phase={props.phase} />
      <SnapNudge />
      <DevProbe />
      <Hangar />
      <Suspense fallback={null}>
        <Rocket config={props.rocket} onSwap={props.onSwap} showLabel={props.phase === 'load'} />
        <Cart fit={props.fit} visible={props.phase === 'load' && !props.shipped} />
        <Rack props={props} />
        {props.phase === 'load' && <Craft props={props} />}
      </Suspense>
    </Canvas>
  )
}
