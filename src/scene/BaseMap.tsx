import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Color, DoubleSide, MOUSE, TOUCH, Vector3, type Group, type InstancedMesh, Object3D } from 'three'
import { MAP_SIZE, buildPlot, buildings, type BuildingId } from '../data/agency'
import { buildingIcons } from './buildingIcons'
import { BuildingList, MapBoundary } from './BuildingList'
import { canUseWebGL } from './webgl'

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
    [17, 8], [17, 9], // build plot
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
  add(buildPlot.tile, buildPlot.size, 1)
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

const GRASS_A = new Color('#8cc152')
const GRASS_B = new Color('#80b84a')
const ROAD = new Color('#e3c99a')

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
        <meshStandardMaterial color="#9b6b43" />
      </mesh>
      {/* Grass beyond the island */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.86, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#6fa83f" />
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
        <meshStandardMaterial color="#7a4e2d" />
      </mesh>
      <mesh position={[0, 0.75, 0]} castShadow>
        <icosahedronGeometry args={[0.38, 0]} />
        <meshStandardMaterial color="#3f8f3a" flatShading />
      </mesh>
      <mesh position={[0.05, 1.05, 0.02]} castShadow>
        <icosahedronGeometry args={[0.26, 0]} />
        <meshStandardMaterial color="#4ea644" flatShading />
      </mesh>
    </group>
  )
}

function Rock({ position, scale }: { position: [number, number, number]; scale: number }) {
  return (
    <mesh position={position} scale={scale} castShadow>
      <dodecahedronGeometry args={[0.22, 0]} />
      <meshStandardMaterial color="#a3a8ad" flatShading />
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

const WALL = '#eef1f6'
const ROOF = '#2c3e6b'
const GLASS = '#5aa9e6'
const ACCENT = '#f28c28'
const CONCRETE = '#c9ccd1'

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
        <mesh position={[0.35, 0.65, 0.35]} rotation={[-0.6, Math.PI / 4, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.13, 0.9, 12]} />
          <meshStandardMaterial color="#59616e" />
        </mesh>
      </group>
      {/* Side annex */}
      <mesh position={[1.2, 0.45, 1.2]} castShadow>
        <boxGeometry args={[1, 0.6, 0.9]} />
        <meshStandardMaterial color="#dfe4ec" />
      </mesh>
    </group>
  )
}

function Factory() {
  return (
    <group>
      <Pad w={5} d={4} />
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
      {/* Chimney */}
      <mesh position={[1.3, 2.0, -1.2]} castShadow>
        <cylinderGeometry args={[0.15, 0.18, 1.2, 10]} />
        <meshStandardMaterial color="#8d939c" />
      </mesh>
      {/* Crates waiting outside */}
      {[
        [2.1, 0.35, 1.3],
        [2.1, 0.35, 0.8],
        [2.1, 0.75, 1.05],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color={i === 2 ? '#c98a3d' : '#e0a24f'} />
        </mesh>
      ))}
    </group>
  )
}

function Rocket() {
  return (
    <group>
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
      {/* Service tower */}
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
      <Dish position={[0.9, 0.1, -0.9]} phase={0.6} />
      <Dish position={[-0.9, 0.1, -1.1]} phase={2.2} />
    </group>
  )
}

function BuildPlotOutline() {
  const [w, d] = buildPlot.size
  const dashes = useMemo(() => {
    const out: { position: [number, number, number]; size: [number, number, number] }[] = []
    const step = 0.5
    for (let t = -w / 2 + 0.15; t < w / 2 - 0.1; t += step) {
      out.push({ position: [t + 0.12, 0.08, -d / 2 + 0.15], size: [0.25, 0.03, 0.06] })
      out.push({ position: [t + 0.12, 0.08, d / 2 - 0.15], size: [0.25, 0.03, 0.06] })
    }
    for (let t = -d / 2 + 0.15; t < d / 2 - 0.1; t += step) {
      out.push({ position: [-w / 2 + 0.15, 0.08, t + 0.12], size: [0.06, 0.03, 0.25] })
      out.push({ position: [w / 2 - 0.15, 0.08, t + 0.12], size: [0.06, 0.03, 0.25] })
    }
    return out
  }, [w, d])
  return (
    <group>
      {dashes.map((dash, i) => (
        <mesh key={i} position={dash.position}>
          <boxGeometry args={dash.size} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.4} />
        </mesh>
      ))}
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
  factory: 2.6,
  'launch-site': 3.4,
  'comms-center': 2.2,
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export interface BuildingLabel {
  status: string
  /** 0-1 progress bar under the status, e.g. an upgrade */
  progress?: number
  /** Level shown in the badge, may differ from the base data during an upgrade */
  level: number
  highlight?: boolean
  /** A red Go / No-Go bar is fixed in this building */
  alert?: boolean
}

function Label({
  id,
  name,
  label,
  onClick,
}: {
  id: BuildingId
  name: string
  label: BuildingLabel
  onClick?: () => void
}) {
  const border = label.alert ? 'border-red-500' : label.highlight ? 'border-orange-400' : 'border-slate-700/80'
  // A real button when it walks in, so it can be reached and pressed by keyboard
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={onClick ? `Enter the ${name}` : undefined}
      className={`relative block w-max max-w-[280px] select-none rounded-xl border-2 bg-white/95 px-3 py-1.5 text-left shadow-lg ${border} ${
        onClick
          ? 'pointer-events-auto cursor-pointer transition hover:scale-105 focus-visible:outline focus-visible:outline-4 focus-visible:outline-orange-400'
          : ''
      }`}
    >
      {label.highlight && !label.alert && (
        <span className="pointer-events-none absolute -inset-1.5 animate-pulse rounded-2xl ring-4 ring-orange-400/60" />
      )}
      <span className="flex items-center gap-2">
        <span className="text-base leading-none">{buildingIcons[id]}</span>
        <span className="whitespace-nowrap font-display text-sm font-bold uppercase tracking-wide text-slate-800">
          {name}
        </span>
        <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
          LV {label.level}
        </span>
      </span>
      <span className="mt-0.5 block text-[11px] leading-tight text-slate-600">{label.status}</span>
      {label.progress !== undefined && (
        <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <span
            className="block h-full rounded-full bg-orange-500"
            style={{ width: `${Math.round(label.progress * 100)}%` }}
          />
        </span>
      )}
    </Tag>
  )
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

/** Zoom so the whole island fits the canvas whenever its size changes */
function FitCamera() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useEffect(() => {
    const zoom = Math.min(size.width / 22, size.height / 15)
    camera.zoom = Math.max(14, zoom)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])
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
}

function IslandMap({ labels, onBuildingClick }: BaseMapProps) {
  const plotCenter = footprintCenter(buildPlot.tile, buildPlot.size)
  const labelEls = useRef<(HTMLDivElement | null)[]>([])
  // Until the canvas has drawn, show a placeholder instead of a blank green field
  const [ready, setReady] = useState(false)

  // One anchor per building (above its roof), then one for the build plot
  const anchors = useMemo(() => {
    const list = buildings.map((b) => {
      const [x, , z] = footprintCenter(b.tile, b.size)
      return new Vector3(x, labelHeight[b.id], z)
    })
    const [px, , pz] = footprintCenter(buildPlot.tile, buildPlot.size)
    list.push(new Vector3(px, 0.9, pz))
    return list
  }, [])

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
        <color attach="background" args={['#6fa83f']} />
        <FitCamera />
        <hemisphereLight args={['#ffffff', '#5b7f3a', 0.9]} />
        <directionalLight
          position={[12, 20, 6]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-16}
          shadow-camera-right={16}
          shadow-camera-top={16}
          shadow-camera-bottom={-16}
          shadow-bias={-0.0005}
        />

        <Ground />
        <Scenery />

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
              <Model />
            </group>
          )
        })}

        <group position={[plotCenter[0], 0.05, plotCenter[2]]}>
          <BuildPlotOutline />
        </group>

        <LabelProjector anchors={anchors} elements={labelEls} />

        <OrbitControls
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
            <Label
              id={b.id}
              name={b.name}
              label={labels[b.id]}
              onClick={onBuildingClick ? () => onBuildingClick(b.id) : undefined}
            />
          </div>
        ))}
        <div
          ref={(el) => {
            labelEls.current[buildings.length] = el
          }}
          className="invisible absolute left-0 top-0"
        >
          <div
            title="Building new facilities is coming after the MVP"
            className="pointer-events-auto w-max cursor-not-allowed select-none rounded-lg bg-orange-500/90 px-3 py-1 text-center font-display text-sm font-bold text-white shadow-md"
          >
            + BUILD
            <div className="text-[10px] font-normal opacity-90">coming soon</div>
          </div>
        </div>
      </div>

      {!ready && (
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center bg-[#6fa83f] font-display text-lg font-bold text-white"
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
