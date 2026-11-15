import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { audio } from '../../assets/audio'
import { preloadModel, useModel } from '../../assets/models'
import { BODY_RADIUS_M, type RocketSlot } from '../../data/rocket'
import { useGameStore } from '../../state/gameStore'
import { layoutRocket, normalizeRocket, type PlacedPart } from '../../viz/rocket/rocketView'
import { cutsBetween, springStep } from '../../world/camera/rig'
import { Earth, Effects, prefersReducedMotion, Starfield, Sun } from '../space'
import { FairingBay } from './FairingRide'
import {
  ASCENT_SHOTS,
  T_END,
  T_START,
  TOWER,
  MOUNT_M,
  ascentPose,
  beatsBetween,
  canSkip,
  countdownText,
  fairingTime,
  rocketBase,
  stageOneOffset,
  type AscentSet,
  type AscentShot,
} from './ascentShots'
import { useAscentStore } from './ascentStore'

class Boundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}

const LOWER: readonly RocketSlot[] = ['engine', 'stage1', 'fins', 'boosters']

/** Mission time T from the store's start time */
function missionTime(startedAt: number) {
  return Math.min(T_END, (performance.now() - startedAt) / 1000 + T_START)
}

/* ---------------- the player's rocket, from the Launch Hangar's stack ---------------- */

function Part({ placed, dy }: { placed: PlacedPart; dy: number }) {
  const root = useModel(placed.part.model!)
  return <primitive object={root} position={[0, placed.y - dy, 0]} />
}

/** The stacked rocket's parts in metres; `only` keeps the lower (stage 1) or upper (stage 2 + nose) half */
function RocketParts({ placed, only, dy = 0 }: { placed: PlacedPart[]; only?: 'lower' | 'upper'; dy?: number }) {
  const parts = placed.filter((p) => (only === 'lower' ? LOWER.includes(p.slot) : only === 'upper' ? !LOWER.includes(p.slot) : true))
  return (
    <group scale={BODY_RADIUS_M}>
      <Boundary>
        <Suspense fallback={null}>
          {parts.map((p) => (
            <Part key={p.slot} placed={p} dy={dy} />
          ))}
        </Suspense>
      </Boundary>
    </group>
  )
}

/** Exhaust: a hot core and a long soft plume pointing down from the engine bell */
function Plume({ size, power }: { size: number; power: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  useFrame((st) => {
    const p = power.current
    const g = group.current
    if (!g) return
    g.visible = p > 0.01
    const flicker = 0.9 + 0.1 * Math.sin(st.clock.elapsedTime * 53)
    g.scale.set(size * (0.6 + 0.4 * p), size * p * flicker, size * (0.6 + 0.4 * p))
    if (light.current) light.current.intensity = 60 * p * flicker
  })
  return (
    <group ref={group} visible={false}>
      <mesh position={[0, -2.2, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.55, 4.4, 24, 1, true]} />
        <meshBasicMaterial color={new THREE.Color(7, 4.2, 1.6)} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position={[0, -6, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[1.1, 12, 24, 1, true]} />
        <meshBasicMaterial color={new THREE.Color(2.4, 1.1, 0.35)} transparent opacity={0.45} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, -3, 0]} color="#ffb060" intensity={0} distance={0} decay={1.4} />
    </group>
  )
}

/** Steam and smoke rolling out of the flame trench from engine start */
function Smoke({ clock }: { clock: React.RefObject<number> }) {
  const N = 26
  const puffs = useMemo(
    () =>
      Array.from({ length: N }, (_, i) => {
        // Out of the flame trench, away from the close-up camera (which stands on the +z side)
        const a = Math.PI * (0.05 + 0.9 * (i / (N - 1)))
        return { dir: new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)), delay: (i % 7) * 0.35, speed: 7 + (i % 5) * 2.5 }
      }),
    [],
  )
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d9d2c8', roughness: 1, transparent: true, opacity: 0.85, depthWrite: false }), [])
  useEffect(() => () => mat.dispose(), [mat])
  useFrame(() => {
    const t = clock.current + 3 // seconds since engine start
    puffs.forEach((p, i) => {
      const m = meshes.current[i]
      if (!m) return
      const s = t - p.delay
      m.visible = s > 0
      if (s <= 0) return
      const r = 6 + Math.min(70, p.speed * s * (1 - Math.min(0.6, s / 40)))
      m.position.set(p.dir.x * r, 3 + s * 0.9, p.dir.z * r)
      m.scale.setScalar(Math.min(16, 2 + s * 1.4))
    })
  })
  return (
    <>
      {puffs.map((_, i) => (
        <mesh key={i} ref={(m) => (meshes.current[i] = m)} material={mat} visible={false}>
          <icosahedronGeometry args={[1, 1]} />
        </mesh>
      ))}
    </>
  )
}

/** Open steel tower with an umbilical arm that swings away at T-0 */
function Tower() {
  const arm = useRef<THREE.Group>(null)
  const bars = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number] }[] = []
    const w = 7
    for (const x of [-w / 2, w / 2]) for (const z of [-w / 2, w / 2]) out.push({ p: [x, TOWER.heightM / 2, z], s: [0.6, TOWER.heightM, 0.6] })
    for (let y = 6; y < TOWER.heightM; y += 6) {
      out.push({ p: [0, y, -w / 2], s: [w, 0.4, 0.4] }, { p: [0, y, w / 2], s: [w, 0.4, 0.4] })
      out.push({ p: [-w / 2, y, 0], s: [0.4, 0.4, w] }, { p: [w / 2, y, 0], s: [0.4, 0.4, w] })
    }
    return out
  }, [])
  return (
    <group position={[TOWER.x, 0, 0]}>
      {bars.map((b, i) => (
        <mesh key={i} position={b.p}>
          <boxGeometry args={b.s} />
          <meshStandardMaterial color="#6c5a4a" roughness={0.8} metalness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, TOWER.heightM + 4, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 8]} />
        <meshStandardMaterial color="#8a8a8a" />
      </mesh>
      <mesh position={[0, TOWER.heightM + 8.3, 0]}>
        <sphereGeometry args={[0.5, 12, 8]} />
        <meshBasicMaterial color={new THREE.Color(3, 0.4, 0.3)} toneMapped={false} />
      </mesh>
      <group ref={arm} position={[-3.5, 42, 0]}>
        <mesh position={[-5, 0, 0]}>
          <boxGeometry args={[10, 1.2, 1.4]} />
          <meshStandardMaterial color="#5d4d40" roughness={0.8} />
        </mesh>
      </group>
    </group>
  )
}

function PadSet({ clock, placed, bottom }: { clock: React.RefObject<number>; placed: PlacedPart[]; bottom: number }) {
  const rocket = useRef<THREE.Group>(null)
  const power = useRef(0)
  useFrame(() => {
    const T = clock.current
    const [x, y, z] = rocketBase(T)
    // rocketBase is the bottom of the engine bell; the stack's origin sits `bottom` radii above it
    rocket.current?.position.set(x, y - bottom * BODY_RADIUS_M, z)
    if (rocket.current) rocket.current.rotation.z = -Math.min(0.12, Math.max(0, (T - 4) * 0.008))
    power.current = T < -3 ? 0 : T < 0 ? 0.35 + 0.15 * ((T + 3) / 3) : Math.min(1, 0.6 + T * 0.2)
  })
  return (
    <>
      <Sky distance={18000} sunPosition={[-1, 0.035, -0.35]} turbidity={9} rayleigh={2.6} mieCoefficient={0.008} mieDirectionalG={0.86} />
      <hemisphereLight args={['#8a93c4', '#3b2c22', 0.7]} />
      <directionalLight position={[-800, 60, -300]} intensity={1.9} color="#ffb27a" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[40000, 40000]} />
        <meshStandardMaterial color="#4a4136" roughness={1} />
      </mesh>
      {/* Launch mount and flame trench */}
      <mesh position={[0, MOUNT_M / 2 - 0.4, 0]}>
        <boxGeometry args={[7, MOUNT_M - 0.8, 7]} />
        <meshStandardMaterial color="#3a3835" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.2, 14]}>
        <boxGeometry args={[30, 0.4, 10]} />
        <meshStandardMaterial color="#2b2926" roughness={1} />
      </mesh>
      {/* Pad floodlights */}
      {[
        [-40, 30],
        [40, -30],
        [-30, -45],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 15, 0]}>
            <cylinderGeometry args={[0.3, 0.4, 30]} />
            <meshStandardMaterial color="#5a5a5a" />
          </mesh>
          <mesh position={[0, 30.5, 0]}>
            <boxGeometry args={[2.4, 1.2, 0.6]} />
            <meshBasicMaterial color={new THREE.Color(2.6, 2.4, 2)} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <spotLight position={[-40, 30, 30]} target-position={[0, 30, 0]} angle={0.5} penumbra={0.7} intensity={2600} color="#fff1d6" decay={1.6} />
      <Tower />
      <group ref={rocket}>
        <RocketParts placed={placed} />
        <group position={[0, bottom * BODY_RADIUS_M, 0]}>
          <Plume size={2.6} power={power} />
        </group>
      </group>
      <Smoke clock={clock} />
    </>
  )
}

/** On stage 2, looking aft: stage 1 attached, then falling away over a blue Earth */
function StagingSet({ clock, placed, coreTop, bottom }: { clock: React.RefObject<number>; placed: PlacedPart[]; coreTop: number; bottom: number }) {
  const lower = useRef<THREE.Group>(null)
  const upperFlame = useRef(0)
  const lowerFlame = useRef(1)
  useFrame(() => {
    const T = clock.current
    const off = stageOneOffset(T)
    if (lower.current) {
      lower.current.position.set(off.tumble * 2, off.y, 0)
      lower.current.rotation.set(0, 0, off.tumble * 0.5)
    }
    lowerFlame.current = off.y === 0 ? 1 : 0
    upperFlame.current = T > 22.5 ? Math.min(0.5, (T - 22.5) * 0.4) : 0
  })
  return (
    <>
      <Starfield brightness={0.6} />
      <Sun intensity={3.2} glare={false} />
      <ambientLight intensity={0.25} />
      <group position={[0, -3600, -900]}>
        <Earth radius={3200} spin={0} />
      </group>
      <RocketParts placed={placed} only="upper" dy={coreTop} />
      <group position={[0, 0, 0]}>
        <Plume size={0.5} power={upperFlame} />
      </group>
      <group ref={lower}>
        <RocketParts placed={placed} only="lower" dy={coreTop} />
        <group position={[0, (bottom - coreTop) * BODY_RADIUS_M, 0]}>
          <Plume size={2} power={lowerFlame} />
        </group>
      </group>
    </>
  )
}

/** Inside the fairing: the bay from FairingRide, on the mission clock */
function FairingSet({ clock }: { clock: React.RefObject<number> }) {
  const bay = useRef(0)
  useFrame(() => {
    bay.current = fairingTime(clock.current)
  })
  return <FairingBay clock={bay} wingsAt={fairingTime(35)} />
}

/* ---------------- the director: camera, cuts, sounds ---------------- */

const SHAKE_DEG = 1.4
const _look = new THREE.Vector3()
const SPACE_BG = new THREE.Color('#04070d')

function Director({
  clock,
  heightM,
  sets,
  onCut,
}: {
  clock: React.RefObject<number>
  heightM: number
  sets: Record<AscentSet, React.RefObject<THREE.Group | null>>
  onCut: (shot: AscentShot) => void
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const startedAt = useAscentStore((s) => s.startedAt)
  const end = useAscentStore((s) => s.end)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const prev = useRef(-Infinity)
  const lookPos = useRef(new THREE.Vector3())
  const lookVel = useRef(new THREE.Vector3())
  const done = useRef(false)

  useFrame((st, dt) => {
    if (done.current) return
    const T = missionTime(startedAt)
    clock.current = T
    const cuts = cutsBetween(ASCENT_SHOTS, prev.current, T)
    for (const shot of cuts) {
      audio.play(shot.cutSound)
      onCut(shot)
    }
    for (const b of beatsBetween(prev.current === -Infinity ? T_START - 1 : prev.current, T)) {
      if (b.sound) audio.play(b.sound)
      if (b.voice) audio.say(b.voice)
    }
    const pose = ascentPose(T, heightM, size.width / Math.max(1, size.height))
    // The pad has its dusk sky; space is black
    st.scene.background = pose.set === 'pad' ? null : SPACE_BG
    for (const key of Object.keys(sets) as AscentSet[]) {
      const g = sets[key].current
      if (g) g.visible = key === pose.set
    }

    const goal = _look.fromArray(pose.look)
    if (!pose.springLook || cuts.length > 0 || prev.current === -Infinity) {
      lookPos.current.copy(goal)
      lookVel.current.set(0, 0, 0)
    } else {
      springStep(lookPos.current, lookVel.current, goal, dt, 120)
    }
    camera.position.fromArray(pose.pos)
    const look = lookPos.current.clone()
    if (!reduced && pose.shake > 0) {
      const t = st.clock.elapsedTime
      const r = camera.position.distanceTo(look) * Math.tan((SHAKE_DEG * Math.PI) / 180) * pose.shake
      look.x += r * (0.6 * Math.sin(t * 41) + 0.4 * Math.sin(t * 67 + 1))
      look.y += r * (0.6 * Math.sin(t * 47 + 2) + 0.4 * Math.sin(t * 59))
    }
    camera.lookAt(look)
    if (camera.fov !== pose.fov || camera.near !== pose.near || camera.far !== pose.far) {
      camera.fov = pose.fov
      camera.near = pose.near
      camera.far = pose.far
      camera.updateProjectionMatrix()
    }
    prev.current = T
    if (T >= T_END) {
      done.current = true
      end(false)
    }
  })
  return null
}

/* ---------------- the overlay ---------------- */

function AscentScene({ onCut }: { onCut: (shot: AscentShot) => void }) {
  const rocketRaw = useGameStore((s) => s.design.rocket)
  const layout = useMemo(() => layoutRocket(normalizeRocket(rocketRaw).config), [rocketRaw])
  const coreTop = layout.placed.find((p) => p.slot === 'stage2')?.y ?? 0
  const clock = useRef(T_START)
  const pad = useRef<THREE.Group>(null)
  const staging = useRef<THREE.Group>(null)
  const fairing = useRef<THREE.Group>(null)
  const sets = useMemo(() => ({ pad, staging, fairing }), [])
  return (
    <>
      <Director clock={clock} heightM={layout.heightM} sets={sets} onCut={onCut} />
      <group ref={pad}>
        <Suspense fallback={null}>
          <PadSet clock={clock} placed={layout.placed} bottom={layout.bottom} />
        </Suspense>
      </group>
      <group ref={staging} visible={false}>
        <Boundary>
          <Suspense fallback={null}>
            <StagingSet clock={clock} placed={layout.placed} coreTop={coreTop} bottom={layout.bottom} />
          </Suspense>
        </Boundary>
      </group>
      <group ref={fairing} visible={false}>
        <Boundary>
          <Suspense fallback={null}>
            <FairingSet clock={clock} />
          </Suspense>
        </Boundary>
      </group>
      <Effects preset="night" />
    </>
  )
}

/** Warm the GLB cache so no cut lands on an empty set */
function preloadAscent() {
  const rocket = useGameStore.getState().design.rocket
  for (const p of layoutRocket(normalizeRocket(rocket).config).placed) preloadModel(p.part.model!)
  for (const id of ['model.sc-separation_ring', 'model.sc-deployer_6u_closed', 'model.sc-deployer_6u_open', 'model.sc-fairing_half', 'model.cubesat-6u'] as const) preloadModel(id)
}

/** The centre word: countdown numbers from T-5, LIFTOFF at T-0 */
function CountdownWord() {
  const startedAt = useAscentStore((s) => s.startedAt)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (ref.current) ref.current.textContent = countdownText(missionTime(startedAt))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [startedAt])
  return <div ref={ref} aria-hidden className="fp-display pointer-events-none absolute inset-x-0 top-[22%] text-center text-7xl tracking-widest text-paper drop-shadow-lg" />
}

/**
 * The launch ascent (vision §3.3 B): seven fixed shots, cut on a broadcast director's clock, from
 * the pad at dusk to the CubeSat's first beep. Shows while `useAscentStore().playing`; start it with
 * `playAscent()`. Skip is offered from the second viewing on.
 */
export function Ascent() {
  const playing = useAscentStore((s) => s.playing)
  const startedAt = useAscentStore((s) => s.startedAt)
  // A fresh player per run, so every run starts on shot 1
  return playing ? <AscentPlayer key={startedAt} /> : null
}

function AscentPlayer() {
  const timesWatched = useAscentStore((s) => s.timesWatched)
  const end = useAscentStore((s) => s.end)
  const [shot, setShot] = useState<AscentShot>(ASCENT_SHOTS[0])
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const skippable = canSkip(timesWatched, reduced)

  useEffect(() => {
    preloadAscent()
    document.documentElement.dataset.inside = 'ascent'
    return () => {
      if (document.documentElement.dataset.inside === 'ascent') delete document.documentElement.dataset.inside
    }
  }, [])
  useEffect(() => {
    if (!skippable) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [skippable, end])

  return (
    <div data-testid="ascent-overlay" data-shot={shot.n} className="fixed inset-0 z-[140] bg-ink-0">
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 28, position: [0, 1.5, 600], near: 0.5, far: 20000 }}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
        onCreated={({ scene, gl }) => {
          const pmrem = new THREE.PMREMGenerator(gl)
          scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
          scene.environmentIntensity = 0.4
          pmrem.dispose()
        }}
      >
        <AscentScene onCut={setShot} />
      </Canvas>
      <CountdownWord />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[10vh] bg-ink-0" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[10vh] items-center justify-center bg-ink-0">
        <p aria-live="polite" className="fp-data max-w-2xl px-6 text-center text-sm tracking-wide text-paper">
          {shot.caption}
        </p>
      </div>
      <div className="fp-label pointer-events-none absolute left-4 top-[10vh] mt-2 text-[10px] text-paper-dim">Shot {shot.n} / 7</div>
      {skippable && (
        <button type="button" onClick={() => end(true)} className="fp-btn-ghost absolute right-4 bottom-3 text-[11px] text-paper-dim">
          Skip ⏭ <span className="text-paper-faint">Esc</span>
        </button>
      )}
    </div>
  )
}
