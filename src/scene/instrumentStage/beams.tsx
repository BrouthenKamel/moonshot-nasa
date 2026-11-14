import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { InstrumentView } from './stageModel'
import { FOOTPRINT_SCALE, SAT_SCALE, groundAt, placeBetween, powered, setOpacity, targetZ, type Pass } from './frame'

export interface BeamProps {
  pass: Pass
  h: number // satellite height in scene units
  x: number // aperture offset under the bus
  view: InstrumentView
  glow: THREE.Texture
}

const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } as const

/** Aperture and landing point this frame, following the altitude smoothly. */
function useAim(pass: Pass, h: number, x: number, shaky: boolean) {
  const origin = useMemo(() => new THREE.Vector3(), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  const cur = useRef(h)
  return (t: number) => {
    cur.current += (h - cur.current) * 0.07
    const hh = cur.current
    origin.set(x * SAT_SCALE, hh - 0.66 * SAT_SCALE, -0.3 * SAT_SCALE)
    const jx = shaky ? Math.sin(t * 7.3) * 0.7 + Math.sin(t * 19) * 0.3 : 0
    const jz = shaky ? Math.cos(t * 5.9) * 0.7 + Math.sin(t * 23) * 0.3 : 0
    const tx = x * 0.5 + jx
    const tz = targetZ(hh) + jz
    const g = groundAt(pass, tx, tz)
    target.set(tx, g.y + 0.14, tz)
    return { origin, target, shadow: g.shadow }
  }
}

/** Laser: four thin beams, a spot, and a green glow that lights a dark crater floor. */
function Laser({ pass, h, x, view, glow }: BeamProps) {
  const aim = useAim(pass, h, x, view.shaky)
  const beams = useRef<(THREE.Mesh | null)[]>([])
  const spot = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Mesh>(null)
  const sparks = useRef<(THREE.Mesh | null)[]>([])
  const from = useMemo(() => new THREE.Vector3(), [])
  const radius = view.footprint * FOOTPRINT_SCALE
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const { origin, target, shadow } = aim(t)
    const on = powered(t, view.poweredShare) * view.strength
    beams.current.forEach((m, i) => {
      if (!m) return
      from.copy(origin)
      if (i < 4) from.x += (i - 1.5) * 0.05
      placeBetween(m, from, target, i === 4 ? 0.11 : 0.03)
      setOpacity(m, on * (0.25 + 0.7 * view.strength) * (i === 4 ? 0.22 : 1))
    })
    const pulse = 0.85 + 0.15 * Math.sin(t * 6)
    if (spot.current) {
      spot.current.position.copy(target)
      setOpacity(spot.current, on * pulse * (0.45 + 0.55 * shadow))
    }
    if (halo.current) {
      halo.current.position.copy(target)
      halo.current.position.y += 0.03
      setOpacity(halo.current, on * pulse * (0.12 + 0.75 * shadow))
    }
    sparks.current.forEach((m, i) => {
      if (!m) return
      const a = i * 1.7 + 0.4
      const r = radius * (0.25 + (0.55 * ((i * 37) % 10)) / 10)
      m.position.set(target.x + Math.cos(a) * r, target.y + 0.05, target.z + Math.sin(a) * r)
      setOpacity(m, on * shadow * Math.max(0, Math.sin(t * (3 + i) + i * 2)))
    })
  })
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} ref={(m) => { beams.current[i] = m }}>
          <cylinderGeometry args={[1, 1, 1, 6, 1, true]} />
          <meshBasicMaterial color="#86efac" opacity={0} {...additive} />
        </mesh>
      ))}
      <mesh ref={spot} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 40]} />
        <meshBasicMaterial color="#bbf7d0" map={glow} opacity={0} {...additive} />
      </mesh>
      <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 4.5, 40]} />
        <meshBasicMaterial color={view.color} map={glow} opacity={0} {...additive} />
      </mesh>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <mesh key={i} ref={(m) => { sparks.current[i] = m }} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.13, 10]} />
          <meshBasicMaterial color="#e0f2fe" opacity={0} {...additive} />
        </mesh>
      ))}
    </>
  )
}

/** IR spectrometer: an amber cone and footprint that need sunlight. */
function InfraRed({ pass, h, x, view }: BeamProps) {
  const aim = useAim(pass, h, x, view.shaky)
  const cone = useRef<THREE.Mesh>(null)
  const disc = useRef<THREE.Mesh>(null)
  const radius = view.footprint * FOOTPRINT_SCALE
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const { origin, target, shadow } = aim(t)
    const lit = (1 - shadow) * powered(t, view.poweredShare) * view.strength
    if (cone.current) {
      placeBetween(cone.current, target, origin, radius)
      setOpacity(cone.current, 0.035 + 0.2 * lit)
    }
    if (disc.current) {
      disc.current.position.copy(target)
      setOpacity(disc.current, 0.05 + 0.55 * lit)
    }
  })
  return (
    <>
      <mesh ref={cone}>
        <coneGeometry args={[1, 1, 40, 1, true]} />
        <meshBasicMaterial color={view.color} opacity={0.2} side={THREE.DoubleSide} {...additive} />
      </mesh>
      <mesh ref={disc} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 40]} />
        <meshBasicMaterial color="#fbbf24" opacity={0.5} {...additive} />
      </mesh>
    </>
  )
}

/** Neutron spectrometer: rings rising from the ground to the satellite, in light and dark. */
function Neutron({ pass, h, x, view, glow }: BeamProps) {
  const aim = useAim(pass, h, x, view.shaky)
  const rings = useRef<(THREE.Mesh | null)[]>([])
  const pad = useRef<THREE.Mesh>(null)
  const radius = view.footprint * FOOTPRINT_SCALE
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const { origin, target } = aim(t)
    const on = powered(t, view.poweredShare) * view.strength
    rings.current.forEach((m, i) => {
      if (!m) return
      const k = (t * 0.3 + i / 5) % 1
      m.position.lerpVectors(target, origin, k)
      m.scale.setScalar(radius * (1.6 - 0.9 * k))
      setOpacity(m, on * (1 - k) * 0.85)
    })
    if (pad.current) {
      pad.current.position.copy(target)
      setOpacity(pad.current, 0.15 + 0.6 * on)
    }
  })
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} ref={(m) => { rings.current[i] = m }} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.82, 1, 40]} />
          <meshBasicMaterial color="#d8b4fe" opacity={0} side={THREE.DoubleSide} {...additive} />
        </mesh>
      ))}
      <mesh ref={pad} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 2.2, 32]} />
        <meshBasicMaterial color={view.color} map={glow} opacity={0} {...additive} />
      </mesh>
    </>
  )
}

/** Camera: a frame on the ground and a shutter flash; it needs sunlight. */
function Camera({ pass, h, x, view }: BeamProps) {
  const aim = useAim(pass, h, x, view.shaky)
  const frame = useRef<THREE.LineLoop>(null)
  const flash = useRef<THREE.Mesh>(null)
  const sight = useRef<THREE.Mesh>(null)
  const half = view.footprint * FOOTPRINT_SCALE
  const loop = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, 0, -half * 0.7),
      new THREE.Vector3(half, 0, -half * 0.7),
      new THREE.Vector3(half, 0, half * 0.7),
      new THREE.Vector3(-half, 0, half * 0.7),
    ])
    return new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: view.color, transparent: true }))
  }, [half, view.color])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const { origin, target, shadow } = aim(t)
    const lit = (1 - shadow) * powered(t, view.poweredShare) * view.strength
    if (frame.current) {
      frame.current.position.copy(target)
      setOpacity(frame.current, 0.25 + 0.75 * lit)
    }
    if (flash.current) {
      flash.current.position.copy(target)
      setOpacity(flash.current, lit * Math.max(0, 1 - (t % 1.5) / 0.22) * 0.6)
    }
    if (sight.current) {
      placeBetween(sight.current, origin, target, 0.012)
      setOpacity(sight.current, 0.12 + 0.3 * lit)
    }
  })
  return (
    <>
      <primitive object={loop} ref={frame} />
      <mesh ref={flash} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[half * 2, half * 1.4]} />
        <meshBasicMaterial color="#dbeafe" opacity={0} {...additive} />
      </mesh>
      <mesh ref={sight}>
        <cylinderGeometry args={[1, 1, 1, 6, 1, true]} />
        <meshBasicMaterial color={view.color} opacity={0.3} {...additive} />
      </mesh>
    </>
  )
}

/** The effect for one instrument; nothing when it is out of range. */
export function Beam(props: BeamProps) {
  if (props.view.outOfRange) return null
  switch (props.view.id) {
    case 'inst-laser':
      return <Laser {...props} />
    case 'inst-ir-spec':
      return <InfraRed {...props} />
    case 'inst-neutron':
      return <Neutron {...props} />
    default:
      return <Camera {...props} />
  }
}
