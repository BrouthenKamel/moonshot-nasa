/**
 * Low-poly agency buildings with small life-like animations.
 * Every model is centred on its footprint and gets `active` (the mission is
 * here now) so it can work harder: more smoke, a faster crane, a shaking
 * test table. The launch site also gets `launched` to fly its rocket away.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { DoubleSide, type Group, type Mesh, type MeshStandardMaterial } from 'three'

export const PALETTE = {
  wall: '#f4f1ea',
  wallShade: '#e4e0d6',
  roof: '#2f4373',
  glass: '#7cc6f6',
  accent: '#ff8a1f',
  concrete: '#d9d6ce',
  curb: '#b9b5ab',
  steel: '#c4c9d1',
  dark: '#5b6370',
}

export interface ModelProps {
  active: boolean
  launched?: boolean
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

type V3 = [number, number, number]

function Block({
  size,
  position,
  color,
  radius = 0.08,
  rotation,
}: {
  size: V3
  position: V3
  color: string
  radius?: number
  rotation?: V3
}) {
  return (
    <RoundedBox args={size} radius={radius} smoothness={3} position={position} rotation={rotation} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.75} />
    </RoundedBox>
  )
}

function Glass({ size, position }: { size: V3; position: V3 }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={PALETTE.glass} emissive={PALETTE.glass} emissiveIntensity={0.25} roughness={0.2} metalness={0.2} />
    </mesh>
  )
}

/** Concrete plot with a darker curb */
function Pad({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Block size={[w - 0.15, 0.12, d - 0.15]} position={[0, 0.07, 0]} color={PALETTE.curb} radius={0.05} />
      <Block size={[w - 0.35, 0.12, d - 0.35]} position={[0, 0.11, 0]} color={PALETTE.concrete} radius={0.05} />
    </group>
  )
}

/** A small light that blinks */
function Blinker({ position, color = '#ff3b30', period = 1.4, offset = 0 }: { position: V3; color?: string; period?: number; offset?: number }) {
  const ref = useRef<MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const on = ((clock.elapsedTime + offset) % period) < period * 0.35
    ref.current.emissiveIntensity = on ? 2.5 : 0.1
  })
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.06, 10, 8]} />
      <meshStandardMaterial ref={ref} color={color} emissive={color} emissiveIntensity={1} />
    </mesh>
  )
}

/** Puffs rising from a chimney */
function Smoke({ position, rate = 1 }: { position: V3; rate?: number }) {
  const puffs = useRef<(Mesh | null)[]>([])
  useFrame(({ clock }) => {
    puffs.current.forEach((m, i) => {
      if (!m) return
      const t = ((clock.elapsedTime * 0.35 * rate + i / 4) % 1)
      m.position.set(Math.sin(t * 3 + i) * 0.12, t * 1.4, Math.cos(t * 2 + i) * 0.08)
      m.scale.setScalar(0.12 + t * 0.28)
      ;(m.material as MeshStandardMaterial).opacity = 0.75 * (1 - t)
    })
  })
  return (
    <group position={position}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} ref={(el) => (puffs.current[i] = el)}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#eef0f2" transparent opacity={0.6} flatShading depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Headquarters                                                        */
/* ------------------------------------------------------------------ */

export function Headquarters() {
  const flag = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 2) * 0.25
  })
  return (
    <group>
      <Pad w={4} d={4} />
      <Block size={[3.2, 0.9, 2.6]} position={[0, 0.62, -0.15]} color={PALETTE.wall} />
      <Glass size={[2.7, 0.3, 0.02]} position={[0, 0.66, 1.16]} />
      <Glass size={[0.02, 0.3, 2.2]} position={[1.61, 0.66, -0.15]} />
      <Block size={[3.35, 0.1, 2.75]} position={[0, 1.1, -0.15]} color={PALETTE.roof} radius={0.03} />
      {/* Tower */}
      <Block size={[1.5, 2.3, 1.5]} position={[-0.45, 2.2, -0.55]} color={PALETTE.wall} />
      {[1.65, 2.15, 2.65, 3.1].map((y) => (
        <group key={y}>
          <Glass size={[1.25, 0.22, 0.02]} position={[-0.45, y, 0.21]} />
          <Glass size={[0.02, 0.22, 1.25]} position={[0.31, y, -0.55]} />
        </group>
      ))}
      <Block size={[1.65, 0.14, 1.65]} position={[-0.45, 3.4, -0.55]} color={PALETTE.roof} radius={0.03} />
      {/* Mast with a warning light */}
      <mesh position={[-0.45, 3.85, -0.55]} castShadow>
        <cylinderGeometry args={[0.025, 0.035, 0.8, 6]} />
        <meshStandardMaterial color={PALETTE.dark} />
      </mesh>
      <Blinker position={[-0.45, 4.28, -0.55]} />
      {/* Flag */}
      <mesh position={[1.1, 1.35, 1.05]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 2.2, 6]} />
        <meshStandardMaterial color="#a3a9b2" />
      </mesh>
      <mesh ref={flag} position={[1.1, 2.25, 1.05]}>
        <planeGeometry args={[0.5, 0.3]} />
        <meshStandardMaterial color={PALETTE.accent} side={DoubleSide} />
      </mesh>
      {/* Entrance canopy and planters */}
      <Block size={[1.1, 0.07, 0.5]} position={[0.3, 0.95, 1.35]} color={PALETTE.accent} radius={0.02} />
      {[-1.2, 1.2].map((x) => (
        <group key={x} position={[x, 0.3, 1.45]}>
          <Block size={[0.4, 0.2, 0.3]} position={[0, 0, 0]} color={PALETTE.wallShade} radius={0.04} />
          <mesh position={[0, 0.2, 0]} castShadow>
            <icosahedronGeometry args={[0.18, 0]} />
            <meshStandardMaterial color="#4c9f43" flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

function Crane({ position, active }: { position: V3; active: boolean }) {
  const jib = useRef<Group>(null)
  const hook = useRef<Mesh>(null)
  useFrame(({ clock }, dt) => {
    if (jib.current) jib.current.rotation.y += dt * (active ? 0.5 : 0.08)
    if (hook.current) hook.current.position.y = -0.6 - (Math.sin(clock.elapsedTime * (active ? 1.5 : 0.4)) + 1) * 0.35
  })
  return (
    <group position={position}>
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[0.16, 2.6, 0.16]} />
        <meshStandardMaterial color="#f2c230" />
      </mesh>
      <group ref={jib} position={[0, 2.6, 0]}>
        <mesh position={[0.55, 0, 0]} castShadow>
          <boxGeometry args={[1.7, 0.1, 0.12]} />
          <meshStandardMaterial color="#f2c230" />
        </mesh>
        <mesh position={[-0.4, 0, 0]} castShadow>
          <boxGeometry args={[0.3, 0.2, 0.25]} />
          <meshStandardMaterial color={PALETTE.dark} />
        </mesh>
        <mesh ref={hook} position={[1.2, -0.6, 0]}>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          <meshStandardMaterial color={PALETTE.dark} />
        </mesh>
      </group>
    </group>
  )
}

export function Factory({ active }: ModelProps) {
  return (
    <group>
      <Pad w={4} d={4} />
      <Block size={[3.0, 1.2, 2.5]} position={[-0.3, 0.77, -0.25]} color={PALETTE.wall} />
      {/* Sawtooth roof: north lights */}
      {[-1.15, -0.32, 0.5].map((z) => (
        <group key={z} position={[-0.3, 1.38, z]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.42, 0.42, 2.95, 3]} />
            <meshStandardMaterial color={PALETTE.roof} flatShading />
          </mesh>
        </group>
      ))}
      {/* Doors */}
      <Block size={[1.1, 0.8, 0.05]} position={[-0.9, 0.58, 1.0]} color={PALETTE.accent} radius={0.02} />
      <Block size={[0.8, 0.8, 0.05]} position={[0.45, 0.58, 1.0]} color={PALETTE.accent} radius={0.02} />
      <Glass size={[0.02, 0.28, 1.9]} position={[1.21, 0.95, -0.25]} />
      {/* Chimney */}
      <mesh position={[0.85, 1.9, -1.15]} castShadow>
        <cylinderGeometry args={[0.13, 0.16, 1.1, 10]} />
        <meshStandardMaterial color="#9aa1ab" />
      </mesh>
      <mesh position={[0.85, 2.38, -1.15]}>
        <cylinderGeometry args={[0.14, 0.14, 0.08, 10]} />
        <meshStandardMaterial color={PALETTE.accent} />
      </mesh>
      <Smoke position={[0.85, 2.45, -1.15]} rate={active ? 1.6 : 0.6} />
      <Crane position={[1.5, 0.12, 1.2]} active={active} />
      {/* Crates */}
      {(
        [
          [-1.55, 0.32, 1.5],
          [-1.15, 0.32, 1.55],
          [-1.35, 0.66, 1.52],
        ] as V3[]
      ).map((p, i) => (
        <Block key={i} size={[0.34, 0.34, 0.34]} position={p} color={i === 2 ? '#c98a3d' : '#e0a24f'} radius={0.03} />
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Test Facility                                                       */
/* ------------------------------------------------------------------ */

export function TestFacility({ active }: ModelProps) {
  const sat = useRef<Group>(null)
  const door = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (sat.current) {
      const shake = active ? 0.025 : 0.004
      sat.current.position.x = Math.sin(clock.elapsedTime * 40) * shake
      sat.current.position.z = Math.cos(clock.elapsedTime * 33) * shake
    }
    if (door.current) door.current.rotation.y = active ? 0 : -0.9
  })
  return (
    <group>
      <Pad w={4} d={4} />
      <Block size={[2.6, 0.9, 1.2]} position={[-0.45, 0.62, -1.1]} color={PALETTE.wall} />
      <Block size={[2.75, 0.1, 1.35]} position={[-0.45, 1.11, -1.1]} color={PALETTE.roof} radius={0.03} />
      <Glass size={[2.1, 0.25, 0.02]} position={[-0.45, 0.68, -0.49]} />
      <Blinker position={[0.6, 1.25, -1.1]} color="#ffb020" period={1.1} />
      {/* Thermal-vacuum chamber */}
      <group position={[0.75, 0.8, 0.55]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.6, 0.6, 1.6, 28]} />
          <meshStandardMaterial color={PALETTE.steel} metalness={0.55} roughness={0.3} />
        </mesh>
        {[-0.55, 0, 0.55].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.61, 0.03, 6, 28]} />
            <meshStandardMaterial color="#9aa1ab" metalness={0.5} />
          </mesh>
        ))}
        <group ref={door} position={[0.82, 0, -0.5]}>
          <mesh position={[0, 0, 0.5]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.52, 0.52, 0.06, 28]} />
            <meshStandardMaterial color="#8d939c" metalness={0.5} roughness={0.35} />
          </mesh>
        </group>
        {[-0.5, 0.5].map((x) => (
          <mesh key={x} position={[x, -0.58, 0]}>
            <boxGeometry args={[0.14, 0.3, 0.9]} />
            <meshStandardMaterial color={PALETTE.dark} />
          </mesh>
        ))}
      </group>
      {/* Shaker table with a CubeSat */}
      <group position={[-1.05, 0.15, 0.8]}>
        <Block size={[0.8, 0.28, 0.8]} position={[0, 0.14, 0]} color={PALETTE.dark} radius={0.04} />
        <group ref={sat}>
          <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[0.2, 0.4, 0.3]} />
            <meshStandardMaterial color="#d9a441" metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh position={[0.18, 0.5, 0]}>
            <boxGeometry args={[0.16, 0.36, 0.01]} />
            <meshStandardMaterial color="#2c4f9e" />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Launch Site                                                         */
/* ------------------------------------------------------------------ */

function Rocket() {
  return (
    <group>
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.24, 2, 20]} />
        <meshStandardMaterial color="#f7f8fa" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.65, 0]}>
        <cylinderGeometry args={[0.225, 0.225, 0.16, 20]} />
        <meshStandardMaterial color={PALETTE.roof} />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <cylinderGeometry args={[0.245, 0.245, 0.1, 20]} />
        <meshStandardMaterial color={PALETTE.accent} />
      </mesh>
      <mesh position={[0, 2.45, 0]} castShadow>
        <coneGeometry args={[0.22, 0.5, 20]} />
        <meshStandardMaterial color={PALETTE.accent} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[Math.cos((i * 2 * Math.PI) / 3) * 0.26, 0.35, Math.sin((i * 2 * Math.PI) / 3) * 0.26]}
          rotation={[0, (-i * 2 * Math.PI) / 3, 0]}
          castShadow
        >
          <boxGeometry args={[0.26, 0.42, 0.04]} />
          <meshStandardMaterial color={PALETTE.roof} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * The rocket stands on the pad until the mission launches. When `launched`
 * turns true while the base is open, it lifts off with a flame and smoke;
 * if it was already launched when the base opened, the pad is simply empty.
 */
function LaunchingRocket({ launched }: { launched: boolean }) {
  const group = useRef<Group>(null)
  const flame = useRef<Mesh>(null)
  const startedAt = useRef<number | null>(null)
  const [state, setState] = useState<'pad' | 'flying' | 'gone'>(launched ? 'gone' : 'pad')

  useEffect(() => {
    if (launched && state === 'pad') {
      startedAt.current = null
      setState('flying')
    }
    if (!launched && state !== 'pad') setState('pad')
  }, [launched, state])

  useFrame(({ clock }) => {
    if (!group.current) return
    if (state !== 'flying') {
      group.current.position.y = 0
      return
    }
    if (startedAt.current === null) startedAt.current = clock.elapsedTime
    const t = clock.elapsedTime - startedAt.current
    group.current.position.y = t < 0.8 ? Math.sin(t * 60) * 0.01 : (t - 0.8) ** 2 * 1.6
    if (flame.current) flame.current.scale.y = 0.8 + Math.random() * 0.5
    if (t > 7) setState('gone')
  })

  if (state === 'gone') return null
  return (
    <group ref={group}>
      <Rocket />
      {state === 'flying' && (
        <mesh ref={flame} position={[0, -0.05, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.18, 0.7, 12]} />
          <meshStandardMaterial color="#ffb020" emissive="#ff7a00" emissiveIntensity={2} transparent opacity={0.9} />
        </mesh>
      )}
      {state === 'flying' && <Smoke position={[0, -0.2, 0]} rate={3} />}
    </group>
  )
}

export function LaunchSite({ launched = false }: ModelProps) {
  return (
    <group>
      <Pad w={5} d={5} />
      <mesh position={[0, 0.22, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.5, 1.6, 0.18, 36]} />
        <meshStandardMaterial color="#bfc3c9" />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[0.6, 0.03, 2.6]} />
        <meshStandardMaterial color="#4a4f57" />
      </mesh>
      <group position={[0, 0.12, 0]}>
        <LaunchingRocket launched={launched} />
      </group>
      {/* Service tower: four legs and cross bars */}
      <group position={[-0.8, 0, -0.35]}>
        {(
          [
            [-0.18, -0.18],
            [0.18, -0.18],
            [-0.18, 0.18],
            [0.18, 0.18],
          ] as [number, number][]
        ).map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, 1.7, z]} castShadow>
            <boxGeometry args={[0.05, 3.2, 0.05]} />
            <meshStandardMaterial color="#d9452b" />
          </mesh>
        ))}
        {[0.6, 1.2, 1.8, 2.4, 3.0].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <boxGeometry args={[0.42, 0.04, 0.42]} />
            <meshStandardMaterial color="#d9452b" />
          </mesh>
        ))}
        <mesh position={[0.45, 2.25, 0.18]} castShadow>
          <boxGeometry args={[0.6, 0.07, 0.08]} />
          <meshStandardMaterial color="#d9452b" />
        </mesh>
        <Blinker position={[0, 3.36, 0]} />
      </group>
      {/* Propellant tanks */}
      {(
        [
          [1.65, 1.35],
          [1.65, 0.75],
        ] as [number, number][]
      ).map(([x, z]) => (
        <mesh key={z} position={[x, 0.48, z]} castShadow>
          <sphereGeometry args={[0.3, 18, 14]} />
          <meshStandardMaterial color="#f2f3f5" roughness={0.4} />
        </mesh>
      ))}
      {/* Light poles */}
      {(
        [
          [-2.0, -2.0],
          [2.0, -2.0],
          [-2.0, 2.0],
        ] as [number, number][]
      ).map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.95, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 1.6, 6]} />
            <meshStandardMaterial color={PALETTE.dark} />
          </mesh>
          <mesh position={[0, 1.78, 0]}>
            <boxGeometry args={[0.2, 0.08, 0.12]} />
            <meshStandardMaterial color="#fff6c8" emissive="#fff6c8" emissiveIntensity={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Communications Center                                               */
/* ------------------------------------------------------------------ */

function Dish({ position, phase, active }: { position: V3; phase: number; active: boolean }) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = phase + Math.sin(clock.elapsedTime * (active ? 0.4 : 0.12) + phase) * 0.8
  })
  return (
    <group position={position}>
      <mesh position={[0, 0.38, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.2, 0.75, 10]} />
        <meshStandardMaterial color="#9aa1ab" />
      </mesh>
      <group ref={ref} position={[0, 0.85, 0]}>
        <group rotation={[-0.75, 0, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.78, 28, 10, 0, Math.PI * 2, 0, 0.75]} />
            <meshStandardMaterial color="#f6f7f9" side={DoubleSide} roughness={0.5} />
          </mesh>
          <mesh position={[0, -0.36, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.75, 6]} />
            <meshStandardMaterial color={PALETTE.dark} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

export function CommsCenter({ active }: ModelProps) {
  return (
    <group>
      <Pad w={4} d={4} />
      <Block size={[2.2, 0.9, 1.7]} position={[-0.65, 0.62, 0.65]} color={PALETTE.wall} />
      <Block size={[2.35, 0.1, 1.85]} position={[-0.65, 1.11, 0.65]} color={PALETTE.roof} radius={0.03} />
      <Glass size={[1.8, 0.28, 0.02]} position={[-0.65, 0.68, 1.51]} />
      <Glass size={[0.02, 0.28, 1.3]} position={[0.46, 0.68, 0.65]} />
      <mesh position={[-1.35, 1.65, 0.25]} castShadow>
        <cylinderGeometry args={[0.025, 0.03, 1.0, 6]} />
        <meshStandardMaterial color={PALETTE.dark} />
      </mesh>
      <Blinker position={[-1.35, 2.18, 0.25]} color="#34d058" period={0.9} />
      <Dish position={[0.9, 0.12, -0.9]} phase={0.6} active={active} />
      <Dish position={[-0.85, 0.12, -1.1]} phase={2.2} active={active} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Research Lab                                                        */
/* ------------------------------------------------------------------ */

export function ResearchLab({ active }: ModelProps) {
  const dome = useRef<Group>(null)
  useFrame((_, dt) => {
    if (dome.current) dome.current.rotation.y += dt * (active ? 0.35 : 0.06)
  })
  return (
    <group>
      <Pad w={4} d={4} />
      <Block size={[2.7, 1.3, 2.3]} position={[-0.25, 0.83, -0.25]} color={PALETTE.wall} />
      <Block size={[2.85, 0.1, 2.45]} position={[-0.25, 1.53, -0.25]} color={PALETTE.roof} radius={0.03} />
      {[0.62, 1.12].map((y) => (
        <group key={y}>
          <Glass size={[2.3, 0.26, 0.02]} position={[-0.25, y, 0.91]} />
          <Glass size={[0.02, 0.26, 1.9]} position={[1.11, y, -0.25]} />
        </group>
      ))}
      <Block size={[0.9, 0.06, 0.4]} position={[0.35, 0.56, 1.1]} color={PALETTE.accent} radius={0.02} />
      {/* Observatory dome with telescope */}
      <group position={[-0.55, 1.6, -0.55]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.72, 0.72, 0.25, 28]} />
          <meshStandardMaterial color="#dfe2e8" />
        </mesh>
        <group ref={dome}>
          <mesh position={[0, 0.12, 0]} castShadow>
            <sphereGeometry args={[0.68, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#c4cad3" metalness={0.35} roughness={0.35} />
          </mesh>
          <mesh position={[0.32, 0.62, 0.32]} rotation={[-0.6, Math.PI / 4, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.13, 0.9, 12]} />
            <meshStandardMaterial color={PALETTE.dark} />
          </mesh>
        </group>
      </group>
      <Block size={[0.95, 0.6, 0.85]} position={[1.2, 0.45, 1.2]} color={PALETTE.wallShade} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Traffic                                                             */
/* ------------------------------------------------------------------ */

function Truck({ color }: { color: string }) {
  return (
    <group>
      <Block size={[0.5, 0.26, 0.26]} position={[-0.06, 0.24, 0]} color={color} radius={0.04} />
      <Block size={[0.18, 0.22, 0.24]} position={[0.28, 0.22, 0]} color="#f4f1ea" radius={0.04} />
      {[-0.2, 0.22].map((x) => (
        <mesh key={x} position={[x, 0.09, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.3, 10]} />
          <meshStandardMaterial color="#2b2f36" />
        </mesh>
      ))}
    </group>
  )
}

/** Two little trucks driving up and down the main streets */
export function Traffic({ streetA, streetB, from, to }: { streetA: number; streetB: number; from: number; to: number }) {
  const a = useRef<Group>(null)
  const b = useMemo(() => ({ current: null as Group | null }), [])
  useFrame(({ clock }) => {
    const span = to - from
    const ping = (t: number) => {
      const u = t % 2
      return u < 1 ? u : 2 - u
    }
    const ta = clock.elapsedTime / 14
    const pa = ping(ta)
    if (a.current) {
      a.current.position.set(from + pa * span, 0.05, streetA + 0.18 * (ta % 2 < 1 ? 1 : -1))
      a.current.rotation.y = ta % 2 < 1 ? 0 : Math.PI
    }
    const tb = clock.elapsedTime / 18 + 0.5
    const pb = ping(tb)
    if (b.current) {
      b.current.position.set(streetB + 0.18 * (tb % 2 < 1 ? -1 : 1), 0.05, from + pb * span)
      b.current.rotation.y = tb % 2 < 1 ? -Math.PI / 2 : Math.PI / 2
    }
  })
  return (
    <group>
      <group ref={a}>
        <Truck color={PALETTE.accent} />
      </group>
      <group ref={(el) => (b.current = el)}>
        <Truck color="#3d7be0" />
      </group>
    </group>
  )
}
