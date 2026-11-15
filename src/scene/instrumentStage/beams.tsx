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
  calm: boolean // reduce motion: no pulsing or flashing
}

const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } as const

/** Aperture and landing point this frame, following the altitude smoothly. */
function useAim(pass: Pass, h: number, x: number, shaky: boolean, calm: boolean) {
  const origin = useMemo(() => new THREE.Vector3(), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  const cur = useRef(h)
  return (t: number) => {
    cur.current += (h - cur.current) * 0.07
    const hh = cur.current
    origin.set(x * SAT_SCALE, hh - 0.66 * SAT_SCALE, -0.3 * SAT_SCALE)
    const tj = calm ? 0.7 : t // calm: the aim error stays, frozen in place
    const jx = shaky ? Math.sin(tj * 7.3) * 0.7 + Math.sin(tj * 19) * 0.3 : 0
    const jz = shaky ? Math.cos(tj * 5.9) * 0.7 + Math.sin(tj * 23) * 0.3 : 0
    const tx = x * 0.5 + jx
    const tz = targetZ(hh) + jz
    const g = groundAt(pass, tx, tz)
    target.set(tx, g.y + 0.14, tz)
    return { origin, target, shadow: g.shadow }
  }
}

/** Laser: four thin beams, a spot, and an ice-cyan glow that lights a dark crater floor. */
function Laser({ pass, h, x, view, glow, calm }: BeamProps) {
  const aim = useAim(pass, h, x, view.shaky, calm)
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
    const pulse = calm ? 1 : 0.85 + 0.15 * Math.sin(t * 6)
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
      setOpacity(m, on * shadow * (calm ? 0.6 : Math.max(0, Math.sin(t * (3 + i) + i * 2))))
    })
  })
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} ref={(m) => { beams.current[i] = m }}>
          <cylinderGeometry args={[1, 1, 1, 6, 1, true]} />
          <meshBasicMaterial color="#5ee6f0" opacity={0} {...additive} />
        </mesh>
      ))}
      <mesh ref={spot} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 40]} />
        <meshBasicMaterial color="#b5f4f8" map={glow} opacity={0} {...additive} />
      </mesh>
      <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 4.5, 40]} />
        <meshBasicMaterial color={view.color} map={glow} opacity={0} {...additive} />
      </mesh>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <mesh key={i} ref={(m) => { sparks.current[i] = m }} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.13, 10]} />
          <meshBasicMaterial color="#e0fbff" opacity={0} {...additive} />
        </mesh>
      ))}
    </>
  )
}

/** IR spectrometer: an amber cone and footprint that need sunlight. */
function InfraRed({ pass, h, x, view, calm }: BeamProps) {
  const aim = useAim(pass, h, x, view.shaky, calm)
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
        <meshBasicMaterial color="#e8a33d" opacity={0.5} {...additive} />
      </mesh>
    </>
  )
}

/** Neutron spectrometer: rings rising from the ground to the satellite, in light and dark. */
function Neutron({ pass, h, x, view, glow, calm }: BeamProps) {
  const aim = useAim(pass, h, x, view.shaky, calm)
  const rings = useRef<(THREE.Mesh | null)[]>([])
  const pad = useRef<THREE.Mesh>(null)
  const radius = view.footprint * FOOTPRINT_SCALE
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const { origin, target } = aim(t)
    const on = powered(t, view.poweredShare) * view.strength
    rings.current.forEach((m, i) => {
      if (!m) return
      const k = calm ? i / 5 : (t * 0.3 + i / 5) % 1
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
          <meshBasicMaterial color="#a9e4e8" opacity={0} side={THREE.DoubleSide} {...additive} />
        </mesh>
      ))}
      <mesh ref={pad} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 2.2, 32]} />
        <meshBasicMaterial color={view.color} map={glow} opacity={0} {...additive} />
      </mesh>
    </>
  )
}

/**
 * Camera: a bright view pyramid down to a framed patch of ground. On each
 * shutter the patch flashes and a snapshot lifts back up to the satellite.
 * It needs sunlight, and the snapshot is a picture, not ice.
 */
const SHUTTER = 1.5 // seconds between pictures
const LIFT = 0.8 // seconds for a snapshot to reach the satellite

function Camera({ pass, h, x, view, calm }: BeamProps) {
  const aim = useAim(pass, h, x, view.shaky, calm)
  const frame = useRef<THREE.LineLoop>(null)
  const flash = useRef<THREE.Mesh>(null)
  const pyramid = useRef<THREE.Mesh>(null)
  const edges = useRef<THREE.LineSegments>(null)
  const snap = useRef<THREE.Mesh>(null)
  const half = view.footprint * FOOTPRINT_SCALE
  const corners = useMemo(
    () => [
      new THREE.Vector3(-half, 0, -half * 0.7),
      new THREE.Vector3(half, 0, -half * 0.7),
      new THREE.Vector3(half, 0, half * 0.7),
      new THREE.Vector3(-half, 0, half * 0.7),
    ],
    [half]
  )
  const loop = useMemo(
    () =>
      new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(corners),
        new THREE.LineBasicMaterial({ color: '#ede6d6', transparent: true })
      ),
    [corners]
  )
  const edgeLines = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 8 }, () => new THREE.Vector3()))
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#b9b2a3', transparent: true }))
  }, [])
  // A four-sided cone, turned so its square base lines up with the frame.
  const pyramidGeo = useMemo(() => new THREE.ConeGeometry(1, 1, 4, 1, true).rotateY(Math.PI / 4), [])
  const corner = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const { origin, target, shadow } = aim(t)
    const lit = (1 - shadow) * powered(t, view.poweredShare) * view.strength
    if (frame.current) {
      frame.current.position.copy(target)
      setOpacity(frame.current, 0.3 + 0.7 * lit)
    }
    if (pyramid.current) {
      placeBetween(pyramid.current, target, origin, half * Math.SQRT2 * 0.85)
      setOpacity(pyramid.current, 0.03 + 0.12 * lit)
    }
    if (edges.current) {
      const pos = edges.current.geometry.attributes.position as THREE.BufferAttribute
      corners.forEach((c, i) => {
        corner.copy(c).add(target)
        pos.setXYZ(i * 2, origin.x, origin.y, origin.z)
        pos.setXYZ(i * 2 + 1, corner.x, corner.y, corner.z)
      })
      pos.needsUpdate = true
      setOpacity(edges.current, 0.15 + 0.6 * lit)
    }
    const phase = calm ? 0.35 : t % SHUTTER
    if (flash.current) {
      flash.current.position.copy(target)
      setOpacity(flash.current, calm ? 0 : lit * Math.max(0, 1 - phase / 0.22) * 0.7)
    }
    if (snap.current) {
      const k = Math.min(1, phase / LIFT)
      snap.current.position.lerpVectors(target, origin, k)
      snap.current.scale.setScalar(1 - 0.85 * k)
      setOpacity(snap.current, lit * (phase < LIFT ? 0.9 * (1 - k * k) : 0))
    }
  })
  return (
    <>
      <primitive object={loop} ref={frame} />
      <primitive object={edgeLines} ref={edges} />
      <mesh ref={pyramid} geometry={pyramidGeo}>
        <meshBasicMaterial color={view.color} opacity={0.1} side={THREE.DoubleSide} {...additive} />
      </mesh>
      <mesh ref={flash} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[half * 2, half * 1.4]} />
        <meshBasicMaterial color="#f3ead6" opacity={0} {...additive} />
      </mesh>
      <mesh ref={snap} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[half * 2, half * 1.4]} />
        <meshBasicMaterial color="#ede6d6" opacity={0} side={THREE.DoubleSide} {...additive} />
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
