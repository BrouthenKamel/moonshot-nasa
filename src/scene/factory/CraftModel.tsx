import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useModel, showParts } from '../../assets/models'
import { FRAME_HEIGHT, type BayView } from '../../viz/spacecraft/bayView'

/**
 * The outside of the craft from Kamel's cubesat-6u.glb (scripts/assets/models/cubesat-6u.ts).
 * The model lies along Z (36.6 cm long, 22.6 wide, 10 high), its top face (+Y)
 * carrying the wing hinges, patches, dish boom and star tracker. The bay stands the
 * box up: length vertical with the nozzles down, top face to the front so the wing
 * cells face the camera, stretched onto the bay's 2 x 3 x 1 frame. Its body panels and anything inside the box are
 * hidden: the inside belongs to the bay's to-scale part blocks.
 */

const ENVELOPE = { x: 0.226, y: 0.1, z: 0.366 } // metres, as in the generator
const BAY = { x: 2, y: 1, z: FRAME_HEIGHT } // bay units for model x, y (depth), z (height)
// The body, its end decks, and the top-face solar panel, which would cover the open front
const HIDDEN = new Set(['body', 'deck-front', 'deck-back', 'mli-bottom', 'body-top'])

interface Pivot {
  node: THREE.Object3D
  stowed: THREE.Euler
  deployed: THREE.Euler
}

interface Prepared {
  wingPivots: Record<string, Pivot[]> // by solar part id
  cells: THREE.MeshStandardMaterial[]
  ion: THREE.MeshStandardMaterial[]
}

/** Hide the box's body and its inside, find the wing hinges, and give this copy its own glowing materials. */
function prepare(root: THREE.Object3D): Prepared {
  root.updateMatrixWorld(true)
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const box = new THREE.Box3()
  const centre = new THREE.Vector3()
  const inset = 0.012
  const cells = new Map<THREE.Material, THREE.MeshStandardMaterial>()
  const ion = new Map<THREE.Material, THREE.MeshStandardMaterial>()

  root.traverse((o) => {
    if (HIDDEN.has(o.name)) o.visible = false
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    // Anything whose centre sits inside the box would collide with the part blocks
    box.setFromObject(mesh).applyMatrix4(toRoot).getCenter(centre)
    if (
      Math.abs(centre.x) < ENVELOPE.x / 2 - inset &&
      Math.abs(centre.y) < ENVELOPE.y / 2 - inset &&
      Math.abs(centre.z) < ENVELOPE.z / 2 - inset
    )
      mesh.visible = false
    // Own copies of the materials that flicker, so other users of the model are untouched
    const own = (m: THREE.Material): THREE.Material => {
      const pool = m.name === 'solar_cell' ? cells : m.name === 'ion_glow' ? ion : null
      if (!pool) return m
      if (!pool.has(m)) pool.set(m, (m as THREE.MeshStandardMaterial).clone())
      return pool.get(m)!
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material)
  })

  const wingPivots: Record<string, Pivot[]> = {}
  for (const id of ['solar-1wing', 'solar-2wing']) {
    const part = root.getObjectByName(`part_${id}`)
    const list: Pivot[] = []
    part?.traverse((o) => {
      const stowed = o.userData?.stowed as number[] | undefined
      if (!o.name.startsWith('pivot_') || !Array.isArray(stowed) || stowed.length !== 3) return
      list.push({ node: o, stowed: new THREE.Euler(stowed[0], stowed[1], stowed[2]), deployed: o.rotation.clone() })
    })
    wingPivots[id] = list
  }
  return { wingPivots, cells: [...cells.values()], ion: [...ion.values()] }
}

export function CraftModel({ view, reduced }: { view: BayView; reduced: boolean }) {
  const root = useModel('model.cubesat-6u')
  const prepared = useMemo(() => prepare(root), [root])
  const o = view.outside
  const partsKey = o.modelParts.join('|')
  const solarId = o.modelParts.find((id) => id.startsWith('solar-')) ?? ''
  const unfold = useRef(1)

  useEffect(() => {
    showParts(root, partsKey ? partsKey.split('|') : [])
  }, [root, partsKey])

  // A newly chosen wing set unfolds from stowed
  useEffect(() => {
    if (!reduced) unfold.current = 0
  }, [solarId, reduced])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    unfold.current = reduced ? 1 : Math.min(1, unfold.current + dt / 1.4)
    const k = 1 - Math.pow(1 - unfold.current, 3)
    for (const p of prepared.wingPivots[solarId] ?? []) {
      p.node.rotation.set(
        p.stowed.x + (p.deployed.x - p.stowed.x) * k,
        p.stowed.y + (p.deployed.y - p.stowed.y) * k,
        p.stowed.z + (p.deployed.z - p.stowed.z) * k
      )
    }
    for (const m of prepared.cells) {
      m.emissive.set('#1e3a8a')
      m.emissiveIntensity = o.powerShort ? (reduced ? 0.05 : 0.1 + 0.1 * Math.sin(t * 9)) : 0.35
    }
    const on = o.engineStarved ? (reduced ? 0.15 : Math.sin(t * 14) > 0.6 ? 1.6 : 0.1) : reduced ? 2.5 : 2.2 + 0.4 * Math.sin(t * 5)
    for (const m of prepared.ion) m.emissiveIntensity = on
  })

  return (
    <primitive
      object={root}
      position-y={FRAME_HEIGHT / 2}
      rotation={[-Math.PI / 2, Math.PI, 0, 'YXZ']}
      scale={[BAY.x / ENVELOPE.x, BAY.y / ENVELOPE.y, BAY.z / ENVELOPE.z]}
    />
  )
}
