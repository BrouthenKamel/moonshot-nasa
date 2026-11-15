/**
 * Payoff 2, Moon landing: a robotic lander comes down on its engine over the south pole,
 * low sun, long shadows. Near the ground the plume blasts a flat radial sheet of dust.
 * success: engine cut, legs compress, a beacon blinks · partial: it lands on a slope and
 * tips onto its side (IM-1, 2024; IM-2, 2025) · failed: too fast, flash, debris, dust cloud.
 */
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Starfield } from '../../scene/space/Sky'
import { Burst, Glow, LowSun, LunarGround, Plume, Safe, SafeModel, siteHeight, useShowTime } from './payoffParts'
import { LANDING, easeInCubic, ring, seg } from './payoffTimeline'
import type { Outcome } from './types'

const START_Y = 38
const SLOPE = 0.2
/** Half the leg span of the lander: the foot it tips over on */
const FOOT = 2.6
const LANDER_H = 6.4
const NOZZLE_Y = 1.15

/** Lander altitude (base of the legs) at time t */
function altitude(t: number, outcome: Outcome): number {
  if (outcome === 'failed') {
    const k = Math.min(1, t / LANDING.impact)
    return START_Y * (1 - k) ** 1.15
  }
  const k = Math.min(1, t / LANDING.touchdown)
  return START_Y * (1 - k) ** 1.9
}

function engine(t: number, outcome: Outcome): number {
  const end = outcome === 'failed' ? LANDING.impact : LANDING.touchdown
  if (t > end) return Math.max(0, 1 - (t - end) / 0.12) * (outcome === 'failed' ? 0 : 1)
  return 0.75 + 0.25 * seg(t, 0, 1.2)
}

export function LanderFallback() {
  return (
    <group>
      <mesh position-y={3.2} castShadow>
        <cylinderGeometry args={[1.6, 1.8, 2.2, 8]} />
        <meshStandardMaterial color="#d6a64a" metalness={0.65} roughness={0.35} />
      </mesh>
      <mesh position-y={4.9} castShadow>
        <boxGeometry args={[2, 1.4, 2]} />
        <meshStandardMaterial color="#c9c6be" metalness={0.3} roughness={0.5} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        return (
          <group key={i}>
            <mesh position={[Math.cos(a) * 2.1, 1.3, Math.sin(a) * 2.1]} rotation={[Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]} castShadow>
              <cylinderGeometry args={[0.07, 0.07, 3, 6]} />
              <meshStandardMaterial color="#8a8780" metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh position={[Math.cos(a) * FOOT, 0.05, Math.sin(a) * FOOT]}>
              <cylinderGeometry args={[0.35, 0.4, 0.1, 12]} />
              <meshStandardMaterial color="#8a8780" />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function Lander({ outcome }: { outcome: Outcome }) {
  const time = useShowTime()
  const pivot = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const pivotX = outcome === 'partial' ? -FOOT : 0
  const tilt0 = outcome === 'partial' ? Math.atan(SLOPE) : 0
  const groundAtPivot = outcome === 'partial' ? siteHeight(-FOOT, 0, SLOPE) : 0
  useFrame(() => {
    const t = time.current
    const p = pivot.current
    const b = body.current
    if (!p || !b) return
    const y = altitude(t, outcome)
    const drift = (1 - seg(t, 0, 6.5)) ** 2
    p.position.set(pivotX - 7 * drift, groundAtPivot + y, -3 * drift)
    // a gentle attitude hunt on the way down
    const hunt = Math.sin(t * 1.3) * 0.03 * (1 - seg(t, 5, 7.5))
    let rz = hunt + tilt0 * seg(t, LANDING.touchdown - 1.5, LANDING.touchdown)
    let squash = 1
    if (outcome !== 'failed') squash = 1 - 0.06 * Math.max(0, ring(t, LANDING.touchdown, 11, 4)) - 0.03 * seg(t, LANDING.touchdown, LANDING.touchdown + 0.15)
    if (outcome === 'partial' && t > LANDING.tipStart) {
      // the uphill legs lift, it rolls over the downhill foot and slams onto its side
      const k = easeInCubic(seg(t, LANDING.tipStart, LANDING.tipEnd))
      rz = tilt0 + (1.42 - tilt0) * k + 0.05 * ring(t, LANDING.tipEnd, 14, 6)
    }
    p.rotation.set(0, 0, rz)
    if (outcome === 'failed' && t > LANDING.impact) {
      // crumpled and half buried in its own crater
      p.rotation.set(0.35, 0.4, -0.55)
      p.position.y = -1.6
      squash = 0.55
    }
    b.scale.set(1, squash, 1)
    if (light.current) light.current.intensity = engine(t, outcome) * 260
  })
  const beacon = (t: number) => (outcome === 'failed' ? 0 : t > LANDING.touchdown + 0.6 ? (Math.sin(t * 5) > 0.55 ? 1.8 : 0.05) : 0)
  return (
    <group ref={pivot}>
      <group position-x={-pivotX}>
        <group ref={body}>
          <SafeModel id="model.env-lunar-lander" height={LANDER_H} fallback={<LanderFallback />} />
        </group>
        <Plume position={[0, NOZZLE_Y, 0]} length={7} radius={1.5} strength={(t) => engine(t, outcome)} />
        <pointLight ref={light} position={[0, NOZZLE_Y - 1.2, 0]} color="#ffb36b" distance={40} decay={1.6} intensity={0} />
        <Glow position={[0, LANDER_H + 0.25, 0]} size={1.3} color={outcome === 'partial' ? '#ffb23d' : '#6fffa0'} level={beacon} />
      </group>
    </group>
  )
}

function Dust({ outcome }: { outcome: Outcome }) {
  const end = outcome === 'failed' ? LANDING.impact : LANDING.touchdown
  const lift = (t: number) => seg(t, LANDING.dustStart, end) ** 1.4
  return (
    <>
      {/* the sheet: fine fast grains skimming flat outward, the key moment */}
      <Burst count={4500} origin={[0, 0.25, 0]} radius={2.5} from={LANDING.dustStart} to={end} weight={lift} speed={[24, 52]} life={[0.6, 1.3]} up={[0.004, 0.035]} tau={2} size={0.14} growth={1.2} color="#e9e0cf" opacity={0.75} soft={0.7} seed={3} maxPx={9} />
      {/* the body of the sheet: soft, low, wide */}
      <Burst count={3200} origin={[0, 0.4, 0]} radius={3} from={LANDING.dustStart + 0.3} to={end + 0.15} weight={lift} speed={[10, 24]} life={[1.2, 2.4]} up={[0.0, 0.05]} tau={1.4} size={0.9} growth={1.2} color="#bfb6a6" opacity={0.13} maxPx={70} seed={4} />
      {outcome !== 'failed' && (
        <Burst count={500} origin={[0, 0.3, 0]} radius={3.5} from={end} to={end + 0.5} speed={[1.5, 6]} life={[1.2, 2.4]} up={[0.03, 0.15]} tau={1.2} size={2} growth={1.2} color="#b3ab9c" opacity={0.12} seed={5} />
      )}
      {outcome === 'partial' && (
        <Burst count={400} origin={[-FOOT - 2.5, siteHeight(-FOOT - 3, 0, SLOPE) + 0.4, 0]} radius={3} from={LANDING.tipEnd} to={LANDING.tipEnd + 0.25} speed={[3, 12]} life={[1.4, 2.8]} up={[0.05, 0.5]} tau={0.9} rise={0.1} size={1.6} growth={1.5} color="#bdb3a3" opacity={0.2} seed={6} />
      )}
    </>
  )
}

function Crash() {
  const t0 = LANDING.impact
  const light = useRef<THREE.PointLight>(null)
  const time = useShowTime()
  useFrame(() => {
    const t = time.current
    if (light.current) light.current.intensity = t > t0 ? 2400 * Math.exp(-(t - t0) * 3.5) : 0
  })
  return (
    <>
      <pointLight ref={light} position={[0, 3, 0]} color="#ffd9a8" distance={120} decay={1.4} intensity={0} />
      <Glow position={[0, 2.5, 0]} size={30} color="#fff1d8" level={(t) => (t > t0 ? 3 * Math.exp(-(t - t0) * 4) : 0)} />
      <Glow position={[0, 1.5, 0]} size={9} color="#ff8a3a" level={(t) => (t > t0 ? 1.4 * Math.exp(-(t - t0) * 0.7) * (0.8 + 0.2 * Math.sin(t * 30)) : 0)} />
      {/* hot sparks */}
      <Burst count={500} origin={[0, 1, 0]} radius={1} from={t0} to={t0 + 0.15} speed={[10, 34]} life={[0.6, 1.6]} up={[0.15, 0.9]} gravity={9} floor={0} size={0.1} color="#ffb060" opacity={1} additive soft={0.5} seed={11} maxPx={14} />
      {/* debris chunks */}
      <Burst count={260} origin={[0, 1, 0]} radius={1} from={t0} to={t0 + 0.1} speed={[6, 22]} life={[2.5, 4]} up={[0.2, 0.95]} gravity={7} floor={0.05} size={0.25} color="#3b3631" opacity={1} soft={0.15} seed={12} maxPx={18} />
      {/* the dust cloud */}
      <Burst count={900} origin={[0, 0.8, 0]} radius={2} from={t0} to={t0 + 0.5} speed={[3, 14]} life={[3, 5.5]} up={[0.0, 0.6]} tau={1.3} rise={0.5} swirl={0.4} size={4.5} growth={1.8} color="#a99f8f" opacity={0.38} seed={13} />
    </>
  )
}

function Rig({ outcome }: { outcome: Outcome }) {
  const time = useShowTime()
  const camera = useThree((s) => s.camera)
  const look = useMemo(() => new THREE.Vector3(0, 10, 0), [])
  useFrame(() => {
    const t = time.current
    const y = altitude(t, outcome)
    const k = seg(t, 0, 10)
    const shakeAt = outcome === 'failed' ? LANDING.impact : LANDING.touchdown
    const shake = (outcome === 'failed' ? 0.6 : 0.12) * Math.exp(-Math.max(0, t - shakeAt) * 3) * (t > shakeAt ? 1 : 0)
    const rumble = 0.03 * seg(t, LANDING.dustStart, shakeAt) * (t < shakeAt ? 1 : 0)
    const jitter = (shake + rumble) * Math.sin(t * 73)
    camera.position.set(17 - 4 * k + jitter, 2.8 + y * 0.12 + jitter * 0.6, 19 - 5 * k)
    look.lerp(new THREE.Vector3(outcome === 'partial' ? -1.5 : 0, Math.max(2.2, y + 2.5), 0), 0.12)
    camera.up.set(0, 1, 0)
    camera.lookAt(look)
  })
  return null
}

export function LandingScene({ outcome }: { outcome: Outcome }) {
  return (
    <>
      <color attach="background" args={['#010203']} />
      <Rig outcome={outcome} />
      <Safe>
        <Starfield brightness={0.55} />
      </Safe>
      <LowSun position={[-75, 9, 30]} intensity={4.4} extent={34} />
      <LunarGround slope={outcome === 'partial' ? SLOPE : 0} />
      <Lander outcome={outcome} />
      <Dust outcome={outcome} />
      {outcome === 'failed' && <Crash />}
    </>
  )
}
