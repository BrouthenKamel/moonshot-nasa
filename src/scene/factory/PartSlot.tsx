import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import * as THREE from 'three'
import { choiceArt } from '../../assets/catalogueArt'
import { useModel } from '../../assets/models'
import type { ModelId } from '../../assets/manifest'

/**
 * One part inside the open 6U box: the real catalogue model (choiceArt(partId).model),
 * scaled uniformly to fit its slot and centred in it. The slot itself (its size comes from
 * the part's volume in the BayView) is drawn as a thin tray and a faint outline, so the
 * picture still matches the volume check. A newly chosen part drops in and snaps home.
 */

const RED = new THREE.Color('#ef4444')
const BLACK = new THREE.Color('#000000')

/** Slot padding inside the box walls (scene units) */
const SLOT_PAD = { x: 0.08, y: 0.012, z: 0.08 }

/**
 * Studio reflections for the parts' own metal. The bay's scene environment is kept dim for the
 * room; inside the open box the parts would read nearly black without their own reflections.
 */
let studio: THREE.Texture | null = null
function studioFor(gl: THREE.WebGLRenderer): THREE.Texture {
  if (!studio) {
    const pmrem = new THREE.PMREMGenerator(gl)
    studio = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
  }
  return studio
}
function useStudio(): THREE.Texture {
  const gl = useThree((s) => s.gl)
  return useMemo(() => studioFor(gl), [gl])
}

/* ---------------- fitting ---------------- */

interface Orientation {
  rotation: THREE.Euler
  size: THREE.Vector3 // bounding box size after the rotation (model metres)
  centre: THREE.Vector3 // bounding box centre after the rotation
  bias: number // how much we prefer this pose (the model's own +Z face toward the player first)
}

const POSES: Array<[number, number, number, number]> = [
  [0, 0, 0, 1.3], // as modelled: +Y up, +Z (the face) toward the player
  [0, 0, Math.PI / 2, 1.12], // on its side, face still toward the player
  [-Math.PI / 2, 0, 0, 1], // face up
  [-Math.PI / 2, 0, Math.PI / 2, 1],
  [Math.PI / 2, 0, 0, 1], // face down: thrusters toward the engine end of the bay
  [0, Math.PI / 2, 0, 0.9], // face to the side
  [0, Math.PI / 2, Math.PI / 2, 0.9],
]

interface Prepared {
  poses: Orientation[]
  materials: THREE.MeshStandardMaterial[]
  base: Array<{ emissive: THREE.Color; intensity: number }>
}

/** Fold the deployables, give this copy its own materials, and measure it in each pose. */
function prepare(root: THREE.Object3D, env: THREE.Texture): Prepared {
  root.position.set(0, 0, 0)
  root.rotation.set(0, 0, 0)
  root.scale.set(1, 1, 1)
  // Inside the box everything is stowed: wings, whips and dishes folded
  root.traverse((o) => {
    const stowed = o.userData?.stowed as number[] | undefined
    if (o.name.startsWith('pivot_') && Array.isArray(stowed) && stowed.length === 3) o.rotation.set(stowed[0], stowed[1], stowed[2])
  })
  root.updateMatrixWorld(true)

  // Private materials: the red over-limit pulse and the snap flash must not touch other copies
  const own = new Map<THREE.Material, THREE.MeshStandardMaterial>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const swap = (m: THREE.Material): THREE.Material => {
      if (!(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return m
      if (!own.has(m)) {
        const c = (m as THREE.MeshStandardMaterial).clone()
        // The bay is a dim room: let the studio reflections carry the metal
        c.envMap = env
        c.envMapIntensity = 0.9
        own.set(m, c)
      }
      return own.get(m)!
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
  })
  const materials = [...own.values()]

  // Bounding box of the visible geometry, in the root's frame
  const corners: THREE.Vector3[] = []
  const local = new THREE.Box3()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    let visible = true
    for (let p: THREE.Object3D | null = mesh; p && p !== root; p = p.parent) if (!p.visible) visible = false
    if (!visible) return
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    local.copy(mesh.geometry.boundingBox!)
    for (let i = 0; i < 8; i++)
      corners.push(
        new THREE.Vector3(i & 1 ? local.max.x : local.min.x, i & 2 ? local.max.y : local.min.y, i & 4 ? local.max.z : local.min.z).applyMatrix4(
          mesh.matrixWorld
        )
      )
  })
  if (corners.length === 0) corners.push(new THREE.Vector3(-0.05, 0, -0.05), new THREE.Vector3(0.05, 0.1, 0.05))

  const poses = POSES.map(([x, y, z, bias]) => {
    const rotation = new THREE.Euler(x, y, z)
    const q = new THREE.Quaternion().setFromEuler(rotation)
    const box = new THREE.Box3()
    for (const c of corners) box.expandByPoint(c.clone().applyQuaternion(q))
    return { rotation, size: box.getSize(new THREE.Vector3()), centre: box.getCenter(new THREE.Vector3()), bias }
  })
  return {
    poses,
    materials,
    base: materials.map((m) => ({ emissive: m.emissive.clone(), intensity: m.emissiveIntensity })),
  }
}

/** The pose that shows the part biggest in a slot of this size (with a preference for its own face). */
function bestPose(poses: Orientation[], w: number, h: number, d: number, faceDown: boolean): Orientation {
  let best = poses[0]
  let score = -1
  for (const p of poses) {
    const down = p.rotation.x > 1 && p.rotation.y === 0 && p.rotation.z === 0
    const s = fitScale(p, w, h, d) * (faceDown && down ? 1.6 : p.bias)
    if (s > score) {
      score = s
      best = p
    }
  }
  return best
}

const fitScale = (p: Orientation, w: number, h: number, d: number) =>
  Math.min(w / Math.max(p.size.x, 1e-4), h / Math.max(p.size.y, 1e-4), d / Math.max(p.size.z, 1e-4))

/* ---------------- the part ---------------- */

/** Live slot state the parent Block animates, read every frame without re-rendering. */
export interface SlotLive {
  height: number // current (eased) slot height
  flash: number // 0..1, the snap flash after landing
  squash: number // landing squash, 0 at rest
}

interface FittedPartProps {
  modelId: ModelId
  width: number
  depth: number
  height: number // target slot height, picks the pose
  faceDown: boolean // chemical and cold-gas engines: nozzles toward the bay's engine end (ion grids face the player)
  live: React.RefObject<SlotLive>
  over: boolean
  accent: string
  reduced: boolean
}

function FittedPart({ modelId, width, depth, height, faceDown, live, over, accent, reduced }: FittedPartProps) {
  const root = useModel(modelId)
  const env = useStudio()
  const prepared = useMemo(() => prepare(root, env), [root, env])
  const holder = useRef<THREE.Group>(null)
  const accentColor = useMemo(() => new THREE.Color(accent), [accent])
  const iw = width - 2 * SLOT_PAD.x
  const id = depth - 2 * SLOT_PAD.z
  const pose = useMemo(() => bestPose(prepared.poses, iw, Math.max(0.02, height - 2 * SLOT_PAD.y), id, faceDown), [prepared, iw, id, height, faceDown])
  useEffect(() => () => prepared.materials.forEach((m) => m.dispose()), [prepared])

  useFrame((state) => {
    const l = live.current
    const g = holder.current
    if (!g || !l) return
    const ih = Math.max(0.02, l.height - 2 * SLOT_PAD.y)
    const s = fitScale(pose, iw, ih, id)
    const sq = l.squash
    g.scale.set(s * (1 + sq * 0.5), s * (1 - sq), s * (1 + sq * 0.5))
    // Squash about the part's bottom, so it lands on the tray
    g.position.set(-pose.centre.x * s, -pose.centre.y * s * (1 - sq) - (pose.size.y * s * sq) / 2, -pose.centre.z * s)

    // Red pulse when it sits above the 6U line; an accent flash when it snaps home
    const pulse = over ? (reduced ? 0.55 : 0.4 + 0.25 * Math.sin(state.clock.elapsedTime * 8)) : 0
    const flash = l.flash
    prepared.materials.forEach((m, i) => {
      const b = prepared.base[i]
      if (pulse > 0) {
        m.emissive.copy(b.emissive).lerp(RED, 0.85)
        m.emissiveIntensity = Math.max(b.intensity, pulse)
      } else if (flash > 0.001) {
        m.emissive.copy(b.emissive.equals(BLACK) ? accentColor : b.emissive).lerp(accentColor, flash)
        m.emissiveIntensity = b.intensity + flash * 0.9
      } else {
        m.emissive.copy(b.emissive)
        m.emissiveIntensity = b.intensity
      }
    })
  })

  return (
    <group ref={holder} rotation={pose.rotation}>
      <primitive object={root} />
    </group>
  )
}

/** A plain block in the slot: shown while the model loads, if it fails, or for a part without one. */
export function SlotBox({ width, depth, live, color, over, reduced }: { width: number; depth: number; live: React.RefObject<SlotLive>; color: string; over: boolean; reduced: boolean }) {
  const body = useRef<THREE.Mesh>(null)
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.3, emissive: color, emissiveIntensity: 0.12 }),
    [color]
  )
  useEffect(() => () => material.dispose(), [material])
  useFrame((frame) => {
    if (body.current && live.current) body.current.scale.y = Math.max(0.01, live.current.height - 0.02)
    material.emissive.set(over ? '#ef4444' : color)
    material.emissiveIntensity = over ? (reduced ? 0.8 : 0.65 + 0.3 * Math.sin(frame.clock.elapsedTime * 8)) : 0.12
  })
  return (
    <mesh ref={body} material={material}>
      <boxGeometry args={[width - 0.1, 1, depth - 0.1]} />
    </mesh>
  )
}

class SlotBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

interface PartSlotProps {
  partId: string
  width: number
  depth: number
  height: number
  live: React.RefObject<SlotLive>
  color: string // the slot's colour: category, or slate for parts chosen in another building
  accent: string // the part's own accent (snap flash)
  over: boolean
  reduced: boolean
}

/**
 * The slot's contents, centred on the slot's middle: the tray it sits on, the faint outline of
 * its volume, and the part model (or a plain block if there is none).
 */
export function PartSlot({ partId, width, depth, height, live, color, accent, over, reduced }: PartSlotProps) {
  const tray = useRef<THREE.Mesh>(null)
  const outline = useRef<THREE.LineSegments>(null)
  const trayMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.8, roughness: 0.35, emissive: color, emissiveIntensity: 0.25 }), [color])
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 }), [color])
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), [])
  useEffect(
    () => () => {
      trayMat.dispose()
      lineMat.dispose()
      edges.dispose()
    },
    [trayMat, lineMat, edges]
  )
  const modelId = choiceArt(partId)?.model
  const box = <SlotBox width={width} depth={depth} live={live} color={color} over={over} reduced={reduced} />

  useFrame((state) => {
    const l = live.current
    if (!l) return
    const h = Math.max(0.01, l.height)
    if (tray.current) tray.current.position.y = -h / 2 + 0.006
    if (outline.current) outline.current.scale.set(width - 0.04, Math.max(0.005, h - 0.01), depth - 0.04)
    const pulse = over ? (reduced ? 1 : 0.7 + 0.3 * Math.sin(state.clock.elapsedTime * 8)) : 0
    trayMat.emissive.set(over ? '#ef4444' : color)
    trayMat.emissiveIntensity = over ? pulse * 0.9 : 0.25 + l.flash * 1.6
    lineMat.color.set(over ? '#ef4444' : color)
    lineMat.opacity = over ? 0.6 + 0.4 * pulse : 0.35 + l.flash * 0.65
  })

  return (
    <group>
      <mesh ref={tray} material={trayMat}>
        <boxGeometry args={[width - 0.06, 0.012, depth - 0.06]} />
      </mesh>
      <lineSegments ref={outline} geometry={edges} material={lineMat} />
      {modelId ? (
        <SlotBoundary key={partId} fallback={box}>
          <Suspense fallback={box}>
            <FittedPart modelId={modelId} width={width} depth={depth} height={height} faceDown={choiceArt(partId)?.category === 'propulsion' && !partId.startsWith('prop-ion')} live={live} over={over} accent={accent} reduced={reduced} />
          </Suspense>
        </SlotBoundary>
      ) : (
        box
      )}
    </group>
  )
}
