import { Component, Suspense, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { useModel } from '../../assets/models'
import { rides } from '../../data/rides'
import { useGameStore } from '../../state/gameStore'
import { CAPTURE_GAP, EARTH, EARTH_R, MOON, MOON_R, craftLeg, rideLeg, type P } from '../../viz/ride/ridePaths'
import { CubeSat, Earth, Effects, Moon, Starfield, Sun, prefersReducedMotion, useGraphics } from '../space'

/**
 * Launch Site, step 5: from Earth to the capture burn. The chosen ride's leg (orange, the rocket)
 * and the craft's own leg (white, its engine) end at the capture-burn marker at the Moon; the
 * orbit itself belongs to the Orbit step. The other rides are drawn faintly for comparison.
 */

const v3 = (p: P, y = 0) => new THREE.Vector3(p[0], y, p[1])

class RideModelBoundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}

function CommercialLander({ position }: { position: THREE.Vector3 }) {
  const scene = useModel('model.env-lunar-lander')
  return <primitive object={scene} position={position} scale={0.075} rotation={[0.15, -0.6, 0]} />
}

function Traveller({ points, color, period }: { points: THREE.Vector3[]; color: string; period: number }) {
  const design = useGameStore((s) => s.design)
  const ref = useRef<THREE.Group>(null)
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const tangent = useMemo(() => new THREE.Vector3(), [])
  const next = useMemo(() => new THREE.Vector3(), [])
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useFrame((state) => {
    if (!ref.current) return
    const t = reduced ? 0.6 : (state.clock.elapsedTime / period) % 1
    curve.getPointAt(t, pos)
    curve.getTangentAt(t, tangent)
    ref.current.position.copy(pos)
    ref.current.lookAt(next.copy(pos).add(tangent))
  })
  const fallbackSphere = (
    <mesh>
      <sphereGeometry args={[0.09, 16, 16]} />
      <meshBasicMaterial color={new THREE.Color(color).multiplyScalar(3)} toneMapped={false} />
    </mesh>
  )
  return (
    <group ref={ref}>
      <RideModelBoundary fallback={fallbackSphere}>
        <Suspense fallback={fallbackSphere}>
          <CubeSat design={design} deploy={1} burn={0.35} scale={0.75} />
        </Suspense>
      </RideModelBoundary>
    </group>
  )
}

function CaptureMarker() {
  const ring = useRef<THREE.Mesh>(null)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useFrame((state) => {
    if (!ring.current || reduced) return
    const k = 1 + 0.15 * Math.sin(state.clock.elapsedTime * 3)
    ring.current.scale.setScalar(k)
  })
  return (
    <mesh ref={ring} position={v3(MOON, 0)} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[CAPTURE_GAP - 0.04, CAPTURE_GAP + 0.02, 64]} />
      <meshBasicMaterial color={new THREE.Color(3, 1.6, 0.4)} transparent opacity={0.75} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  )
}

export function RideView({ rideId, transferId }: { rideId: string; transferId: string }) {
  const quality = useGraphics((s) => s.quality)
  const ride = useMemo(() => rideLeg(rideId).map((p) => v3(p)), [rideId])
  const craft = useMemo(() => craftLeg(rideId, transferId).map((p) => v3(p)), [rideId, transferId])
  const others = useMemo(() => rides.filter((r) => r.id !== rideId).map((r) => rideLeg(r.id).map((p) => v3(p))), [rideId])
  return (
    <Canvas
      className="!absolute inset-0"
      dpr={quality === 'high' ? [1, 2] : [1, 1.25]}
      camera={{ position: [1.5, 15, 9.5], fov: 42, near: 0.1, far: 900 }}
      onCreated={({ camera }) => camera.lookAt(1.2, 0, -0.6)}
      aria-hidden
    >
      <color attach="background" args={['#000000']} />
      <Suspense fallback={null}>
        <Starfield brightness={0.6} />
        <Sun intensity={2.6} fill={0.06} glare={false} />
        <group position={v3(EARTH)}>
          <Earth radius={EARTH_R} spin={0.03} />
        </group>
        <group position={v3(MOON)} scale={MOON_R}>
          <Moon />
        </group>
        {others.map((pts, i) => (
          <Line key={i} points={pts} color="#f97316" lineWidth={1} transparent opacity={0.18} dashed dashSize={0.2} gapSize={0.15} />
        ))}
        <Line points={ride} color="#fb923c" lineWidth={2.4} />
        <Line points={craft} color="#e2e8f0" lineWidth={2} dashed dashSize={0.3} gapSize={0.14} />
        <Traveller points={craft} color="#ffffff" period={rideId === 'ride-gto' || transferId === 'transfer-low-energy' ? 9 : 5} />
        {rideId === 'ride-commercial' && ride.length > 0 && (
          <RideModelBoundary>
            <Suspense fallback={null}>
              <CommercialLander position={ride[ride.length - 1]} />
            </Suspense>
          </RideModelBoundary>
        )}
        <CaptureMarker />
        <Effects bloom={0.8} vignette={0.6} />
      </Suspense>
    </Canvas>
  )
}
