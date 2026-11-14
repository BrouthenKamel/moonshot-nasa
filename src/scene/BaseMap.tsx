import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Color, MOUSE, TOUCH, Vector3, type Group, type InstancedMesh, type Mesh, Object3D } from 'three'
import { MAP_SIZE, buildings, lockedPlot, type BuildingId } from '../data/agency'
import {
  CommsCenter,
  Factory,
  Headquarters,
  LaunchSite,
  ResearchLab,
  TestFacility,
  Traffic,
  type ModelProps,
} from './buildings'

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
  for (let z = 1; z <= 18; z++) roads.add(key(7, z))
  ;[
    [3, 6], [4, 6], // headquarters
    [10, 6], [11, 6], // factory
    [15, 6], [16, 6], // test facility
    [6, 10], [6, 11], // research lab
    [6, 15], [6, 16], // communications center
    [8, 11], // launch site
    [16, 8], // locked plot
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
  add(lockedPlot.tile, lockedPlot.size, 1)
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

const GRASS = new Color('#7cc04f')
const ROAD = new Color('#ecd9b0')

function Ground() {
  const ref = useRef<InstancedMesh>(null)
  const roads = useMemo(roadTiles, [])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    const rand = mulberry32(3)
    const c = new Color()
    let i = 0
    for (let x = 0; x < MAP_SIZE; x++) {
      for (let z = 0; z < MAP_SIZE; z++) {
        const [wx, wz] = tileToWorld(x + 0.5, z + 0.5)
        const isRoad = roads.has(key(x, z))
        dummy.position.set(wx, isRoad ? 0.01 : 0, wz)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        // Subtle per-tile variation instead of a checkerboard
        c.copy(isRoad ? ROAD : GRASS).offsetHSL(0, 0, (rand() - 0.5) * (isRoad ? 0.03 : 0.05))
        mesh.setColorAt(i, c)
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
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      {/* Grass lip and earth layers under the island */}
      <mesh position={[0, -0.12, 0]}>
        <boxGeometry args={[MAP_SIZE + 0.02, 0.18, MAP_SIZE + 0.02]} />
        <meshStandardMaterial color="#5f9d3a" />
      </mesh>
      <mesh position={[0, -0.75, 0]}>
        <boxGeometry args={[MAP_SIZE - 0.2, 1.1, MAP_SIZE - 0.2]} />
        <meshStandardMaterial color="#a8774b" />
      </mesh>
      <mesh position={[0, -1.6, 0]}>
        <boxGeometry args={[MAP_SIZE - 1.2, 0.6, MAP_SIZE - 1.2]} />
        <meshStandardMaterial color="#86603e" />
      </mesh>
      <mesh position={[0, -2.1, 0]}>
        <boxGeometry args={[MAP_SIZE - 3, 0.4, MAP_SIZE - 3]} />
        <meshStandardMaterial color="#6b4c33" />
      </mesh>
    </group>
  )
}

/** Soft low-poly clouds drifting around the island */
function Clouds() {
  const ref = useRef<Group>(null)
  const clouds = useMemo(() => {
    const rand = mulberry32(11)
    return Array.from({ length: 7 }, (_, i) => {
      const angle = (i / 7) * Math.PI * 2 + rand() * 0.5
      const r = MAP_SIZE * 0.72 + rand() * 4
      return {
        pos: [Math.cos(angle) * r, -1.5 + rand() * 4, Math.sin(angle) * r] as [number, number, number],
        scale: 0.8 + rand() * 0.8,
      }
    })
  }, [])
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 0.01
  })
  return (
    <group ref={ref}>
      {clouds.map((c, i) => (
        <group key={i} position={c.pos} scale={c.scale}>
          {[
            [0, 0, 0, 1],
            [0.9, -0.15, 0.2, 0.75],
            [-0.85, -0.2, -0.1, 0.7],
            [0.2, 0.35, -0.3, 0.65],
          ].map(([x, y, z, s], j) => (
            <mesh key={j} position={[x, y, z]} scale={s}>
              <icosahedronGeometry args={[0.9, 1]} />
              <meshStandardMaterial color="#ffffff" flatShading roughness={1} transparent opacity={0.92} />
            </mesh>
          ))}
        </group>
      ))}
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

function LockedPlot() {
  const [w, d] = lockedPlot.size
  const posts = useMemo(() => {
    const out: [number, number][] = []
    for (let t = -w / 2 + 0.2; t <= w / 2 - 0.2 + 1e-6; t += 0.4) {
      out.push([t, -d / 2 + 0.2], [t, d / 2 - 0.2])
    }
    for (let t = -d / 2 + 0.6; t <= d / 2 - 0.6 + 1e-6; t += 0.4) {
      out.push([-w / 2 + 0.2, t], [w / 2 - 0.2, t])
    }
    return out
  }, [w, d])
  return (
    <group>
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[w - 0.3, 0.06, d - 0.3]} />
        <meshStandardMaterial color="#b9a88a" />
      </mesh>
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.25, z]}>
          <boxGeometry args={[0.05, 0.35, 0.05]} />
          <meshStandardMaterial color="#f2f3f5" />
        </mesh>
      ))}
    </group>
  )
}

const models: Record<BuildingId, (p: ModelProps) => React.ReactElement> = {
  hq: Headquarters,
  factory: Factory,
  'test-facility': TestFacility,
  'launch-site': LaunchSite,
  'comms-center': CommsCenter,
  'research-lab': ResearchLab,
}

/** How tall each model is, so its label floats just above it */
const labelHeight: Record<BuildingId, number> = {
  hq: 4.5,
  factory: 3.0,
  'test-facility': 1.9,
  'launch-site': 3.6,
  'comms-center': 2.4,
  'research-lab': 2.9,
}

/** A building on the map: lifts a little under the mouse */
function Placed({
  position,
  onClick,
  children,
}: {
  position: [number, number, number]
  onClick: (e: ThreeEvent<MouseEvent>) => void
  children: React.ReactNode
}) {
  const ref = useRef<Group>(null)
  const hovered = useRef(false)
  useFrame((_, dt) => {
    if (!ref.current) return
    const target = hovered.current ? 0.12 : 0
    ref.current.position.y += (position[1] + target - ref.current.position.y) * Math.min(1, dt * 10)
  })
  return (
    <group
      ref={ref}
      position={position}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        hovered.current = true
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        hovered.current = false
        document.body.style.cursor = ''
      }}
    >
      {children}
    </group>
  )
}

/** Pulsing ring around the building where the mission is right now */
function ActiveRing({ size }: { size: [number, number] }) {
  const ref = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = (Math.sin(clock.elapsedTime * 3) + 1) / 2
    ref.current.scale.setScalar(1 + t * 0.04)
    ;(ref.current.material as unknown as { opacity: number }).opacity = 0.45 + t * 0.4
  })
  const r = Math.max(size[0], size[1]) * 0.62
  return (
    <mesh ref={ref} position={[0, 0.17, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[r - 0.12, r, 48]} />
      <meshBasicMaterial color="#ff8a1f" transparent opacity={0.7} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export interface BuildingLabel {
  status: string
  /** 0-1 progress bar under the status */
  progress?: number
  /** The mission is here right now */
  active?: boolean
  /** Something waits for the player here */
  attention?: boolean
}

function Label({
  name,
  label,
  selected,
  onClick,
}: {
  name: string
  label: BuildingLabel
  selected: boolean
  onClick: () => void
}) {
  // Quiet buildings show just their name; where something happens, the label opens up
  const expanded = label.active || label.attention || selected
  return (
    <button
      onClick={onClick}
      className={`pointer-events-auto flex w-max max-w-[240px] select-none flex-col items-center text-center transition hover:-translate-y-0.5 ${
        expanded ? 'z-10' : ''
      }`}
    >
      <div
        className={`rounded-xl px-2.5 py-1 shadow-[0_3px_0_rgba(0,0,0,0.25)] ${
          label.attention
            ? 'animate-pulse bg-red-500 text-white'
            : expanded
              ? 'bg-orange-500 text-white'
              : 'bg-[#14213d]/85 text-white'
        }`}
      >
        <div className="flex items-center gap-1.5">

          <span className="whitespace-nowrap font-display text-[13px] font-semibold tracking-wide">{name}</span>
          {label.attention && <span className="rounded bg-white px-1 text-[10px] font-bold text-red-600">!</span>}
        </div>
        {expanded && (
          <>
            <div className="mt-0.5 text-[11px] leading-tight text-white/90">{label.status}</div>
            {label.progress !== undefined && (
              <div className="mx-auto mt-1 h-1.5 w-full min-w-24 overflow-hidden rounded-full bg-white/30">
                <div className="h-full rounded-full bg-white" style={{ width: `${Math.round(label.progress * 100)}%` }} />
              </div>
            )}
          </>
        )}
      </div>
      {/* Little pointer down to the building */}
      <div
        className={`h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent ${
          label.attention ? 'border-t-red-500' : expanded ? 'border-t-orange-500' : 'border-t-[#14213d]/85'
        }`}
      />
    </button>
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
    const zoom = Math.min(size.width / 30, size.height / 23)
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

export type MapTarget = BuildingId | 'locked'

export interface BaseMapProps {
  labels: Record<BuildingId, BuildingLabel>
  selected: MapTarget | null
  onSelect: (target: MapTarget) => void
  /** The current mission's rocket has left the pad */
  launched: boolean
}

export function BaseMap({ labels, selected, onSelect, launched }: BaseMapProps) {
  const labelEls = useRef<(HTMLDivElement | null)[]>([])

  // One anchor per building (above its roof), then one for the locked plot
  const anchors = useMemo(() => {
    const list = buildings.map((b) => {
      const [x, , z] = footprintCenter(b.tile, b.size)
      return new Vector3(x, labelHeight[b.id], z)
    })
    const [px, , pz] = footprintCenter(lockedPlot.tile, lockedPlot.size)
    list.push(new Vector3(px, 0.9, pz))
    return list
  }, [])

  /** A click, not the end of a drag */
  const clickOn = (target: MapTarget) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > 6) return
    onSelect(target)
  }
  const [lx, , lz] = footprintCenter(lockedPlot.tile, lockedPlot.size)

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 35%, #cfeaff 0%, #8ec5f2 45%, #4f86c6 100%)' }}
    >
      <Canvas
        orthographic
        shadows="soft"
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [20, 20, 20], zoom: 30, near: -100, far: 200 }}
      >
        <FitCamera />
        <hemisphereLight args={['#e8f4ff', '#6d8f4e', 1.0]} />
        <ambientLight intensity={0.15} />
        <directionalLight
          position={[14, 22, 4]}
          intensity={1.9}
          color="#fff3dc"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-16}
          shadow-camera-right={16}
          shadow-camera-top={16}
          shadow-camera-bottom={-16}
          shadow-bias={-0.0005}
          shadow-radius={4}
        />
        <directionalLight position={[-10, 8, 12]} intensity={0.35} color="#bcd8ff" />

        <Ground />
        <Scenery />
        <Clouds />

        {buildings.map((b) => {
          const Model = models[b.id]
          const [x, , z] = footprintCenter(b.tile, b.size)
          return (
            <Placed key={b.id} position={[x, 0.05, z]} onClick={clickOn(b.id)}>
              <Model active={!!labels[b.id].active} launched={launched} />
              {(labels[b.id].active || selected === b.id) && <ActiveRing size={b.size} />}
            </Placed>
          )
        })}

        <Placed position={[lx, 0.05, lz]} onClick={clickOn('locked')}>
          <LockedPlot />
        </Placed>

        {/* Main streets: row z = 7 and column x = 7 (tile centres) */}
        <Traffic streetA={7.5 - HALF} streetB={7.5 - HALF} from={1.5 - HALF} to={18.5 - HALF} />

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

              name={b.name}
              label={labels[b.id]}
              selected={selected === b.id}
              onClick={() => onSelect(b.id)}
            />
          </div>
        ))}
        <div
          ref={(el) => {
            labelEls.current[buildings.length] = el
          }}
          className="invisible absolute left-0 top-0"
        >
          <button
            onClick={() => onSelect('locked')}
            className="pointer-events-auto w-max select-none rounded-xl bg-white/70 px-2.5 py-1 font-display text-[12px] font-semibold text-slate-600 shadow-[0_3px_0_rgba(0,0,0,0.15)] backdrop-blur-sm"
          >
            {lockedPlot.name} · locked
          </button>
        </div>
      </div>
    </div>
  )
}
