import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, MeshStandardMaterial } from 'three'
import { prefersReducedMotion } from '../space/quality'

/**
 * Small looping motions for the base buildings: a blinking light, something that
 * turns, something that sways. Decoration only; still under reduced motion.
 */

/** A small light that blinks on a slow beat */
export function Blinker({
  position,
  color = '#ff4d3d',
  period = 1.6,
  phase = 0,
  size = 0.07,
}: {
  position: [number, number, number]
  color?: string
  period?: number
  phase?: number
  size?: number
}) {
  const mat = useRef<MeshStandardMaterial>(null)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useFrame(({ clock }) => {
    if (!mat.current || reduced) return
    const t = ((clock.elapsedTime + phase) % period) / period
    mat.current.emissiveIntensity = t < 0.25 ? 2.2 : 0.15
  })
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 10, 8]} />
      <meshStandardMaterial ref={mat} color={color} emissive={color} emissiveIntensity={1} />
    </mesh>
  )
}

/** Turns its children around y (speed in turns per minute); `swing` makes it sweep back and forth instead */
export function Spin({
  children,
  position,
  rpm = 6,
  swing,
  phase = 0,
}: {
  children: ReactNode
  position?: [number, number, number]
  rpm?: number
  /** Sweep amplitude in radians: back and forth instead of a full turn */
  swing?: number
  phase?: number
}) {
  const ref = useRef<Group>(null)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useFrame(({ clock }) => {
    if (!ref.current || reduced) return
    const w = (rpm / 60) * Math.PI * 2
    ref.current.rotation.y = swing ? Math.sin(clock.elapsedTime * w + phase) * swing : clock.elapsedTime * w + phase
  })
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  )
}

/** A flag on a pole, waving */
export function Flag({ position, color = '#f28c28' }: { position: [number, number, number]; color?: string }) {
  const ref = useRef<Group>(null)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useFrame(({ clock }) => {
    if (!ref.current || reduced) return
    const t = clock.elapsedTime
    ref.current.rotation.y = Math.sin(t * 2.1) * 0.25
    ref.current.scale.x = 1 + Math.sin(t * 3.3) * 0.06
  })
  return (
    <group position={position}>
      <mesh position={[0, 0.75, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 1.5, 6]} />
        <meshStandardMaterial color="#9aa1ab" />
      </mesh>
      <group ref={ref} position={[0, 1.32, 0]}>
        <mesh position={[0.26, 0, 0]}>
          <boxGeometry args={[0.5, 0.3, 0.015]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    </group>
  )
}
