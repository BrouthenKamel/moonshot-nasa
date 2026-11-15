import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CubeSat, craftParts } from '../../scene/space/CubeSat'
import { useGameStore } from '../../state/gameStore'
import type { AstronautHandle } from './Astronaut'
import { CartGauges } from './CartGauges'

export interface CartFollowerProps {
  /** The astronaut to trail (the ref passed to <Astronaut>) */
  leader: RefObject<AstronautHandle | null>
  /** Tether length behind the leader, world units */
  distance?: number
  /** Overall size multiplier of the cart + CubeSat */
  scale?: number
}

/** CubeSat model is 0.366 m long; this makes it about 0.55 units on the cart */
const SAT_SCALE = 1.5

/**
 * A little cart carrying the player's CURRENT CubeSat. It trails the astronaut on a tether
 * with spring lag and the craft shows exactly the parts of the live design.
 */
export function CartFollower({ leader, distance = 1.15, scale = 1 }: CartFollowerProps) {
  const design = useGameStore((s) => s.design)
  const root = useRef<THREE.Group>(null)
  const sat = useRef<THREE.Group>(null)
  const wheels = useRef<THREE.Group>(null)
  const pos = useRef<THREE.Vector3 | null>(null)
  const vel = useRef(new THREE.Vector3())
  const heading = useRef(0)
  const partsKey = craftParts(design).join('|')
  const pop = useRef(0)

  // A visible bounce whenever the craft's part list changes (skipped on first mount)
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) pop.current = 1
    mounted.current = true
  }, [partsKey])

  const wheelGeo = useMemo(() => new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16).rotateZ(Math.PI / 2), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const l = leader.current
    const g = root.current
    if (!l || !g) return
    const lp = l.getPosition()
    if (!pos.current) {
      const h = l.getHeading()
      pos.current = new THREE.Vector3(lp.x - Math.sin(h) * distance, 0, lp.z - Math.cos(h) * distance)
      heading.current = h
    }
    const p = pos.current
    // Tether: the point at `distance` from the leader along the leader-to-cart line
    const dx = p.x - lp.x
    const dz = p.z - lp.z
    const len = Math.hypot(dx, dz) || 1
    const tx = lp.x + (dx / len) * distance
    const tz = lp.z + (dz / len) * distance
    // Damped spring toward the tether point
    const k = 55
    const c = 2 * Math.sqrt(k) * 0.85
    vel.current.x += ((tx - p.x) * k - vel.current.x * c) * dt
    vel.current.z += ((tz - p.z) * k - vel.current.z * c) * dt
    p.x += vel.current.x * dt
    p.z += vel.current.z * dt
    const speed = Math.hypot(vel.current.x, vel.current.z)
    if (speed > 0.05) {
      const want = Math.atan2(vel.current.x, vel.current.z)
      let d = (want - heading.current) % (Math.PI * 2)
      if (d > Math.PI) d -= Math.PI * 2
      if (d < -Math.PI) d += Math.PI * 2
      heading.current += d * Math.min(1, dt * 6)
    }
    g.position.set(p.x, 0, p.z)
    g.rotation.y = heading.current
    if (wheels.current) wheels.current.children.forEach((w) => (w.rotation.x += speed * dt * 10))
    if (sat.current) {
      pop.current = Math.max(0, pop.current - dt * 2.2)
      const bounce = Math.sin(pop.current * Math.PI)
      sat.current.position.y = 0.3 + bounce * 0.18
      sat.current.scale.setScalar(1 + bounce * 0.12)
    }
  })

  return (
    <group ref={root} scale={scale}>
      {/* Deck */}
      <mesh position={[0, 0.16, 0]} castShadow>
        <boxGeometry args={[0.46, 0.05, 0.78]} />
        <meshStandardMaterial color="#3a4254" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Cradle rails */}
      {[-0.17, 0.17].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]}>
          <boxGeometry args={[0.03, 0.08, 0.6]} />
          <meshStandardMaterial color="#e8a33d" roughness={0.6} />
        </mesh>
      ))}
      {/* Draw bar toward the astronaut (the cart travels toward +Z, so the leader is at -Z) */}
      <mesh position={[0, 0.18, -0.55]}>
        <boxGeometry args={[0.04, 0.03, 0.36]} />
        <meshStandardMaterial color="#b9b2a3" metalness={0.5} roughness={0.4} />
      </mesh>
      <group ref={wheels}>
        {[
          [-0.26, 0.09, 0.26],
          [0.26, 0.09, 0.26],
          [-0.26, 0.09, -0.26],
          [0.26, 0.09, -0.26],
        ].map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]} geometry={wheelGeo} castShadow>
            <meshStandardMaterial color="#1a1f2b" roughness={0.8} />
          </mesh>
        ))}
      </group>
      <CartGauges />
      <group ref={sat} position={[0, 0.3, 0]}>
        <CubeSat design={design} scale={SAT_SCALE} />
      </group>
    </group>
  )
}
