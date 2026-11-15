import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Design } from '../../sim/types'
import { displayHeight } from '../../viz/orbit/orbitPlan'
import { CubeSat, Effects, Moon, Starfield, Sun, ease, prefersReducedMotion, useGraphics } from '../space'

/**
 * The Orbit step's view: the Moon, its south-pole ice lit by the core's forecast, and the polar
 * orbit at the dragged height, with the craft going round it. The low point is over the south pole
 * (-Y), the far point over the north. Heights are compressed (see displayHeight) so both a 10 km
 * skim and a 5,000 km circle fit; the craft speeds up low down and slows far out (Kepler).
 */

interface Props {
  design: Design
  /** Low point over the south pole, km */
  km: number
  /** Far point, km */
  farKm: number
  /** Ice mapped after 12 months, 0..1, lights the south pole */
  ice: number
  /** The orbit reaches the ice instruments' height */
  iceOk: boolean
  /** Pixels on the right taken by the slider and the dashboard */
  rightPx: number
}

/** Orbit in display units: Moon radius 1, ellipse in the Y–X plane with the Moon at one focus */
function shape(km: number, farKm: number) {
  const rp = 1 + displayHeight(km)
  const ra = 1 + displayHeight(farKm)
  const a = (rp + ra) / 2
  const b = Math.sqrt(rp * ra)
  const c = (ra - rp) / 2
  return { rp, ra, a, b, c, e: (ra - rp) / (ra + rp) }
}

/** Point at eccentric anomaly E (E = 0 is the low point over the south pole) */
function pointAt(s: ReturnType<typeof shape>, E: number, out: THREE.Vector3) {
  return out.set(s.b * Math.sin(E), s.c - s.a * Math.cos(E), 0)
}

function Craft({ design, km, farKm }: { design: Design; km: number; farKm: number }) {
  const ref = useRef<THREE.Group>(null)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const st = useRef({ M: 0.4 })
  const v = useMemo(() => ({ p: new THREE.Vector3(), q: new THREE.Vector3(), m: new THREE.Matrix4(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() }), [])
  const live = useRef({ burn: 0, deploy: 1 })
  useFrame((_, delta) => {
    const g = ref.current
    if (!g) return
    const s = shape(km, farKm)
    // One revolution in 5–14 s on screen, longer for bigger orbits
    if (!reduced) st.current.M += (Math.min(0.1, delta) * Math.PI * 2) / (5 + 9 * Math.min(1, s.a / 2.6))
    let E = st.current.M
    for (let i = 0; i < 6; i++) E -= (E - s.e * Math.sin(E) - st.current.M) / (1 - s.e * Math.cos(E))
    pointAt(s, E, v.p)
    pointAt(s, E + 0.01, v.q)
    g.position.copy(v.p)
    // Instruments (+Z) toward the Moon, nose along the track
    v.z.copy(v.p).normalize().multiplyScalar(-1)
    v.y.subVectors(v.q, v.p).normalize()
    v.x.crossVectors(v.y, v.z).normalize()
    v.y.crossVectors(v.z, v.x).normalize()
    v.m.makeBasis(v.x, v.y, v.z)
    g.quaternion.setFromRotationMatrix(v.m)
  })
  return (
    <group ref={ref}>
      <CubeSat design={design} scale={0.09} live={live} />
    </group>
  )
}

/** Looking a little up from below the equator, so the south-pole ice is in sight */
const VIEW_DIR = new THREE.Vector3(0.22, -0.4, 0.89).normalize()
const FOV = 40

/** Frames the whole orbit inside the part of the view left of the slider and the dashboard */
function Framing({ km, farKm, rightPx }: { km: number; farKm: number; rightPx: number }) {
  const { camera, size } = useThree()
  const st = useRef({ d: 0, cy: 0 })
  useFrame((_, delta) => {
    const s = shape(km, farKm)
    // The orbit spans −rp..ra up and down and −b..b across; leave a margin all round
    const halfH = ((s.ra + s.rp) / 2) * 1.26 + 0.12
    const halfW = Math.max(1, s.b) * 1.14
    const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    const usable = Math.max(200, size.width - rightPx)
    const tanH = (tanV * usable) / Math.max(1, size.height)
    const want = Math.max(halfH / tanV, halfW / tanH)
    const k = st.current.d === 0 ? 1 : ease(Math.min(0.1, delta), 3)
    st.current.d += (want - st.current.d) * k
    st.current.cy += ((s.ra - s.rp) / 2 - st.current.cy) * k
    const d = st.current.d
    // Shift the picture left by half the room on the right, so it centres in the free part
    const shift = (rightPx / 2 / (size.height / 2)) * d * tanV
    const look = new THREE.Vector3(shift, st.current.cy, 0)
    camera.position.copy(look).addScaledVector(VIEW_DIR, d)
    camera.lookAt(look)
  })
  return null
}

export function OrbitPlannerScene({ design, km, farKm, ice, iceOk, rightPx }: Props) {
  const quality = useGraphics((s) => s.quality)
  const points = useMemo(() => {
    const s = shape(km, farKm)
    return Array.from({ length: 181 }, (_, i) => pointAt(s, (i / 180) * Math.PI * 2, new THREE.Vector3()))
  }, [km, farKm])
  const low = useMemo(() => pointAt(shape(km, farKm), 0, new THREE.Vector3()), [km, farKm])
  return (
    <Canvas className="h-full w-full" dpr={quality === 'high' ? [1, 2] : [1, 1.25]} camera={{ fov: FOV, near: 0.02, far: 900 }} gl={{ antialias: true }} aria-hidden>
      <color attach="background" args={['#000000']} />
      <Suspense fallback={null}>
        <Starfield brightness={0.7} />
        <Sun intensity={2.6} fill={0.06} />
        <Moon iceCoverage={ice} />
        <Line points={points} color={iceOk ? '#7dd3a8' : '#e8a33d'} lineWidth={1.6} transparent opacity={0.85} />
        {/* The low point over the pole */}
        <mesh position={low}>
          <sphereGeometry args={[0.025, 12, 8]} />
          <meshBasicMaterial color={iceOk ? '#7dd3a8' : '#e8a33d'} toneMapped={false} />
        </mesh>
        <Craft design={design} km={km} farKm={farKm} />
        <Framing km={km} farKm={farKm} rightPx={rightPx} />
        <Effects preset="space" />
      </Suspense>
    </Canvas>
  )
}
