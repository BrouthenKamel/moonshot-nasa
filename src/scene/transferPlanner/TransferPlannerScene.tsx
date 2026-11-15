import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import {
  EARTH,
  EARTH_RADIUS,
  MOON_DISTANCE,
  moonAngle,
  moonPosition,
  planTransfer,
  transferPosition,
} from '../../viz/flight/skyMotion'
import { Earth, Effects, Moon, Starfield, Sun, ease, prefersReducedMotion, useGraphics } from '../space'

/**
 * The transfer view: Earth, the Moon on its orbit and the path between them for the dragged
 * flight time (src/viz/flight/skyMotion.ts). It plays as a loop: the Moon moves along its orbit
 * while the craft flies the path, and they meet on the arrival day. A quick path is a short arc;
 * a long one loops out beyond the Moon's orbit and falls back to meet it. The bodies are drawn a
 * little larger than the distances so both stay visible.
 */

const EARTH_POS = new THREE.Vector3(EARTH.x, EARTH.y, EARTH.z)
const EARTH_SHOWN = EARTH_RADIUS * 1.35
const MOON_SHOWN = 2.1
/** Seconds one loop of the trip takes on screen */
const LOOP_SECONDS = 7
const FOV = 40
/** Looking down on the Earth–Moon plane from about 45 degrees */
const VIEW_DIR = new THREE.Vector3(0, 0.72, 0.7).normalize()

const v3 = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z)

function Trip({ days }: { days: number }) {
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const plan = useMemo(() => planTransfer(0, days), [days])
  const craft = useRef<THREE.Mesh>(null)
  const moon = useRef<THREE.Group>(null)
  const earthAngle = useRef(0)
  const st = useRef({ t: 0 })
  useFrame((_, delta) => {
    const dt = Math.min(0.1, delta)
    // Play the trip, rest a moment at the Moon, and start again
    if (!reduced) st.current.t = (st.current.t + dt / LOOP_SECONDS) % 1.15
    const s = reduced ? 1 : Math.min(1, st.current.t)
    const day = s * days
    const m = moonPosition(day)
    moon.current?.position.set(m.x, m.y, m.z)
    if (moon.current) moon.current.rotation.y = -moonAngle(day)
    const p = transferPosition(plan, s)
    craft.current?.position.set(p.x, p.y, p.z)
    earthAngle.current += Math.min(dt * 0.5, (days / LOOP_SECONDS) * dt) * Math.PI * 2 * 0.2
  })
  const path = useMemo(() => Array.from({ length: 241 }, (_, i) => v3(transferPosition(plan, i / 240))), [plan])
  return (
    <>
      <group position={EARTH_POS}>
        <Earth radius={EARTH_SHOWN} angle={earthAngle} />
      </group>
      <group ref={moon}>
        <Moon radius={MOON_SHOWN} segments={64} />
      </group>
      <Line points={path} color="#e8a33d" lineWidth={1.8} transparent opacity={0.95} />
      <mesh ref={craft}>
        <sphereGeometry args={[0.55, 16, 12]} />
        <meshBasicMaterial color={new THREE.Color('#ffd28a').multiplyScalar(1.6)} toneMapped={false} />
      </mesh>
    </>
  )
}

/** Frames Earth, the Moon's orbit and the whole path between the slider (left) and the dashboard (right) */
function Framing({ days, leftPx, rightPx }: { days: number; leftPx: number; rightPx: number }) {
  const { camera, size } = useThree()
  const st = useRef({ d: 0 })
  const reach = useMemo(() => {
    const plan = planTransfer(0, days)
    let r = MOON_DISTANCE + MOON_SHOWN
    for (let i = 0; i <= 60; i++) {
      const p = transferPosition(plan, i / 60)
      r = Math.max(r, Math.hypot(p.x - EARTH.x, p.z - EARTH.z))
    }
    return r
  }, [days])
  useFrame((_, delta) => {
    // Fit the circle of everything (Earth to the furthest point of the path) into the part of the
    // view left of the dashboard
    const usable = Math.max(240, size.width - leftPx - rightPx)
    const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    const tanH = (tanV * usable) / Math.max(1, size.height)
    const want = (reach * 1.12) / Math.min(tanV * 0.92, tanH)
    st.current.d = st.current.d === 0 ? want : st.current.d + (want - st.current.d) * ease(Math.min(0.1, delta), 2.5)
    const d = st.current.d
    // Shift the picture so it centres between the slider and the dashboard
    const shift = ((rightPx - leftPx) / 2 / (size.height / 2)) * d * tanV
    const look = EARTH_POS.clone().add(new THREE.Vector3(shift, 0, 0))
    camera.position.copy(look).addScaledVector(VIEW_DIR, d)
    camera.lookAt(look)
  })
  return null
}

export function TransferPlannerScene({ days, leftPx = 0, rightPx = 0 }: { days: number; leftPx?: number; rightPx?: number }) {
  const quality = useGraphics((s) => s.quality)
  const lunarOrbit = useMemo(
    () =>
      Array.from(
        { length: 181 },
        (_, i) => new THREE.Vector3(EARTH.x + MOON_DISTANCE * Math.cos((i / 180) * Math.PI * 2), 0, EARTH.z + MOON_DISTANCE * Math.sin((i / 180) * Math.PI * 2)),
      ),
    [],
  )
  return (
    <Canvas className="h-full w-full" dpr={quality === 'high' ? [1, 2] : [1, 1.25]} camera={{ fov: FOV, near: 0.1, far: 2000 }} gl={{ antialias: true }} aria-hidden>
      <color attach="background" args={['#000000']} />
      <Suspense fallback={null}>
        <Starfield brightness={0.7} />
        <Sun intensity={2.6} fill={0.06} />
        <Line points={lunarOrbit} color="#ede6d6" lineWidth={0.8} dashed dashSize={1.4} gapSize={1.4} transparent opacity={0.22} />
        <Trip days={days} />
        <Framing days={days} leftPx={leftPx} rightPx={rightPx} />
        <Effects preset="space" />
      </Suspense>
    </Canvas>
  )
}
