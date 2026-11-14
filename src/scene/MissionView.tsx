import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Line } from '@react-three/drei'
import { useGameStore } from '../state/gameStore'
import { getOrbitById } from '../data/orbits'
import * as THREE from 'three'

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
    <mesh ref={meshRef} position={[3, 0, 0]}>
      <sphereGeometry args={[0.27, 32, 32]} />
      <meshStandardMaterial color="#9ca3af" />
    </mesh>
  )
}

function TransferPath() {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 50; i++) {
      const t = i / 50
      const x = -3 + t * 6
      const y = Math.sin(t * Math.PI) * 1.5
      pts.push(new THREE.Vector3(x, y, 0))
    }
    return pts
  }, [])

  return (
    <Line
      points={points}
      color="#fbbf24"
      lineWidth={2}
      dashed
      dashSize={0.1}
      gapSize={0.05}
    />
  )
}

function LunarOrbit() {
  const design = useGameStore((s) => s.design)
  const orbit = getOrbitById(design.orbit)

  const radius = 0.27 + (orbit?.altitude ?? 100) / 500

  const points = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI * 2
      pts.push(
        new THREE.Vector3(
          3 + Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          0
        )
      )
    }
    return pts
  }, [radius])

  return (
    <Line
      points={points}
      color="#22c55e"
      lineWidth={2}
    />
  )
}

function Spacecraft({ inOrbit }: { inOrbit: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const design = useGameStore((s) => s.design)
  const orbit = getOrbitById(design.orbit)
  const radius = 0.27 + (orbit?.altitude ?? 100) / 500

  useFrame((state) => {
    if (meshRef.current) {
      if (inOrbit) {
        const angle = state.clock.elapsedTime * 0.5
        meshRef.current.position.x = 3 + Math.cos(angle) * radius
        meshRef.current.position.y = Math.sin(angle) * radius
      } else {
        // Moving along transfer
        const t = (Math.sin(state.clock.elapsedTime * 0.3) + 1) / 2
        meshRef.current.position.x = -3 + t * 6
        meshRef.current.position.y = Math.sin(t * Math.PI) * 1.5
      }
    }
  })

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[0.05, 0.05, 0.05]} />
      <meshStandardMaterial color="#60a5fa" />
    </mesh>
  )
}

function SouthPole() {
  const simState = useGameStore((s) => s.simState)
  const coverage = simState?.coveragePercent ?? 0

  // Draw coverage arc at south pole
  const arcRadius = 0.1
  const arcAngle = (coverage / 100) * Math.PI * 2

  const points = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 32; i++) {
      const angle = (i / 32) * arcAngle - arcAngle / 2
      pts.push(
        new THREE.Vector3(
          3 + Math.sin(angle) * arcRadius,
          -0.27,
          Math.cos(angle) * arcRadius
        )
      )
    }
    return pts
  }, [arcAngle])

  if (coverage <= 0) return null

  return (
    <>
      <mesh position={[3, -0.27, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[arcRadius, 32]} />
        <meshBasicMaterial color="#22c55e" opacity={0.3} transparent />
      </mesh>
      <Line points={points} color="#22c55e" lineWidth={3} />
    </>
  )
}

interface MissionViewProps {
  showTransfer?: boolean
}

export function MissionView({ showTransfer = true }: MissionViewProps) {
  const simState = useGameStore((s) => s.simState)
  const inOrbit = simState?.capturedIntoOrbit ?? false

  return (
    <div className="h-64 w-full rounded-lg bg-slate-900">
      <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">Loading 3D view...</div>}>
        <Canvas camera={{ position: [0, 5, 8], fov: 50 }}>
          <ambientLight intensity={0.3} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <Earth />
          <Moon />
          {showTransfer && <TransferPath />}
          <LunarOrbit />
          <Spacecraft inOrbit={inOrbit} />
          <SouthPole />
          <OrbitControls enableZoom={true} enablePan={true} />
        </Canvas>
      </Suspense>
    </div>
  )
}
