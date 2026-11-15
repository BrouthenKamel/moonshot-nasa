import { Component, Suspense, createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Color, DoubleSide, MOUSE, TOUCH, Vector3, type Group, type InstancedMesh, Mesh, Object3D, type OrthographicCamera } from 'three'
import type { ModelId } from '../assets/manifest'
import { useModel } from '../assets/models'
import { MAP_SIZE, buildings, type BuildingId } from '../data/agency'
import { BuildingList, MapBoundary } from './BuildingList'
import { canUseWebGL } from './webgl'
import { BaseEffects, ChimneySmoke, Clouds, Truck } from './base/Life'
import { FOREST_REACH, Forest } from './base/Forest'
import { Blinker, Spin } from './base/Animated'
import { HQ_LABEL_HEIGHT, HQ_SIZE, HQ_TILE, Headquarters } from './base/Headquarters'

class ModelBoundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}

function LoadedModel({
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
  useLayoutEffect(() => {
    scene.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })
  }, [scene])
  return <primitive object={scene} position={position} rotation={rotation} scale={scale} />
}

function SafeModel({
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
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedModel id={id} {...props} />
      </Suspense>
    </ModelBoundary>
  )
}

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

const HALF = MAP_SIZE / 2

/** World position of a tile's corner */
const tileToWorld = (x: number, z: number): [number, number] => [x - HALF, z - HALF]

/** World centre of a footprint */
function footprintCenter(tile: [number, number], size: [number, number]): [number, number, number] {
  const [x, z] = tileToWorld(tile[0] + size[0] / 2, tile[1] + size[1] / 2)
  return [x, 0, z]
}

const key = (x: number, z: number) => `${x},${z}`

const HQ_CENTER = footprintCenter(HQ_TILE, HQ_SIZE)

/** Road tiles: a main street on z = 7, a cross street on x = 7, short spurs to each door */
function roadTiles(): Set<string> {
  const roads = new Set<string>()
  for (let x = 1; x <= 18; x++) roads.add(key(x, 7))
  for (let z = 1; z <= 17; z++) roads.add(key(7, z))
  ;[
    [4, 6], [3, 6], // research lab
    [11, 6], // factory
    [6, 11], [6, 12], // comms center
    [8, 11], // launch site
    [16, 8], [16, 9], // headquarters
  ].forEach(([x, z]) => roads.add(key(x, z)))
  return roads
}

function occupiedTiles(): Set<string> {
  const used = new Set<string>()
  const add = (tile: [number, number], size: [number, number], pad = 0) => {
    for (let x = tile[0] - pad; x < tile[0] + size[0] + pad; x++)
      for (let z = tile[1] - pad; z < tile[1] + size[1] + pad; z++) used.add(key(x, z))
  }
  buildings.forEach((b) => add(b.tile, b.size, 1))
  add(HQ_TILE, HQ_SIZE, 1)
  return used
}

/** Small deterministic random generator so trees land in the same place every time */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------------ */
/* Ground                                                              */
/* ------------------------------------------------------------------ */

// Golden-hour Florida coast: sun-bleached scrub greens and sand roads
const GRASS_A = new Color('#8a9a58')
const GRASS_B = new Color('#829353')
const ROAD = new Color('#d8c095')

function Ground() {
  const ref = useRef<InstancedMesh>(null)
  const roads = useMemo(roadTiles, [])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    let i = 0
    for (let x = 0; x < MAP_SIZE; x++) {
      for (let z = 0; z < MAP_SIZE; z++) {
        const [wx, wz] = tileToWorld(x + 0.5, z + 0.5)
        const isRoad = roads.has(key(x, z))
        dummy.position.set(wx, isRoad ? 0.005 : 0, wz)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        mesh.setColorAt(i, isRoad ? ROAD : (x + z) % 2 === 0 ? GRASS_A : GRASS_B)
        i++
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [roads])

  return (
    <group>
      {/* Tiles */}
      <instancedMesh ref={ref} args={[undefined, undefined, MAP_SIZE * MAP_SIZE]} receiveShadow>
        <boxGeometry args={[1, 0.1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>
      {/* Earth block under the island */}
      <mesh position={[0, -0.45, 0]}>
        <boxGeometry args={[MAP_SIZE, 0.8, MAP_SIZE]} />
        <meshStandardMaterial color="#8a6646" />
      </mesh>
      {/* Grass beyond the island */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.86, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#7a8a50" />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Scenery                                                             */
/* ------------------------------------------------------------------ */

function Tree({ position, scale }: { position: [number, number, number]; scale: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.1, 0.5, 6]} />
        <meshStandardMaterial color="#6e4f36" />
      </mesh>
      <mesh position={[0, 0.75, 0]} castShadow>
        <icosahedronGeometry args={[0.38, 0]} />
        <meshStandardMaterial color="#56703f" flatShading />
      </mesh>
      <mesh position={[0.05, 1.05, 0.02]} castShadow>
        <icosahedronGeometry args={[0.26, 0]} />
        <meshStandardMaterial color="#647f46" flatShading />
      </mesh>
    </group>
  )
}

function Rock({ position, scale }: { position: [number, number, number]; scale: number }) {
  return (
    <mesh position={position} scale={scale} castShadow>
      <dodecahedronGeometry args={[0.22, 0]} />
      <meshStandardMaterial color="#aaa597" flatShading />
    </mesh>
  )
}

function Scenery() {
  const items = useMemo(() => {
    const roads = roadTiles()
    const used = occupiedTiles()
    const rand = mulberry32(7)
    const trees: { position: [number, number, number]; scale: number }[] = []
    const rocks: { position: [number, number, number]; scale: number }[] = []
    for (let x = 0; x < MAP_SIZE; x++) {
      for (let z = 0; z < MAP_SIZE; z++) {
        if (roads.has(key(x, z)) || used.has(key(x, z))) continue
        const edge = x === 0 || z === 0 || x === MAP_SIZE - 1 || z === MAP_SIZE - 1
        const r = rand()
        const [wx, wz] = tileToWorld(x + 0.3 + rand() * 0.4, z + 0.3 + rand() * 0.4)
        if (r < (edge ? 0.55 : 0.12)) trees.push({ position: [wx, 0.05, wz], scale: 0.8 + rand() * 0.5 })
        else if (r > 0.96) rocks.push({ position: [wx, 0.12, wz], scale: 0.7 + rand() * 0.8 })
      }
    }
    return { trees, rocks }
  }, [])

  return (
    <group>
      {items.trees.map((t, i) => (
        <Tree key={i} {...t} />
      ))}
      {items.rocks.map((r, i) => (
        <Rock key={i} {...r} />
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */

const WALL = '#ece5d6'
const ROOF = '#2f3a4c'
const GLASS = '#7fa3bd'
const ACCENT = '#e8a33d'
const CONCRETE = '#c9c3b6'

function Pad({ w, d }: { w: number; d: number }) {
  return (
    <mesh position={[0, 0.1, 0]} receiveShadow>
      <boxGeometry args={[w - 0.2, 0.1, d - 0.2]} />
      <meshStandardMaterial color={CONCRETE} />
    </mesh>
  )
}

function ResearchLab() {
  return (
    <group>
      <Pad w={4} d={4} />
      {/* Main block */}
      <mesh position={[-0.2, 0.85, -0.2]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 1.4, 2.4]} />
        <meshStandardMaterial color={WALL} />
      </mesh>
      <mesh position={[-0.2, 1.6, -0.2]} castShadow>
        <boxGeometry args={[2.95, 0.12, 2.55]} />
        <meshStandardMaterial color={ROOF} />
      </mesh>
      {/* Window bands on the two visible sides */}
      {[0.6, 1.15].map((y) => (
        <group key={y}>
          <mesh position={[-0.2, y, 1.01]}>
            <boxGeometry args={[2.4, 0.28, 0.02]} />
            <meshStandardMaterial color={GLASS} emissive={GLASS} emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[1.21, y, -0.2]}>
            <boxGeometry args={[0.02, 0.28, 2.0]} />
            <meshStandardMaterial color={GLASS} emissive={GLASS} emissiveIntensity={0.15} />
          </mesh>
        </group>
      ))}
      {/* Entrance awning */}
      <mesh position={[0.4, 0.55, 1.2]} castShadow>
        <boxGeometry args={[0.9, 0.06, 0.4]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>
      {/* Observatory dome with telescope */}
      <group position={[-0.5, 1.66, -0.5]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.72, 0.72, 0.25, 24]} />
          <meshStandardMaterial color="#d7dbe2" />
        </mesh>
        <mesh position={[0, 0.12, 0]} castShadow>
          <sphereGeometry args={[0.68, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#b9c0cb" metalness={0.3} roughness={0.4} />
        </mesh>
        {/* The telescope sweeps the sky */}
        <Spin rpm={3} swing={0.9}>
          <mesh position={[0.35, 0.65, 0.35]} rotation={[-0.6, Math.PI / 4, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.13, 0.9, 12]} />
            <meshStandardMaterial color="#59616e" />
          </mesh>
        </Spin>
      </group>
      <Blinker position={[1.2, 0.82, 1.2]} color="#34d399" period={2.4} />
      {/* Side annex */}
      <mesh position={[1.2, 0.45, 1.2]} castShadow>
        <boxGeometry args={[1, 0.6, 0.9]} />
        <meshStandardMaterial color="#dfe4ec" />
      </mesh>
    </group>
  )
}

function FactoryHallFallback() {
  return (
    <group>
      {/* Hall */}
      <mesh position={[-0.2, 0.75, -0.2]} castShadow receiveShadow>
        <boxGeometry args={[4, 1.2, 2.8]} />
        <meshStandardMaterial color="#e3e6eb" />
      </mesh>
      {/* Sawtooth roof: triangular prisms running along x */}
      {[-1.1, -0.2, 0.7].map((z) => (
        <group key={z} position={[-0.2, 1.5, z]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.52, 0.52, 3.9, 3]} />
            <meshStandardMaterial color={ROOF} flatShading />
          </mesh>
        </group>
      ))}
      {/* Big doors */}
      <mesh position={[-1.1, 0.55, 1.21]}>
        <boxGeometry args={[1.2, 0.85, 0.03]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>
      <mesh position={[0.6, 0.55, 1.21]}>
        <boxGeometry args={[1.2, 0.85, 0.03]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>
      {/* Windows on the side */}
      <mesh position={[1.81, 0.9, -0.2]}>
        <boxGeometry args={[0.02, 0.3, 2.2]} />
        <meshStandardMaterial color={GLASS} />
      </mesh>
    </group>
  )
}

function Factory() {
  return (
    <group>
      <Pad w={5} d={4} />
      {/* NASA Vehicle Assembly Building (VAB) as the primary integration bay */}
      <SafeModel
        id="model.env-vab"
        position={[-0.35, 0.1, -0.15]}
        rotation={[0, -Math.PI / 2, 0]}
        scale={0.145}
        fallback={<FactoryHallFallback />}
      />
      {/* Cleanroom utility annex + chimney */}
      <mesh position={[1.3, 2.0, -1.2]} castShadow>
        <cylinderGeometry args={[0.15, 0.18, 1.2, 10]} />
        <meshStandardMaterial color="#8d939c" />
      </mesh>
      <ChimneySmoke position={[1.3, 2.65, -1.2]} />
      {/* Roof fan */}
      <mesh position={[-1.4, 2.08, 0.7]}>
        <cylinderGeometry args={[0.3, 0.3, 0.12, 12]} />
        <meshStandardMaterial color="#8d939c" />
      </mesh>
      <Spin position={[-1.4, 2.16, 0.7]} rpm={40}>
        <mesh>
          <boxGeometry args={[0.5, 0.03, 0.08]} />
          <meshStandardMaterial color="#4a4f57" />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[0.5, 0.03, 0.08]} />
          <meshStandardMaterial color="#4a4f57" />
        </mesh>
      </Spin>
      {/* Work lights over the doors */}
      <Blinker position={[-1.1, 1.05, 1.25]} color="#fbbf24" period={1.2} />
      <Blinker position={[0.6, 1.05, 1.25]} color="#fbbf24" period={1.2} phase={0.6} />
      {/* Crates waiting outside */}
      {[
        [2.05, 0.35, 1.3],
        [2.05, 0.35, 0.8],
        [2.05, 0.75, 1.05],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color={i === 2 ? '#c98a3d' : '#e0a24f'} />
        </mesh>
      ))}
    </group>
  )
}

/** The launch playing on the pad: when the countdown started (performance.now()), or the rocket already gone */
const LaunchContext = createContext<{ launchAt: number | null; gone: boolean }>({ launchAt: null, gone: false })

/** Seconds from the countdown start to ignition; matches LAUNCH.ignitionS in src/state/uiStore.ts */
const IGNITION_S = 5.2
const PUFFS = 28

/** Exhaust, flame light and smoke for the launch, driven by the clock */
function LaunchEffects({ rocket }: { rocket: React.RefObject<Group | null> }) {
  const { launchAt } = useContext(LaunchContext)
  const flame = useRef<Group>(null)
  const light = useRef<import('three').PointLight>(null)
  useFrame(() => {
    const r = rocket.current
    if (!r) return
    if (launchAt === null) {
      r.position.set(0, 0, 0)
      if (flame.current) flame.current.visible = false
      if (light.current) light.current.intensity = 0
      return
    }
    const t = (performance.now() - launchAt) / 1000
    const lift = Math.max(0, t - IGNITION_S)
    // Engines light, the clamps hold for half a second, then the climb speeds up
    const climb = Math.max(0, lift - 0.5)
    const shake = t > IGNITION_S - 0.6 && climb < 1.5 ? 0.025 * Math.sin(t * 90) : 0
    r.position.set(shake, 0.6 * climb * climb, shake * 0.6)
    const burning = t > IGNITION_S - 0.3
    if (flame.current) {
      flame.current.visible = burning
      const flicker = 0.85 + 0.15 * Math.sin(t * 60)
      flame.current.scale.set(1, (0.8 + Math.min(1, lift) * 1.4) * flicker, 1)
    }
    if (light.current) light.current.intensity = burning ? 6 + 4 * Math.sin(t * 40) : 0
  })
  return (
    <>
      <group ref={flame} visible={false} position={[0, 0.12, 0]}>
        <mesh rotation={[Math.PI, 0, 0]} position={[0, -0.35, 0]}>
          <coneGeometry args={[0.2, 0.9, 14, 1, true]} />
          <meshBasicMaterial color="#ffb347" transparent opacity={0.9} />
        </mesh>
        <mesh rotation={[Math.PI, 0, 0]} position={[0, -0.22, 0]}>
          <coneGeometry args={[0.11, 0.5, 12, 1, true]} />
          <meshBasicMaterial color="#fff6d5" />
        </mesh>
        <pointLight ref={light} position={[0, -0.3, 0]} color="#ffa040" intensity={0} distance={6} />
      </group>
    </>
  )
}

/** Smoke rolling out from the pad at ignition, slowly fading */
function LaunchSmoke() {
  const { launchAt } = useContext(LaunchContext)
  const puffs = useRef<(import('three').Mesh | null)[]>([])
  const seeds = useMemo(() => {
    const rnd = mulberry32(7)
    return Array.from({ length: PUFFS }, () => ({ a: rnd() * Math.PI * 2, s: 0.6 + rnd() * 0.8, d: 0.6 + rnd() * 1.6, b: rnd() }))
  }, [])
  useFrame(() => {
    const t = launchAt === null ? -1 : (performance.now() - launchAt) / 1000
    puffs.current.forEach((p, i) => {
      if (!p) return
      const seed = seeds[i]
      const age = t - (IGNITION_S - 0.4 + seed.b * 2.2)
      if (launchAt === null || age <= 0 || age > 9) {
        p.visible = false
        return
      }
      p.visible = true
      const spread = Math.min(1, age / 2.5)
      p.position.set(Math.cos(seed.a) * seed.d * spread * 1.6, 0.35 + age * 0.12, Math.sin(seed.a) * seed.d * spread * 1.6)
      p.scale.setScalar(seed.s * (0.25 + Math.min(1, age / 1.8)) * Math.max(0.01, 1 - age / 9))
    })
  })
  return (
    <group>
      {seeds.map((_, i) => (
        <mesh key={i} ref={(m) => { puffs.current[i] = m }} visible={false}>
          <icosahedronGeometry args={[0.5, 1]} />
          <meshStandardMaterial color="#f3f1ec" roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  )
}

function Rocket() {
  const rocket = useRef<Group>(null)
  const { gone } = useContext(LaunchContext)
  if (gone) return null
  return (
    <group ref={rocket}>
      <LaunchEffects rocket={rocket} />
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 2, 16]} />
        <meshStandardMaterial color="#f7f8fa" />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.225, 0.225, 0.18, 16]} />
        <meshStandardMaterial color={ROOF} />
      </mesh>
      <mesh position={[0, 2.45, 0]} castShadow>
        <coneGeometry args={[0.22, 0.5, 16]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[Math.cos((i * 2 * Math.PI) / 3) * 0.25, 0.35, Math.sin((i * 2 * Math.PI) / 3) * 0.25]}
          rotation={[0, (-i * 2 * Math.PI) / 3, 0]}
          castShadow
        >
          <boxGeometry args={[0.25, 0.4, 0.04]} />
          <meshStandardMaterial color={ROOF} />
        </mesh>
      ))}
    </group>
  )
}

function ServiceTowerFallback() {
  return (
    <group position={[-0.75, 0, -0.3]}>
      <mesh position={[0, 1.65, 0]} castShadow>
        <boxGeometry args={[0.45, 3.1, 0.45]} />
        <meshStandardMaterial color="#d9452b" wireframe />
      </mesh>
      <mesh position={[0, 1.65, 0]} castShadow>
        <boxGeometry args={[0.12, 3.1, 0.12]} />
        <meshStandardMaterial color="#d9452b" />
      </mesh>
      <mesh position={[0.35, 2.3, 0.15]} castShadow>
        <boxGeometry args={[0.6, 0.08, 0.1]} />
        <meshStandardMaterial color="#d9452b" />
      </mesh>
    </group>
  )
}

function LaunchSite() {
  return (
    <group>
      <Pad w={5} d={5} />
      {/* Launch mount */}
      <mesh position={[0, 0.2, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.5, 1.6, 0.2, 32]} />
        <meshStandardMaterial color="#b4b8bf" />
      </mesh>
      <mesh position={[0, 0.31, 0]}>
        <boxGeometry args={[0.6, 0.03, 2.6]} />
        <meshStandardMaterial color="#4a4f57" />
      </mesh>
      <group position={[0, 0.1, 0]}>
        <Rocket />
      </group>
      <LaunchSmoke />
      {/* NASA Mobile Launcher, Launch Gantry, and Crawler-Transporter */}
      <SafeModel id="model.env-mobile-launcher" position={[0, 0.1, -0.25]} scale={0.14} fallback={<ServiceTowerFallback />} />
      <SafeModel id="model.env-launch-gantry" position={[-1.05, 0.1, -0.35]} rotation={[0, Math.PI * 0.25, 0]} scale={0.13} />
      <SafeModel id="model.env-crawler" position={[0.1, 0.1, 1.55]} rotation={[0, Math.PI * 0.5, 0]} scale={0.14} />
      {/* Propellant tanks */}
      {[
        [1.6, 1.4],
        [1.6, 0.8],
      ].map(([x, z]) => (
        <mesh key={z} position={[x, 0.45, z]} castShadow>
          <sphereGeometry args={[0.3, 16, 12]} />
          <meshStandardMaterial color="#f2f3f5" />
        </mesh>
      ))}
      {/* Light poles */}
      {[
        [-1.9, -1.9],
        [1.9, -1.9],
        [-1.9, 1.9],
      ].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 1.6, 6]} />
            <meshStandardMaterial color="#6b717a" />
          </mesh>
          <mesh position={[0, 1.72, 0]}>
            <boxGeometry args={[0.2, 0.08, 0.12]} />
            <meshStandardMaterial color="#fff6c8" emissive="#fff6c8" emissiveIntensity={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Dish({ position, phase }: { position: [number, number, number]; phase: number }) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = phase + Math.sin(clock.elapsedTime * 0.15 + phase) * 0.6
  })
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.18, 0.7, 10]} />
        <meshStandardMaterial color="#9aa1ab" />
      </mesh>
      <group ref={ref} position={[0, 0.8, 0]}>
        <group rotation={[-0.75, 0, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.75, 24, 8, 0, Math.PI * 2, 0, 0.75]} />
            <meshStandardMaterial color="#f4f5f7" side={DoubleSide} />
          </mesh>
          <mesh position={[0, -0.35, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.75, 6]} />
            <meshStandardMaterial color="#6b717a" />
          </mesh>
        </group>
      </group>
    </group>
  )
}

function CommsCenter() {
  return (
    <group>
      <Pad w={4} d={4} />
      <mesh position={[-0.6, 0.6, 0.6]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.9, 1.8]} />
        <meshStandardMaterial color={WALL} />
      </mesh>
      <mesh position={[-0.6, 1.1, 0.6]} castShadow>
        <boxGeometry args={[2.35, 0.1, 1.95]} />
        <meshStandardMaterial color={ROOF} />
      </mesh>
      <mesh position={[-0.6, 0.65, 1.51]}>
        <boxGeometry args={[1.8, 0.3, 0.02]} />
        <meshStandardMaterial color={GLASS} />
      </mesh>
      <mesh position={[0.51, 0.65, 0.6]}>
        <boxGeometry args={[0.02, 0.3, 1.4]} />
        <meshStandardMaterial color={GLASS} />
      </mesh>
      {/* Mast on the roof */}
      <mesh position={[-1.3, 1.6, 0.2]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 1, 6]} />
        <meshStandardMaterial color="#6b717a" />
      </mesh>
      <Blinker position={[-1.3, 2.13, 0.2]} period={2} phase={0.9} />
      {/* NASA DSN 34-meter deep-space dish and Radome telemetry dome */}
      <SafeModel
        id="model.env-dsn-34m"
        position={[0.95, 0.1, -0.85]}
        rotation={[0, -Math.PI * 0.2, 0]}
        scale={0.055}
        fallback={<Dish position={[0.9, 0.1, -0.9]} phase={0.6} />}
      />
      <SafeModel
        id="model.env-radome"
        position={[-0.95, 0.1, -0.95]}
        scale={0.55}
        fallback={<Dish position={[-0.9, 0.1, -1.1]} phase={2.2} />}
      />
    </group>
  )
}

const models: Record<BuildingId, () => React.ReactElement> = {
  'research-lab': ResearchLab,
  factory: Factory,
  'launch-site': LaunchSite,
  'comms-center': CommsCenter,
}

/** How tall each model is, so its label floats just above it */
const labelHeight: Record<BuildingId, number> = {
  'research-lab': 3.0,
  factory: 2.8,
  'launch-site': 3.8,
  'comms-center': 2.4,
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export interface BuildingLabel {
  status: string
  /** 0-1 progress bar under the status */
  progress?: number
  highlight?: boolean
  /** A gentle glow that points a new player here (the Research Lab's first lesson) */
  pulse?: boolean
  /** A red Go / No-Go bar is fixed in this building */
  alert?: boolean
}

/**
 * A small sign above a building: just its name on a post. Clickable when the building can be
 * entered. The details (the label's status) are in its tooltip and in the mission panel.
 * Orange: the next building to visit. Green glow: a first lesson here. Red dot: a problem here.
 */
function Sign({
  name,
  label,
  onClick,
  title,
}: {
  name: string
  label?: BuildingLabel
  onClick?: () => void
  title?: string
}) {
  // A real button when it walks in, so it can be reached and pressed by keyboard
  const Tag = onClick ? 'button' : 'div'
  const tip = [title ?? (onClick ? `Enter the ${name}` : name), label?.status].filter(Boolean).join(': ')
  const next = !!label?.highlight && !label.alert
  // An inventory tag: ink card, paper text, clipped corner. Kapton when it is the next stop.
  const board = next ? 'bg-kapton text-kapton-ink border-kapton' : 'bg-ink-1/95 text-paper border-rule-strong'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={tip}
      aria-label={tip}
      className={`group relative flex select-none flex-col items-center ${
        onClick ? 'pointer-events-auto cursor-pointer focus-visible:outline-none' : ''
      }`}
    >
      {label?.pulse && !label.alert && (
        <span
          data-testid="label-pulse"
          className="pointer-events-none absolute -inset-x-1.5 -top-1.5 bottom-1.5 ring-2 ring-go/80 motion-safe:animate-pulse"
        />
      )}
      <span
        className={`relative flex items-center gap-1.5 whitespace-nowrap border py-[3px] pl-3 pr-2.5 font-sans text-[11px] font-bold uppercase leading-tight tracking-[0.1em] [font-stretch:75%] [clip-path:polygon(6px_0,100%_0,100%_100%,6px_100%,0_calc(100%-6px),0_6px)] transition ${board} ${
          onClick ? 'group-hover:-translate-y-0.5 group-hover:border-kapton group-hover:bg-kapton group-hover:text-kapton-ink group-focus-visible:outline-2 group-focus-visible:outline-kapton' : ''
        } ${next ? 'motion-safe:animate-pulse' : ''}`}
      >
        <span className={`absolute left-[5px] top-1/2 -mt-[2px] h-1 w-1 rounded-full ${next ? 'bg-kapton-ink/70' : 'bg-paper-faint'}`} aria-hidden="true" />
        {label?.alert && <span className="h-2 w-2 bg-nogo" />}
        {name}
      </span>
      <span className={`h-2.5 w-px ${next ? 'bg-kapton' : 'bg-ink-1/90'}`} />
    </Tag>
  )
}

/** Headquarters on the map: the agency's campaign, 0-1 per phase (shown when it is opened) */
export interface HqView {
  satellites: number
  moon: number
  mars: number
  onClick?: () => void
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

/** Zoom so the whole island fits the canvas whenever its size changes */
function FitCamera() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useEffect(() => {
    // The whole island and the labels above the back buildings fit, also on a wide map
    const zoom = Math.min(size.width / 22, size.height / 20)
    camera.zoom = Math.max(14, zoom)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])
  return null
}

/**
 * Keeps the view inside the forest: never zoomed out or panned so far that the empty land
 * beyond the trees shows. The camera looks down from (1, 1, 1), so on the ground the screen's
 * horizontal axis is u = (x - z)/√2 and its vertical axis v = (x + z)/√2, stretched by
 * 1/sin(elevation). The square forest is the diamond |u| + |v| <= edge·√2 in those axes;
 * the visible rectangle must fit inside it.
 */
const FOREST_EDGE = HALF + FOREST_REACH - 2.5
const GROUND_STRETCH = 1 / Math.sin(Math.atan(1 / Math.SQRT2)) // 1/sin(35.26°) ≈ 1.73

function KeepInForest() {
  const controls = useThree((s) => s.controls) as unknown as {
    target: Vector3
    minZoom: number
    update: () => void
  } | null
  const offset = useMemo(() => new Vector3(), [])
  useFrame(({ camera, size }) => {
    if (!controls) return
    const cam = camera as OrthographicCamera
    const reach = FOREST_EDGE * Math.SQRT2
    const minZoom = Math.max(14, (size.width / 2 + (size.height / 2) * GROUND_STRETCH) / reach)
    controls.minZoom = minZoom
    if (cam.zoom < minZoom) {
      cam.zoom = minZoom
      cam.updateProjectionMatrix()
    }
    const slack = Math.max(0, reach - size.width / 2 / cam.zoom - (size.height / 2 / cam.zoom) * GROUND_STRETCH)
    const t = controls.target
    const u = (t.x - t.z) / Math.SQRT2
    const v = (t.x + t.z) / Math.SQRT2
    const m = Math.abs(u) + Math.abs(v)
    if (m <= slack) return
    const k = slack / m
    offset.copy(cam.position).sub(t)
    t.set(((u + v) * k) / Math.SQRT2, t.y, ((v - u) * k) / Math.SQRT2)
    cam.position.copy(t).add(offset)
  })
  return null
}

/* ------------------------------------------------------------------ */
/* Label overlay                                                       */
/* ------------------------------------------------------------------ */

/**
 * Labels are plain DOM elements laid over the canvas. Each frame this projects
 * their 3D anchor points to screen pixels and moves the elements there.
 * (One overlay instead of drei's Html, which creates a React root per label.)
 */
function LabelProjector({
  anchors,
  elements,
}: {
  anchors: Vector3[]
  elements: React.RefObject<(HTMLDivElement | null)[]>
}) {
  const v = useMemo(() => new Vector3(), [])
  useFrame(({ camera, size }) => {
    const els = elements.current
    if (!els) return
    anchors.forEach((anchor, i) => {
      const el = els[i]
      if (!el) return
      v.copy(anchor).project(camera)
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
      el.style.visibility = 'visible'
    })
  })
  return null
}

/* ------------------------------------------------------------------ */
/* Map                                                                 */
/* ------------------------------------------------------------------ */

export interface BaseMapProps {
  labels: Record<BuildingId, BuildingLabel>
  /** Walking into a building: clicking its model or its label */
  onBuildingClick?: (id: BuildingId) => void
  /** The launch on the pad: performance.now() when the countdown started */
  launchAt?: number | null
  /** The rocket has left (the craft is flying) */
  rocketGone?: boolean
  /** Headquarters and its campaign progress; no HQ on the map without it */
  hq?: HqView
}

function BuildingStatusIndicator({ size, label }: { size: [number, number]; label?: BuildingLabel }) {
  const ringRef = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (!ringRef.current) return
    const s = 1 + Math.sin(clock.elapsedTime * 3.2) * 0.04
    ringRef.current.scale.set(s, s, 1)
  })
  if (!label) return null
  const [w, d] = size
  const beaconColor = label.alert ? '#d0533f' : label.pulse ? '#6faf7a' : '#e8a33d'
  const showBeacon = !!(label.highlight || label.pulse || label.alert)
  const radius = Math.hypot(w, d) * 0.52

  return (
    <group position={[0, 0.12, 0]}>
      {showBeacon && (
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius - 0.14, radius, 48]} />
          <meshBasicMaterial color={beaconColor} transparent opacity={0.75} side={DoubleSide} />
        </mesh>
      )}
      {label.progress !== undefined && label.progress > 0 && (
        <group position={[0, 0.02, d / 2 + 0.18]}>
          <mesh>
            <boxGeometry args={[w * 0.72, 0.04, 0.14]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          <mesh position={[-(w * 0.72 * (1 - Math.min(1, label.progress))) / 2, 0.015, 0]}>
            <boxGeometry args={[Math.max(0.06, w * 0.72 * Math.min(1, label.progress)), 0.05, 0.16]} />
            <meshStandardMaterial color="#e8a33d" emissive="#c98a2c" emissiveIntensity={0.35} />
          </mesh>
        </group>
      )}
    </group>
  )
}

function IslandMap({ labels, onBuildingClick, launchAt = null, rocketGone = false, hq }: BaseMapProps) {
  const launch = useMemo(() => ({ launchAt, gone: rocketGone }), [launchAt, rocketGone])
  const labelEls = useRef<(HTMLDivElement | null)[]>([])
  // Until the canvas has drawn, show a placeholder instead of a blank green field
  const [ready, setReady] = useState(false)

  // One anchor per building, above its roof; Headquarters last
  const hqCenter = HQ_CENTER
  const anchors = useMemo(
    () => [
      ...buildings.map((b) => {
        const [x, , z] = footprintCenter(b.tile, b.size)
        return new Vector3(x, labelHeight[b.id], z)
      }),
      new Vector3(HQ_CENTER[0], HQ_LABEL_HEIGHT, HQ_CENTER[2]),
    ],
    []
  )

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Canvas
        orthographic
        shadows
        camera={{ position: [20, 20, 20], zoom: 30, near: -100, far: 200 }}
        role="img"
        aria-label="Map of the agency base. Each building's label is a button."
        onCreated={() => setReady(true)}
      >
        <color attach="background" args={['#7a8a50']} />
        <FitCamera />
        {/* Golden hour: a warm, low sun (long shadows) and a cool sky fill from the other side */}
        <hemisphereLight args={['#ffe6c4', '#5c6640', 0.75]} />
        <directionalLight position={[-14, 10, -10]} intensity={0.28} color="#9fb2d0" />
        <directionalLight
          position={[18, 11, 4]}
          intensity={2}
          color="#ffd29a"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
          shadow-bias={-0.0005}
        />

        <LaunchContext.Provider value={launch}>
        <Ground />
        <Forest half={HALF} ground={-0.86} />
        <Scenery />
        {hq && (
          <group
            position={[hqCenter[0], 0.05, hqCenter[2]]}
            onClick={
              hq.onClick
                ? (e) => {
                    e.stopPropagation()
                    hq.onClick?.()
                  }
                : undefined
            }
            onPointerOver={hq.onClick ? () => (document.body.style.cursor = 'pointer') : undefined}
            onPointerOut={hq.onClick ? () => (document.body.style.cursor = '') : undefined}
          >
            <Headquarters />
          </group>
        )}
        <Clouds />
        <Truck z={7.5 - HALF} from={-7} to={6} />

        {buildings.map((b) => {
          const Model = models[b.id]
          const [x, , z] = footprintCenter(b.tile, b.size)
          return (
            <group
              key={b.id}
              position={[x, 0.05, z]}
              onClick={
                onBuildingClick
                  ? (e) => {
                      e.stopPropagation()
                      onBuildingClick(b.id)
                    }
                  : undefined
              }
              onPointerOver={onBuildingClick ? () => (document.body.style.cursor = 'pointer') : undefined}
              onPointerOut={onBuildingClick ? () => (document.body.style.cursor = '') : undefined}
            >
              {onBuildingClick && (
                <mesh position={[0, 1.1, 0]}>
                  <boxGeometry args={[b.size[0] - 0.2, 2.2, b.size[1] - 0.2]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
              )}
              <Model />
              <BuildingStatusIndicator size={b.size} label={labels[b.id]} />
            </group>
          )
        })}

        </LaunchContext.Provider>
        <BaseEffects />
        <LabelProjector anchors={anchors} elements={labelEls} />

        <KeepInForest />
        <OrbitControls
          makeDefault
          enableRotate={false}
          enableDamping
          mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
          touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
          minZoom={14}
          maxZoom={90}
        />
      </Canvas>

      {/* Label overlay, positioned by LabelProjector */}
      <div className="pointer-events-none absolute inset-0">
        {buildings.map((b, i) => (
          <div
            key={b.id}
            ref={(el) => {
              labelEls.current[i] = el
            }}
            className="invisible absolute left-0 top-0"
          >
            <Sign name={b.name} label={labels[b.id]} onClick={onBuildingClick ? () => onBuildingClick(b.id) : undefined} />
          </div>
        ))}
        {hq && (
          <div
            ref={(el) => {
              labelEls.current[buildings.length] = el
            }}
            className="invisible absolute left-0 top-0"
          >
            <Sign name="Headquarters" onClick={hq.onClick} title="Open the campaign" />
          </div>
        )}
      </div>

      {!ready && (
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center bg-ink-1 font-display text-sm font-bold uppercase tracking-[0.1em] text-paper-dim"
        >
          Loading map…
        </div>
      )}
    </div>
  )
}

/**
 * The base map: the 3D island, or a plain list of the buildings when this browser has no
 * WebGL or the island fails to draw, so the base never turns into a white page (QC #32).
 */
export function BaseMap(props: BaseMapProps) {
  const list = <BuildingList {...props} />
  if (!canUseWebGL()) return list
  return (
    <MapBoundary fallback={list}>
      <IslandMap {...props} />
    </MapBoundary>
  )
}
