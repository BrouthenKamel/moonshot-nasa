import { Suspense, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { EffectComposer, TiltShift2 } from '@react-three/postprocessing'
import { PCFSoftShadowMap, Vector3 } from 'three'
import { useFollowCamera, CAMERA_FOV, CAMERA_OFFSET } from './camera/rig'
import { Campus } from './campus/Campus'
import { SPAWN, doorPoint } from './campus/layout'
import type { RoomId } from './rooms/ids'

const SKY = '#cfe3ee'
const STUB_SPEED = 8
const WORLD_RADIUS = 34

export interface WorldRootProps {
  /** Extra scene content: WP-1B drops the astronaut (and cart) in here */
  children?: ReactNode
  /**
   * Whoever the camera follows. Omit it and a stub marker walks the ground plane on click.
   * It must return the same live Vector3 each call (no allocation per frame).
   */
  followTarget?: () => Vector3
  /** Ground / door clicks. Needed with `followTarget`; the stub handles its own clicks without it. */
  onGroundClick?: (point: Vector3) => void
}

function Stub({ pos, goal }: { pos: Vector3; goal: Vector3 }) {
  const ref = useRef<import('three').Group>(null)
  useFrame((_, dt) => {
    const dx = goal.x - pos.x
    const dz = goal.z - pos.z
    const dist = Math.hypot(dx, dz)
    if (dist > 0.02) {
      const step = Math.min(dist, STUB_SPEED * Math.min(dt, 0.25))
      pos.x += (dx / dist) * step
      pos.z += (dz / dist) * step
    }
    ref.current?.position.copy(pos)
  })
  return (
    <group ref={ref}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <capsuleGeometry args={[0.3, 0.6, 4, 10]} />
        <meshStandardMaterial color="#f2a541" />
      </mesh>
    </group>
  )
}

function Rig({ getTarget }: { getTarget: () => Vector3 }) {
  useFollowCamera(getTarget)
  return null
}

/** Dev only: lets e2e checks read the renderer stats */
function DevProbe() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __ihGl?: unknown }).__ihGl = gl
  }, [gl])
  return null
}

/**
 * One R3F canvas for the whole walkable world: soft daylight, shadows, a tilt-shift 3/4 camera.
 * Rooms are not rendered in here; entering a door swaps CampusScreen to the room component.
 */
export function WorldRoot({ children, followTarget, onGroundClick }: WorldRootProps) {
  const stubPos = useMemo(() => new Vector3(SPAWN[0], 0, SPAWN[1]), [])
  const stubGoal = useMemo(() => new Vector3(SPAWN[0], 0, SPAWN[1]), [])
  const stubTarget = useCallback(() => stubPos, [stubPos])
  const getTarget = followTarget ?? stubTarget

  const walkTo = useCallback(
    (p: Vector3) => {
      if (onGroundClick) onGroundClick(p)
      else if (!followTarget) {
        const r = Math.hypot(p.x, p.z)
        const k = r > WORLD_RADIUS ? WORLD_RADIUS / r : 1
        stubGoal.set(p.x * k, 0, p.z * k)
      }
    },
    [onGroundClick, followTarget, stubGoal],
  )
  const onWalkToRoom = useCallback(
    (id: RoomId) => {
      const [x, z] = doorPoint(id)
      walkTo(new Vector3(x, 0, z))
    },
    [walkTo],
  )

  return (
    <Canvas
      shadows={{ type: PCFSoftShadowMap }}
      dpr={[1, 2]}
      camera={{
        fov: CAMERA_FOV,
        near: 1,
        far: 260,
        position: [SPAWN[0] + CAMERA_OFFSET.x, CAMERA_OFFSET.y, SPAWN[1] + CAMERA_OFFSET.z],
      }}
      gl={{ antialias: true }}
      data-testid="world-canvas"
    >
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 90, 170]} />
      <hemisphereLight args={['#fff6e5', '#8fae82', 1.1]} />
      <directionalLight
        position={[-18, 30, 16]}
        intensity={2.4}
        color="#fff1d6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <Suspense fallback={null}>
        <Campus getTarget={getTarget} onWalk={onWalkToRoom} />
        {/* Click-to-move surface */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.001, 0]}
          visible={false}
          onClick={(e: ThreeEvent<MouseEvent>) => walkTo(e.point)}
        >
          <circleGeometry args={[WORLD_RADIUS + 4, 8]} />
          <meshBasicMaterial />
        </mesh>
        {!followTarget && <Stub pos={stubPos} goal={stubGoal} />}
        {children}
      </Suspense>
      <Rig getTarget={getTarget} />
      <DevProbe />
      <EffectComposer multisampling={4} enableNormalPass={false}>
        <TiltShift2 blur={0.12} taper={0.6} samples={8} />
      </EffectComposer>
    </Canvas>
  )
}
