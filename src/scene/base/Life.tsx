import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, TiltShift2, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { prefersReducedMotion, useGraphics } from '../space/quality'

/**
 * Small signs of life on the agency island: drifting clouds and their shadows, smoke from
 * the Factory chimney, a delivery truck on the main street. Decoration only: none of it
 * carries game information. Still under reduced motion.
 */

function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CLOUD_SPAN = 30

export function Clouds() {
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const clouds = useMemo(() => {
    const r = rng(11)
    return Array.from({ length: 4 }, (_, i) => ({
      x: -CLOUD_SPAN / 2 + i * (CLOUD_SPAN / 4) + r() * 3,
      z: -8 + r() * 14,
      y: 6.5 + r() * 1.5,
      speed: 0.25 + r() * 0.2,
      puffs: Array.from({ length: 4 + Math.floor(r() * 3) }, () => ({
        p: [(r() - 0.5) * 2.4, (r() - 0.5) * 0.4, (r() - 0.5) * 1.2] as [number, number, number],
        s: 0.6 + r() * 0.6,
      })),
    }))
  }, [])
  const refs = useRef<(THREE.Group | null)[]>([])
  useFrame((state) => {
    if (reduced) return
    const t = state.clock.elapsedTime
    clouds.forEach((c, i) => {
      const g = refs.current[i]
      if (!g) return
      const x = ((c.x + t * c.speed + CLOUD_SPAN / 2) % CLOUD_SPAN) - CLOUD_SPAN / 2
      g.position.set(x, c.y, c.z)
    })
  })
  return (
    <group>
      {clouds.map((c, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g }} position={[c.x, c.y, c.z]}>
          {c.puffs.map((p, j) => (
            <mesh key={j} position={p.p} scale={p.s} castShadow>
              <icosahedronGeometry args={[0.7, 1]} />
              <meshStandardMaterial color="#f6ead6" roughness={1} flatShading transparent opacity={0.9} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

/** Smoke rising from a chimney top at `position` (world units) */
export function ChimneySmoke({ position }: { position: [number, number, number] }) {
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const puffs = useRef<(THREE.Mesh | null)[]>([])
  const N = 7
  useFrame((state) => {
    const t = state.clock.elapsedTime
    puffs.current.forEach((m, i) => {
      if (!m) return
      const age = reduced ? i / N : ((t * 0.35 + i / N) % 1)
      m.position.set(age * 0.6, age * 2.2, -age * 0.3)
      m.scale.setScalar(0.15 + age * 0.45)
      const mat = m.material as THREE.MeshStandardMaterial
      mat.opacity = 0.7 * (1 - age)
    })
  })
  return (
    <group position={position}>
      {Array.from({ length: N }, (_, i) => (
        <mesh key={i} ref={(m) => { puffs.current[i] = m }}>
          <icosahedronGeometry args={[0.5, 1]} />
          <meshStandardMaterial color="#d9d1c2" roughness={1} flatShading transparent depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

/** A delivery truck driving the main street (along x at `z`), back and forth */
export function Truck({ z, from, to }: { z: number; from: number; to: number }) {
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const ref = useRef<THREE.Group>(null)
  useFrame((state) => {
    const g = ref.current
    if (!g) return
    const period = 26
    const t = reduced ? 0.25 : (state.clock.elapsedTime % period) / period
    const going = t < 0.5
    const k = going ? t * 2 : (1 - t) * 2
    const e = k * k * (3 - 2 * k)
    g.position.set(from + (to - from) * e, 0.12, z + (going ? -0.18 : 0.18))
    g.rotation.y = going ? 0 : Math.PI
  })
  return (
    <group ref={ref}>
      <mesh position={[0.15, 0.22, 0]} castShadow>
        <boxGeometry args={[0.6, 0.36, 0.3]} />
        <meshStandardMaterial color="#ece5d6" />
      </mesh>
      <mesh position={[-0.27, 0.17, 0]} castShadow>
        <boxGeometry args={[0.24, 0.26, 0.28]} />
        <meshStandardMaterial color="#e8a33d" />
      </mesh>
      <mesh position={[-0.33, 0.22, 0]}>
        <boxGeometry args={[0.13, 0.1, 0.285]} />
        <meshStandardMaterial color="#7fa3bd" />
      </mesh>
      {[-0.25, 0.25].map((x) =>
        [-0.15, 0.15].map((zz) => (
          <mesh key={`${x}${zz}`} position={[x, 0.05, zz]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.04, 10]} />
            <meshStandardMaterial color="#22252d" />
          </mesh>
        )),
      )}
    </group>
  )
}

/** The composer's ACES pass replaces the renderer's own tone mapping while it runs (as in space/Effects.tsx) */
function RendererToneMappingOff() {
  const gl = useThree((s) => s.gl)
  useLayoutEffect(() => {
    const prev = gl.toneMapping
    gl.toneMapping = THREE.NoToneMapping
    return () => {
      gl.toneMapping = prev
    }
  }, [gl])
  return null
}

/**
 * Miniature-diorama look for the island, 'high' quality only: a horizontal focus band through
 * the middle of the frame with a gentle blur toward the top and bottom edges, soft dark corners,
 * filmic colour. At 'low' nothing is drawn and the renderer tone maps on its own.
 */
export function BaseEffects() {
  const quality = useGraphics((s) => s.quality)
  if (quality !== 'high') return null
  return (
    <>
      <RendererToneMappingOff />
      <EffectComposer multisampling={4}>
        <TiltShift2 blur={0.1} taper={0.3} start={[0, 0.52]} end={[1, 0.52]} samples={12} />
        <Vignette offset={0.32} darkness={0.4} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  )
}
