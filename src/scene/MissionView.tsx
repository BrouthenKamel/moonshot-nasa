import { Suspense, useCallback, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Design, TurnLog } from '../sim/types'
import { replayPose, type Pose } from '../viz/replayPose'

const MOON_X = 3
const MOON_RADIUS = 0.27
/** Larger = faster; about 0.6 s to settle */
const TWEEN_RATE = 6

function orbitRadius(altitudeKm: number): number {
  return MOON_RADIUS + altitudeKm / 500
}

/** Ship position for a pose (scene units). Always finite. */
function poseToPosition(pose: Pose): [number, number, number] {
  if (pose.where === 'orbit') {
    const r = orbitRadius(pose.orbitAltitudeKm)
    return [MOON_X + Math.cos(pose.orbitAngle) * r, Math.sin(pose.orbitAngle) * r, 0]
  }
  const t = pose.where === 'transfer' ? pose.transferProgress : 0
  return [-3 + t * 6, Math.sin(t * Math.PI) * 1.5, 0]
}

function Earth() {
  return (
    <mesh position={[-3, 0, 0]}>
      <sphereGeometry args={[0.5, 32, 32]} />
      <meshStandardMaterial color="#2563eb" />
    </mesh>
  )
}

function Moon() {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.1
    }
  })

  return (
    <mesh ref={meshRef} position={[MOON_X, 0, 0]}>
      <sphereGeometry args={[MOON_RADIUS, 32, 32]} />
      <meshStandardMaterial color="#9ca3af" />
    </mesh>
  )
}

function TransferPath() {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 50; i++) {
      const t = i / 50
      pts.push(new THREE.Vector3(-3 + t * 6, Math.sin(t * Math.PI) * 1.5, 0))
    }
    return pts
  }, [])

  return <Line points={points} color="#fbbf24" lineWidth={2} dashed dashSize={0.1} gapSize={0.05} />
}

function LunarOrbit({ radius }: { radius: number }) {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI * 2
      pts.push(new THREE.Vector3(MOON_X + Math.cos(angle) * radius, Math.sin(angle) * radius, 0))
    }
    return pts
  }, [radius])

  return <Line points={points} color="#22c55e" lineWidth={2} />
}

function Spacecraft({ pose }: { pose: Pose }) {
  const groupRef = useRef<THREE.Group | null>(null)
  const target = poseToPosition(pose)
  // Set once on mount; useFrame is the only writer afterwards so the tween is not overridden by a prop.
  const setInitial = useCallback((g: THREE.Group | null) => {
    groupRef.current = g
    if (g) g.position.set(target[0], target[1], target[2] ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((_, delta) => {
    const g = groupRef.current
    if (!g) return
    g.position.x = THREE.MathUtils.damp(g.position.x, target[0], TWEEN_RATE, delta)
    g.position.y = THREE.MathUtils.damp(g.position.y, target[1], TWEEN_RATE, delta)
  })

  return (
    <group ref={setInitial}>
      <mesh>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshStandardMaterial color="#60a5fa" />
      </mesh>
      {pose.terminal === 'failed' && (
        <mesh position={[0, 0.2, 0]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
      )}
    </group>
  )
}

function SouthPole({ coverage }: { coverage: number }) {
  const arcRadius = 0.1
  const arcAngle = (Math.min(100, Math.max(0, coverage)) / 100) * Math.PI * 2

  const points = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 32; i++) {
      const angle = (i / 32) * arcAngle - arcAngle / 2
      pts.push(new THREE.Vector3(MOON_X + Math.sin(angle) * arcRadius, -MOON_RADIUS, Math.cos(angle) * arcRadius))
    }
    return pts
  }, [arcAngle])

  if (!(coverage > 0)) return null

  return (
    <>
      <mesh position={[MOON_X, -MOON_RADIUS, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[arcRadius, 32]} />
        <meshBasicMaterial color="#22c55e" opacity={0.3} transparent />
      </mesh>
      <Line points={points} color="#22c55e" lineWidth={3} />
    </>
  )
}

interface MissionViewProps {
  design: Design
  logs: TurnLog[]
  turnIndex: number
  terminal?: 'complete' | 'failed'
  className?: string
}

/** Controlled mission scene: the ship pose comes from the selected turn, with a short tween. */
export function MissionView({ design, logs, turnIndex, terminal, className = 'h-64' }: MissionViewProps) {
  const pose = useMemo(() => replayPose(design, logs, turnIndex, terminal), [design, logs, turnIndex, terminal])

  return (
    <div className={`w-full rounded-lg bg-slate-900 ${className}`}>
      <Suspense
        fallback={<div className="flex h-full items-center justify-center text-slate-500">Loading 3D view...</div>}
      >
        <Canvas camera={{ position: [0, 5, 8], fov: 50 }}>
          <ambientLight intensity={0.3} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <Earth />
          <Moon />
          <TransferPath />
          <LunarOrbit radius={orbitRadius(pose.orbitAltitudeKm)} />
          <Spacecraft pose={pose} />
          <SouthPole coverage={pose.coveragePercent} />
          <OrbitControls enableZoom={true} enablePan={true} />
        </Canvas>
      </Suspense>
    </div>
  )
}
