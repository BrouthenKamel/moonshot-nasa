/**
 * Portrait Lab (dev only): http://localhost:5173/portrait-lab.html?id=model.prop-ion&deploy=1
 * Renders ONE manifest model in the shared card studio on a transparent background, for
 * scripts/assets/render-portraits.ts to screenshot. Not part of the production build.
 *
 * Query: id = manifest model id (required), deploy = 1 (default, deployed) or 0 (stowed),
 * bg = optional CSS colour behind the canvas when looking at it by hand.
 * Sets window.__portraitReady = true once the model is drawn (or __portraitError on failure).
 */
import { Component, StrictMode, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { assets, type ModelId } from '../manifest'
import { useModel } from '../models'

declare global {
  interface Window {
    __portraitReady?: boolean
    __portraitError?: string
  }
}

/** Hero camera: 35 degrees around from the front (+Z) towards +X, 22 degrees above the floor */
const AZIMUTH = THREE.MathUtils.degToRad(35)
const ELEVATION = THREE.MathUtils.degToRad(22)
function viewDir(azimuth = AZIMUTH, elevation = ELEVATION) {
  return new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).normalize()
}

/**
 * Per-model framing for shapes the shared hero camera cannot fill a square card with:
 * flat parts get a higher camera, tall rockets lean across the card diagonally (no floor shadow).
 * Degrees for the camera, radians for the lean (around the view direction).
 */
const HINTS: Record<string, { elevation?: number; azimuth?: number; lean?: number }> = {
  'model.ride-gto': { lean: -0.78, elevation: 12 },
  'model.ride-lunar': { lean: -0.78, elevation: 12 },
  'model.radio-uhf': { elevation: 62, azimuth: 25 },
  'model.solar-1wing': { elevation: 48 },
}
const FOV = 26
/** Share of the frame the model's silhouette fills (largest of width and height) */
const FILL = 0.8

/** Studio look, in normalised units: every model is scaled to a bounding radius of 1 */
const STUDIO = {
  envIntensity: 0.75,
  exposure: 1.0,
  key: { color: '#ffe0bd', intensity: 3.2, position: [-2.2, 3.6, 2.6] as const },
  rim: { color: '#9cc6ff', intensity: 3.6, position: [-3.6, 1.4, -2.4] as const },
  fill: { color: '#cfdcff', intensity: 0.4, position: [3, -0.5, 1] as const },
  shadow: { opacity: 0.5, blur: 2.2, far: 0.55, scale: 5, color: '#0a0f1a' },
}

const params = new URLSearchParams(location.search)
const modelIds = new Set<string>(assets.filter((a) => a.kind === 'model').map((a) => a.id))

/** Pose every pivot: deploy 1 keeps the exported (deployed) rotation, 0 uses userData.stowed */
function pose(root: THREE.Object3D, deploy: number) {
  root.traverse((o) => {
    if (!o.name.startsWith('pivot_')) return
    o.userData.deployed ??= o.rotation.clone()
    const stowed = o.userData.stowed as [number, number, number] | undefined
    if (!stowed) return
    const d = o.userData.deployed as THREE.Euler
    o.rotation.set(
      stowed[0] + (d.x - stowed[0]) * deploy,
      stowed[1] + (d.y - stowed[1]) * deploy,
      stowed[2] + (d.z - stowed[2]) * deploy,
    )
  })
}

/** World-space vertices of every visible mesh (subsampled for very dense models) */
function silhouettePoints(root: THREE.Object3D): THREE.Vector3[] {
  root.updateWorldMatrix(true, true)
  const pts: THREE.Vector3[] = []
  root.traverseVisible((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const pos = mesh.geometry.getAttribute('position')
    if (!pos) return
    const step = Math.max(1, Math.floor(pos.count / 20000))
    const v = new THREE.Vector3()
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      const im = mesh as THREE.InstancedMesh
      const m = new THREE.Matrix4()
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m)
        m.premultiply(im.matrixWorld)
        for (let j = 0; j < pos.count; j += step) pts.push(v.fromBufferAttribute(pos, j).applyMatrix4(m).clone())
      }
    } else {
      for (let j = 0; j < pos.count; j += step) pts.push(v.fromBufferAttribute(pos, j).applyMatrix4(mesh.matrixWorld).clone())
    }
  })
  return pts
}

/**
 * Place the camera on the fixed hero direction so the projected silhouette is centred and
 * fills FILL of the frame. Starts from the bounding sphere, then refines on the real projection.
 */
function frame(cam: THREE.PerspectiveCamera, pts: THREE.Vector3[], sphere: THREE.Sphere, VIEW_DIR: THREE.Vector3) {
  const half = THREE.MathUtils.degToRad(cam.fov / 2)
  const target = sphere.center.clone()
  let dist = sphere.radius / Math.sin(half) / FILL
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const p = new THREE.Vector3()
  for (let iter = 0; iter < 6; iter++) {
    cam.position.copy(target).addScaledVector(VIEW_DIR, dist)
    cam.lookAt(target)
    cam.near = dist / 50
    cam.far = dist * 10
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld(true)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const q of pts) {
      p.copy(q).project(cam)
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    const extent = Math.max(maxX - minX, maxY - minY) / 2
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const halfSize = dist * Math.tan(half)
    right.setFromMatrixColumn(cam.matrixWorld, 0)
    up.setFromMatrixColumn(cam.matrixWorld, 1)
    target.addScaledVector(right, cx * halfSize).addScaledVector(up, cy * halfSize)
    dist *= extent / FILL
  }
  cam.position.copy(target).addScaledVector(VIEW_DIR, dist)
  cam.lookAt(target)
  cam.near = dist / 50
  cam.far = dist * 10
  cam.updateProjectionMatrix()
}

/** RoomEnvironment through PMREM: soft studio reflections, built locally (no CDN) */
function StudioEnvironment() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    scene.environment = env
    scene.environmentIntensity = STUDIO.envIntensity
    scene.background = null
    return () => {
      scene.environment = null
      env.dispose()
    }
  }, [gl, scene])
  return null
}

function Portrait({ id, deploy }: { id: ModelId; deploy: number }) {
  const model = useModel(id)
  const hint = HINTS[id] ?? {}
  const dir = useMemo(
    () => viewDir(hint.azimuth !== undefined ? THREE.MathUtils.degToRad(hint.azimuth) : AZIMUTH, hint.elevation !== undefined ? THREE.MathUtils.degToRad(hint.elevation) : ELEVATION),
    [hint.azimuth, hint.elevation],
  )
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)

  // Pose, then normalise: centred on the footprint, resting on y = 0, bounding radius 1
  const { scale, offset, sphere } = useMemo(() => {
    pose(model, deploy)
    model.position.set(0, 0, 0)
    model.scale.setScalar(1)
    model.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(model, true)
    const s = 1 / Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 1e-6)
    const c = box.getCenter(new THREE.Vector3())
    const offset = new THREE.Vector3(-c.x, -box.min.y, -c.z).multiplyScalar(s)
    const sphere = new THREE.Sphere(new THREE.Vector3(0, (box.max.y - box.min.y) * s * 0.5, 0), 1)
    return { scale: s, offset, sphere }
  }, [model, deploy])

  const holder = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    if (!holder.current) return
    if (hint.lean) holder.current.quaternion.setFromAxisAngle(dir, hint.lean)
    holder.current.updateWorldMatrix(true, true)
    frame(camera, silhouettePoints(holder.current), sphere, dir)
    invalidate()
  }, [camera, sphere, invalidate, dir, hint.lean])

  // Ready once a few frames are drawn (contact shadow and environment settle)
  const frames = useRef(0)
  useFrame(() => {
    if (++frames.current === 4) window.__portraitReady = true
  })

  return (
    <group ref={holder} position={offset} scale={scale}>
      <primitive object={model} />
    </group>
  )
}

class Boundary extends Component<{ children: ReactNode }, { error?: string }> {
  state: { error?: string } = {}
  static getDerivedStateFromError(e: unknown) {
    return { error: String(e instanceof Error ? e.message : e) }
  }
  componentDidCatch(e: unknown) {
    window.__portraitError = String(e instanceof Error ? e.message : e)
  }
  render() {
    return this.state.error ? null : this.props.children
  }
}

function App() {
  const id = params.get('id') ?? ''
  const deploy = params.get('deploy') === '0' ? 0 : 1
  const valid = modelIds.has(id)
  useEffect(() => {
    if (!valid) window.__portraitError = `unknown model id "${id}"`
    const bg = params.get('bg')
    if (bg) document.body.style.background = bg
  }, [id, valid])
  if (!valid) return null
  return (
    <Canvas
      dpr={2}
      camera={{ fov: FOV, position: [0, 0, 5] }}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, toneMappingExposure: STUDIO.exposure }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <StudioEnvironment />
      <directionalLight color={STUDIO.key.color} intensity={STUDIO.key.intensity} position={[...STUDIO.key.position]} />
      <directionalLight color={STUDIO.rim.color} intensity={STUDIO.rim.intensity} position={[...STUDIO.rim.position]} />
      <directionalLight color={STUDIO.fill.color} intensity={STUDIO.fill.intensity} position={[...STUDIO.fill.position]} />
      <Boundary>
        <Suspense fallback={null}>
          <Portrait id={id as ModelId} deploy={deploy} />
        </Suspense>
      </Boundary>
      {!HINTS[id]?.lean && (
      <ContactShadows
        position={[0, -0.002, 0]}
        opacity={STUDIO.shadow.opacity}
        blur={STUDIO.shadow.blur}
        far={STUDIO.shadow.far}
        scale={STUDIO.shadow.scale}
        color={STUDIO.shadow.color}
        resolution={512}
      />
      )}
    </Canvas>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
