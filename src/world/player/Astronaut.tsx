import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useModel } from '../../assets/models'
import { useCampusStore } from '../../state/campusStore'
import { createWalker, setDestination, step, type NavGrid, type Vec2, type WalkerParams, type WalkerState } from './controller'

export interface AstronautHandle {
  /** Live position (shared vector, do not mutate); safe to read every frame */
  getPosition: () => THREE.Vector3
  /** Heading in radians about +Y (0 faces +Z) */
  getHeading: () => number
  /** Current speed, world units / second */
  getSpeed: () => number
  /** Move instantly (e.g. to a door when leaving a room) and drop any path */
  teleport: (x: number, z: number, heading?: number) => void
  readonly group: THREE.Group | null
}

export interface AstronautProps {
  navGrid: NavGrid
  /** Set by the ground click handler; a new Vector3 each click triggers a new route */
  clickTarget?: THREE.Vector3 | null
  onArrive?: (point: Vec2) => void
  /** Spawn point on the ground plane */
  start?: Vec2
  /** Rendered height in world units */
  height?: number
  /** Yaw offset between the glb's forward and +Z */
  modelYaw?: number
  /** Rotate WASD to match the camera (radians about Y); 0 = W walks toward -Z */
  cameraYaw?: number
  /** Set false while a room overlay or the setup dialog is up */
  controlsEnabled?: boolean
  walker?: Partial<WalkerParams>
}

const KEYS: Record<string, [number, number]> = {
  w: [0, -1],
  arrowup: [0, -1],
  s: [0, 1],
  arrowdown: [0, 1],
  a: [-1, 0],
  arrowleft: [-1, 0],
  d: [1, 0],
  arrowright: [1, 0],
}

/** The suit accent in astronaut.glb (the yellow material, `astnt1_2`) */
const ACCENT = 'astnt1_2'

/**
 * Click-to-move for a ground mesh: spread `onPointerDown` on it and pass `target` to
 * <Astronaut clickTarget>. Every click yields a fresh Vector3 so repeat clicks re-route.
 */
export function useClickToMove() {
  const [target, setTarget] = useState<THREE.Vector3 | null>(null)
  const onPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    setTarget(e.point.clone())
  }, [])
  return { target, onPointerDown }
}

export const Astronaut = forwardRef<AstronautHandle, AstronautProps>(function Astronaut(
  {
    navGrid,
    clickTarget = null,
    onArrive,
    start = { x: 0, z: 0 },
    height = 1,
    modelYaw = 0,
    cameraYaw = 0,
    controlsEnabled = true,
    walker: walkerOverride,
  },
  ref,
) {
  const suitColor = useCampusStore((s) => s.suitColor)
  const scene = useModel('model.env-astronaut')
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const state = useRef<WalkerState>(createWalker(start.x, start.z))
  const position = useRef(new THREE.Vector3(start.x, 0, start.z))
  const keys = useRef(new Set<string>())
  const phase = useRef(0)
  const onArriveRef = useRef(onArrive)
  useEffect(() => {
    onArriveRef.current = onArrive
  }, [onArrive])

  // Normalise the model (feet on the ground, centred, `height` tall) and give the accent its own material.
  const { model, accents } = useMemo(() => {
    const m = scene
    const mats: THREE.MeshStandardMaterial[] = []
    m.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      const src = mesh.material as THREE.MeshStandardMaterial
      if (src.name === ACCENT) {
        const own = src.clone()
        mats.push(own)
        mesh.material = own
      }
    })
    m.position.set(0, 0, 0)
    m.scale.setScalar(1)
    m.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(m)
    const size = box.getSize(new THREE.Vector3())
    const s = height / (size.y || 1)
    const c = box.getCenter(new THREE.Vector3())
    m.scale.setScalar(s)
    m.position.set(-c.x * s, -box.min.y * s, -c.z * s)
    return { model: m, accents: mats }
  }, [scene, height])

  useEffect(() => {
    for (const mat of accents) {
      mat.color.set(suitColor)
      mat.emissive.set(suitColor).multiplyScalar(0.12)
    }
  }, [suitColor, accents])

  const params = useMemo<WalkerParams>(
    () => ({ maxSpeed: 3.2, turnRate: 9, accel: 18, arriveRadius: 0.05, ...walkerOverride }),
    [walkerOverride],
  )

  // A new click target is a new route
  useEffect(() => {
    if (!clickTarget) return
    state.current = setDestination(state.current, navGrid, { x: clickTarget.x, z: clickTarget.z })
  }, [clickTarget, navGrid])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const k = e.key.toLowerCase()
      if (k in KEYS) keys.current.add(k)
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    const clear = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      getPosition: () => position.current,
      getHeading: () => state.current.heading,
      getSpeed: () => state.current.speed,
      teleport: (x, z, heading) => {
        state.current = createWalker(x, z, heading ?? state.current.heading)
        position.current.set(x, 0, z)
      },
      get group() {
        return root.current
      },
    }),
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    let mx = 0
    let mz = 0
    if (controlsEnabled)
      for (const k of keys.current) {
        mx += KEYS[k][0]
        mz += KEYS[k][1]
      }
    const c = Math.cos(cameraYaw)
    const sn = Math.sin(cameraYaw)
    const move = mx || mz ? { x: mx * c + mz * sn, z: -mx * sn + mz * c } : undefined
    const r = step(state.current, { move }, dt, navGrid, params)
    state.current = r.state
    if (r.arrived) onArriveRef.current?.(r.arrived)

    const s = state.current
    position.current.set(s.x, 0, s.z)
    const g = root.current
    if (g) {
      g.position.set(s.x, 0, s.z)
      g.rotation.y = s.heading + modelYaw
    }
    // Procedural gait: bob, sway and a forward lean that scale with speed
    const k = s.speed / params.maxSpeed
    phase.current += dt * (4 + 9 * k) * (k > 0.02 ? 1 : 0)
    const b = body.current
    if (b) {
      b.position.y = Math.abs(Math.sin(phase.current)) * 0.07 * k * height
      b.rotation.z = Math.sin(phase.current) * 0.09 * k
      b.rotation.x = 0.16 * k
    }
  })

  return (
    <group ref={root} position={[start.x, 0, start.z]}>
      <group ref={body}>
        <primitive object={model} />
      </group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01}>
        <circleGeometry args={[0.32 * height, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  )
})
