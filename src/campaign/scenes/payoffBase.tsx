/**
 * Payoff 3, Moon base: a cargo lander has landed; the base unfolds out of it. Two rigid
 * modules slide out and settle, an inflatable habitat swells (BEAM, ISS 2016), solar masts
 * rise and their arrays fan open, a radiator unfolds, then the windows light one by one.
 * Earth hangs low on the horizon; an astronaut waits by the airlock.
 * success: all deployed, all lit · partial: one array jams half open, half the lights ·
 * failed: the habitat sags, the lights flicker out.
 */
import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Earth } from '../../scene/space/Earth'
import { Starfield } from '../../scene/space/Sky'
import { Burst, LowSun, LunarGround, Safe, SafeModel, rng, useShowTime } from './payoffParts'
import { BASE, easeInOutCubic, easeOutBack, easeOutCubic, easeOutElastic, ring, seg } from './payoffTimeline'
import type { Outcome } from './types'

const FOIL = '#d9a441'
const HULL = '#e4e0d6'
const SUN_POS: [number, number, number] = [-80, 9, 34]
/** Fan arrays face the low sun */
const FACE_SUN = Math.atan2(SUN_POS[0], SUN_POS[2])

const WINDOW_ON = new THREE.Color('#ffd49a').multiplyScalar(3.2)
const WINDOW_OFF = new THREE.Color('#15171b')

/* ---------------- cargo lander ---------------- */

const CARGO_POS: [number, number, number] = [7, 0, -3]

function CargoLander() {
  return (
    <group position={CARGO_POS} rotation-y={0.4}>
      <mesh position-y={3.1} castShadow receiveShadow>
        <cylinderGeometry args={[3.1, 3.3, 1.3, 8]} />
        <meshStandardMaterial color={FOIL} metalness={0.75} roughness={0.32} />
      </mesh>
      <mesh position-y={3.85} castShadow>
        <cylinderGeometry args={[3.1, 3.1, 0.2, 8]} />
        <meshStandardMaterial color="#9c9a94" metalness={0.5} roughness={0.5} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[Math.cos(i * 2.1) * 1.5, 1.9, Math.sin(i * 2.1) * 1.5]} castShadow>
          <sphereGeometry args={[0.9, 20, 14]} />
          <meshStandardMaterial color="#cfcac0" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        return (
          <group key={i}>
            <mesh position={[Math.cos(a) * 3.4, 1.4, Math.sin(a) * 3.4]} rotation={[Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45]} castShadow>
              <cylinderGeometry args={[0.1, 0.1, 3.4, 8]} />
              <meshStandardMaterial color="#8d8a84" metalness={0.7} roughness={0.35} />
            </mesh>
            <mesh position={[Math.cos(a) * 4.1, 0.06, Math.sin(a) * 4.1]} receiveShadow castShadow>
              <cylinderGeometry args={[0.45, 0.5, 0.12, 14]} />
              <meshStandardMaterial color="#8d8a84" metalness={0.6} roughness={0.5} />
            </mesh>
          </group>
        )
      })}
      {/* the unloading ramp the modules slid down */}
      <mesh position={[-4.4, 1.9, 0]} rotation-z={0.48} castShadow receiveShadow>
        <boxGeometry args={[4.6, 0.12, 2.6]} />
        <meshStandardMaterial color="#8f8c85" metalness={0.6} roughness={0.45} />
      </mesh>
    </group>
  )
}

/* ---------------- rigid modules ---------------- */

interface ModuleSpec {
  to: [number, number, number]
  rotY: number
  delay: number
}
const MODULES: ModuleSpec[] = [
  { to: [-1.2, 1.25, 2.4], rotY: 0.25, delay: 0 },
  { to: [-0.6, 1.25, -3.6], rotY: -0.3, delay: 0.55 },
]

function Module({ spec, windows }: { spec: ModuleSpec; windows: (m: THREE.MeshBasicMaterial) => void }) {
  const time = useShowTime()
  const ref = useRef<THREE.Group>(null)
  const from = useMemo(() => new THREE.Vector3(CARGO_POS[0], 4.5, CARGO_POS[2]), [])
  const to = useMemo(() => new THREE.Vector3(...spec.to), [spec])
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const t = time.current
    const k = seg(t, BASE.slide[0] + spec.delay, BASE.slide[1] - 0.55 + spec.delay)
    const e = easeInOutCubic(k)
    g.position.lerpVectors(from, to, e)
    // slides off the deck, drops down the ramp, then settles with a little bounce
    g.position.y = THREE.MathUtils.lerp(from.y, to.y, easeOutCubic(seg(k, 0.25, 1))) + 0.6 * Math.sin(Math.PI * k) * (1 - k)
    g.position.y += 0.12 * Math.max(0, ring(t, BASE.slide[1] - 0.55 + spec.delay, 13, 6))
    g.rotation.set(0, THREE.MathUtils.lerp(0.4, spec.rotY, e), 0.03 * ring(t, BASE.slide[1] - 0.55 + spec.delay, 10, 5))
  })
  return (
    <group ref={ref}>
      <mesh rotation-z={Math.PI / 2} castShadow receiveShadow>
        <cylinderGeometry args={[1.15, 1.15, 5, 28]} />
        <meshStandardMaterial color={HULL} metalness={0.25} roughness={0.55} />
      </mesh>
      {[-2.5, 2.5].map((x) => (
        <mesh key={x} position-x={x} rotation-z={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.95, 1.15, 0.3, 28]} />
          <meshStandardMaterial color="#a9a69e" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {[-1.2, 1.2].map((x) => (
        <mesh key={x} position={[x, -0.9, 0]} castShadow>
          <boxGeometry args={[0.3, 0.7, 1.9]} />
          <meshStandardMaterial color="#7d7a73" metalness={0.6} roughness={0.5} />
        </mesh>
      ))}
      {/* a band of foil and the windows facing both sides */}
      <mesh rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[1.165, 1.165, 0.5, 28]} />
        <meshStandardMaterial color={FOIL} metalness={0.8} roughness={0.3} />
      </mesh>
      {[-1.7, -0.9, 0.9, 1.7].flatMap((x) =>
        [1, -1].map((side) => (
          <mesh key={`${x}${side}`} position={[x, 0.35, side * 1.12]} rotation-x={side * 0.3}>
            <boxGeometry args={[0.42, 0.3, 0.06]} />
            <meshBasicMaterial ref={(m) => m && windows(m)} color={WINDOW_OFF} toneMapped={false} />
          </mesh>
        )),
      )}
    </group>
  )
}

/* ---------------- inflatable habitat ---------------- */

const DOME_POS: [number, number, number] = [-8, 0, -0.6]

function Dome({ outcome, windows }: { outcome: Outcome; windows: (m: THREE.MeshBasicMaterial) => void }) {
  const time = useShowTime()
  const ref = useRef<THREE.Group>(null)
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const t = time.current
    const k = seg(t, BASE.dome[0], BASE.dome[1])
    let sx = 0.22 + 0.78 * easeOutElastic(k)
    let sy = 0.06 + 0.94 * easeOutElastic(Math.max(0, k - 0.04) / 0.96)
    if (outcome === 'failed') {
      // swells to two thirds, then loses pressure and slumps, wrinkling as it goes
      const up = 0.22 + 0.5 * easeOutCubic(seg(t, BASE.dome[0], BASE.sag[0]))
      const down = easeInOutCubic(seg(t, BASE.sag[0], BASE.sag[1]))
      sx = up + (1.08 - up) * down
      sy = up * (1 - 0.68 * down) + 0.04 * Math.sin(t * 9) * down * (1 - down)
    }
    g.scale.set(sx, Math.max(0.05, sy), sx)
    if (mat.current) mat.current.color.set(outcome === 'failed' && t > BASE.sag[0] ? '#bdb7ab' : '#ebe6dc')
  })
  return (
    <group position={DOME_POS}>
      <group ref={ref}>
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[3.4, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial ref={mat} color="#ebe6dc" roughness={0.92} metalness={0} />
        </mesh>
        {/* restraint straps */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} rotation={[0, (i / 6) * Math.PI, 0]}>
            <torusGeometry args={[3.42, 0.04, 6, 64, Math.PI]} />
            <meshStandardMaterial color="#b9b2a2" roughness={0.8} />
          </mesh>
        ))}
        {[0.7, 1.5, 2.3, 3.1].map((a, i) => (
          <mesh key={i} position={[Math.cos(a + 0.9) * 3.0, 1.45, Math.sin(a + 0.9) * 3.0]} rotation-y={-(a + 0.9) + Math.PI / 2}>
            <boxGeometry args={[0.5, 0.36, 0.08]} />
            <meshBasicMaterial ref={(m) => m && windows(m)} color={WINDOW_OFF} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {/* the rigid core ring the habitat inflates from */}
      <mesh position-y={0.3} castShadow>
        <cylinderGeometry args={[1.2, 1.3, 0.6, 24]} />
        <meshStandardMaterial color="#a8a59d" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  )
}

/* ---------------- solar arrays ---------------- */

const PANELS = 7

function SolarArray({ position, jam, delay }: { position: [number, number, number]; jam: boolean; delay: number }) {
  const time = useShowTime()
  const mast = useRef<THREE.Mesh>(null)
  const head = useRef<THREE.Group>(null)
  const panels = useRef<(THREE.Group | null)[]>([])
  const MAST_H = 7.5
  useFrame(() => {
    const t = time.current
    const m = easeOutCubic(seg(t, BASE.masts[0] + delay, BASE.masts[1] + delay))
    if (mast.current) {
      mast.current.scale.set(1, Math.max(0.02, m), 1)
      mast.current.position.y = (MAST_H * m) / 2
    }
    if (head.current) head.current.position.y = MAST_H * m
    let k = easeOutBack(seg(t, BASE.panels[0] + delay, BASE.panels[1] + delay), 1.2)
    let shake = 0
    if (jam) {
      // stops dead part way and judders against the stuck hinge
      const stuckAt = 0.42
      if (k > stuckAt) {
        shake = 0.035 * Math.sin(t * 38) * Math.exp(-Math.max(0, t - (BASE.panels[0] + delay + 0.8)) * 1.2)
        k = stuckAt
      }
    }
    panels.current.forEach((p, i) => {
      if (!p) return
      const open = -Math.PI / 2 + (i / (PANELS - 1)) * Math.PI
      p.rotation.z = open * k + shake * (i - 3)
    })
  })
  return (
    <group position={position} rotation-y={FACE_SUN}>
      <mesh ref={mast} castShadow>
        <cylinderGeometry args={[0.12, 0.16, MAST_H, 10]} />
        <meshStandardMaterial color="#c7c3ba" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position-y={0.2} castShadow>
        <cylinderGeometry args={[0.6, 0.7, 0.4, 12]} />
        <meshStandardMaterial color="#8d8a84" metalness={0.6} roughness={0.45} />
      </mesh>
      <group ref={head}>
        <mesh>
          <cylinderGeometry args={[0.28, 0.28, 0.5, 14]} />
          <meshStandardMaterial color={FOIL} metalness={0.8} roughness={0.3} />
        </mesh>
        {Array.from({ length: PANELS }, (_, i) => (
          <group key={i} ref={(g) => void (panels.current[i] = g)} position-z={0.08 * (i - 3)}>
            <mesh position-y={2.05} castShadow>
              <boxGeometry args={[0.95, 3.6, 0.04]} />
              <meshStandardMaterial color="#1a2d55" metalness={0.55} roughness={0.25} emissive="#0b1630" emissiveIntensity={0.35} />
            </mesh>
            <mesh position-y={2.05}>
              <boxGeometry args={[0.99, 3.64, 0.02]} />
              <meshStandardMaterial color="#c4a050" metalness={0.8} roughness={0.35} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

/* ---------------- radiator ---------------- */

function Radiator() {
  const time = useShowTime()
  const hinges = useRef<(THREE.Group | null)[]>([])
  const N = 4
  const W = 0.85
  useFrame(() => {
    const k = easeInOutCubic(seg(time.current, BASE.radiator[0], BASE.radiator[1]))
    hinges.current.forEach((h, i) => {
      if (!h) return
      // an accordion: folded flat against each other, then straightening into one wing
      const folded = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.PI * 0.97
      h.rotation.y = folded * (1 - k)
    })
  })
  const chain = (i: number): ReactNode =>
    i >= N ? null : (
      <group ref={(g) => void (hinges.current[i] = g)} position-x={i === 0 ? 0 : W}>
        <mesh position-x={W / 2} castShadow>
          <boxGeometry args={[W, 1.05, 0.04]} />
          <meshStandardMaterial color="#f2f0ea" roughness={0.35} metalness={0.1} />
        </mesh>
        {chain(i + 1)}
      </group>
    )
  return (
    <group position={[MODULES[0].to[0] + 0.6, MODULES[0].to[1] + 1.85, MODULES[0].to[2] - 0.35]} rotation-y={Math.PI + 0.25}>
      <mesh position-y={-0.5}>
        <boxGeometry args={[0.12, 0.4, 0.12]} />
        <meshStandardMaterial color="#8d8a84" metalness={0.6} roughness={0.4} />
      </mesh>
      {chain(0)}
    </group>
  )
}

/* ---------------- the whole base ---------------- */

function useWindows(outcome: Outcome) {
  const time = useShowTime()
  const list = useRef<THREE.MeshBasicMaterial[]>([])
  const order = useRef<number[]>([])
  const flood = useRef<THREE.PointLight>(null)
  const add = (m: THREE.MeshBasicMaterial) => {
    if (!list.current.includes(m)) list.current.push(m)
  }
  useFrame(() => {
    const t = time.current
    const mats = list.current
    if (order.current.length !== mats.length) {
      const r = rng(5)
      order.current = mats.map((_, i) => i).sort(() => r() - 0.5)
    }
    let lit = 0
    order.current.forEach((idx, rank) => {
      const m = mats[idx]
      const n = mats.length
      const at = BASE.lights[0] + (rank / n) * (BASE.lights[1] - BASE.lights[0])
      let on = t > at ? 1 : 0
      if (outcome === 'partial' && rank % 2 === 1) on = 0
      if (outcome === 'failed') {
        // they come on dim and stutter, then die one by one
        const dieAt = BASE.flickerOut[0] + (rank / n) * (BASE.flickerOut[1] - BASE.flickerOut[0])
        const stutter = Math.sin(t * 31 + rank * 4.1) > 0.1 ? 0.55 : 0.1
        on = t > at ? (t < dieAt ? stutter : 0) : 0
      }
      lit += on
      m.color.copy(WINDOW_OFF).lerp(WINDOW_ON, on)
    })
    if (flood.current) flood.current.intensity = (mats.length ? lit / mats.length : 0) * 90
  })
  return { add, flood }
}

function Rig() {
  const time = useShowTime()
  const camera = useThree((s) => s.camera)
  const look = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const t = time.current
    const k = easeInOutCubic(seg(t, 0, 15))
    const a = 0.75 - 0.6 * k
    const r = 25 - 3 * k
    camera.position.set(Math.sin(a) * r - 1, 4.6 - 1.2 * k, Math.cos(a) * r)
    look.set(-1.2 - 0.6 * k, 2.3 + 0.9 * k, -1)
    camera.up.set(0, 1, 0)
    camera.lookAt(look)
  })
  return null
}

function Astronaut() {
  const time = useShowTime()
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = 0.9 + Math.sin(time.current * 0.4) * 0.25
  })
  return (
    <group ref={ref} position={[-4.4, 0, 3.6]}>
      <SafeModel
        id="model.env-astronaut"
        height={1.8}
        fallback={
          <mesh position-y={0.9} castShadow>
            <capsuleGeometry args={[0.32, 1.1, 6, 12]} />
            <meshStandardMaterial color="#eeeae2" roughness={0.7} />
          </mesh>
        }
      />
    </group>
  )
}

export function BaseScene({ outcome }: { outcome: Outcome }) {
  const { add, flood } = useWindows(outcome)
  return (
    <>
      <color attach="background" args={['#010203']} />
      <Rig />
      <Safe>
        <Starfield brightness={0.5} />
      </Safe>
      <LowSun position={SUN_POS} intensity={4.2} extent={26} />
      <LunarGround />
      <group position={[-70, 16, -270]}>
        <Safe>
          <Earth radius={7.5} spin={0.02} />
        </Safe>
      </group>
      <CargoLander />
      {MODULES.map((m, i) => (
        <Module key={i} spec={m} windows={add} />
      ))}
      <Dome outcome={outcome} windows={add} />
      <SolarArray position={[1.5, 0, -10.5]} jam={false} delay={0} />
      <SolarArray position={[8.5, 0, -10]} jam={outcome === 'partial'} delay={0.35} />
      <Radiator />
      <Astronaut />
      <pointLight ref={flood} position={[-3, 3.5, 3]} color="#ffcf95" distance={22} decay={1.5} intensity={0} />
      {/* regolith kicked up as the modules land */}
      <Burst count={260} origin={[MODULES[0].to[0], 0.2, MODULES[0].to[2]]} radius={2.4} from={BASE.slide[1] - 0.6} to={BASE.slide[1] - 0.4} speed={[1, 4]} life={[1, 2]} up={[0.1, 0.5]} gravity={1.6} floor={0} size={0.5} growth={1} color="#bdb4a4" opacity={0.5} seed={21} />
      <Burst count={260} origin={[MODULES[1].to[0], 0.2, MODULES[1].to[2]]} radius={2.4} from={BASE.slide[1]} to={BASE.slide[1] + 0.2} speed={[1, 4]} life={[1, 2]} up={[0.1, 0.5]} gravity={1.6} floor={0} size={0.5} growth={1} color="#bdb4a4" opacity={0.5} seed={22} />
    </>
  )
}
