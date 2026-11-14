import { Suspense, useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { useModel } from '../../assets/models'
import { choiceArt } from '../../assets/catalogueArt'
import { StageBoundary } from './StageBoundary'

/*
 * Positions are in the satellite's local units (the stage's bus is 0.8 x 0.5 x 1.4), relative to
 * the instrument's slot (Scene.tsx puts the slot at x = slotX, z = -0.2). The beams start at
 * local y -0.66, z -0.3 (beams.tsx) and run forward and down to the ground ahead.
 */
/** Underside of the bus: the instrument's mounting plate goes here */
const MOUNT_Y = -0.25
/** Biggest size across track (two fit side by side at slotX ±0.2), along track and down */
const MAX_ACROSS = 0.38
const MAX_ALONG = 0.8
const MAX_DOWN = 0.42
/** Front of the instrument, just behind where the beam starts */
const FRONT_Z = -0.08
/** The beam leaves forward and down; tilt the aperture the same way */
const TILT = 0.32
/**
 * The catalogue models stand on their base plate and look out along +Z. Upside down
 * (plate against the bus) and turned to look forward along -Z: a half turn about X, then
 * the nose tipped down toward the ground ahead.
 */
const MOUNT = new THREE.Euler(Math.PI - TILT, 0, 0)

let studio: THREE.Texture | null = null

/** Soft studio reflections so the instrument's metal does not render black over the dark Moon */
function useStudio(model: THREE.Object3D) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!studio) {
      const pmrem = new THREE.PMREMGenerator(gl)
      studio = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
      pmrem.dispose()
    }
    model.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (m && 'envMapIntensity' in m) {
        m.envMap = studio
        m.envMapIntensity = 0.9
        m.needsUpdate = true
      }
    })
  }, [gl, model])
}

/** The model's box once mounted (its own box's corners turned by MOUNT) */
function mountedBox(model: THREE.Object3D): THREE.Box3 {
  model.updateMatrixWorld(true)
  const own = new THREE.Box3().setFromObject(model)
  const q = new THREE.Quaternion().setFromEuler(MOUNT)
  const out = new THREE.Box3()
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Vector3(i & 1 ? own.max.x : own.min.x, i & 2 ? own.max.y : own.min.y, i & 4 ? own.max.z : own.min.z)
    out.expandByPoint(p.applyQuaternion(q))
  }
  return out
}

/** Where the aperture ring sits, in slot coordinates, for a given fitted box */
interface Fit {
  scale: number
  position: [number, number, number]
  aperture: [number, number, number]
}

function fitModel(model: THREE.Object3D): Fit {
  const box = mountedBox(model)
  const size = box.getSize(new THREE.Vector3())
  const s = Math.min(MAX_ACROSS / size.x, MAX_DOWN / size.y, MAX_ALONG / size.z)
  const position: [number, number, number] = [-((box.min.x + box.max.x) / 2) * s, MOUNT_Y - box.max.y * s, FRONT_Z - box.min.z * s]
  const aperture: [number, number, number] = [0, MOUNT_Y - size.y * s * 0.55, FRONT_Z - 0.01]
  return { scale: s, position, aperture }
}

/** The real instrument from the catalogue, hung under the bus and looking where its beam goes */
function RealInstrument({ id, color }: { id: string; color: string }) {
  const modelId = choiceArt(id)?.model
  if (!modelId) throw new Error(`no model for ${id}`)
  const model = useModel(modelId)
  useStudio(model)
  // Measure only; no re-parenting (StrictMode runs this twice)
  const fit = useMemo(() => fitModel(model), [model])
  return (
    <>
      <group position={fit.position} scale={fit.scale}>
        <group rotation={MOUNT}>
          <primitive object={model} />
        </group>
      </group>
      <ApertureRing at={fit.aperture} color={color} />
    </>
  )
}

/** A ring in the instrument's beam colour round its aperture: the same colour as its beam and readout */
function ApertureRing({ at, color }: { at: [number, number, number]; color: string }) {
  return (
    <>
      <mesh position={at} rotation={[-TILT, 0, 0]}>
        <torusGeometry args={[0.085, 0.014, 10, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <pointLight position={[at[0], at[1] - 0.1, at[2] - 0.2]} intensity={0.8} distance={1.4} decay={2} color={color} />
    </>
  )
}

/** The stand-in block, while the model loads or where it cannot load */
function Block({ color }: { color: string }) {
  return (
    <>
      <mesh position={[0, -0.42, 0]}>
        <boxGeometry args={[0.34, 0.34, 0.7]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.62, -0.1]}>
        <cylinderGeometry args={[0.1, 0.13, 0.08, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </>
  )
}

/** One instrument under the bus. Local origin: its slot (Scene.tsx). */
export function InstrumentModel({ id, color }: { id: string; color: string }) {
  const block = <Block color={color} />
  return (
    <StageBoundary fallback={block}>
      <Suspense fallback={block}>
        <RealInstrument id={id} color={color} />
      </Suspense>
    </StageBoundary>
  )
}
