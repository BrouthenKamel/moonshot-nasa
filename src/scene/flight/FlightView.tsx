import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Design } from '../../sim/types'
import type { FlightShot } from '../../viz/flight/flightDirector'
import { INSTRUMENT_COLORS } from '../instrumentStage/stageModel'
import { CubeSat, Earth, Effects, Moon, SUN_DIR, Starfield, Sun, ease, prefersReducedMotion, useGraphics } from '../space'

/**
 * The flight in space: Earth to Moon along the transfer path, the capture burn, then the
 * polar science orbit with the ice lighting up as the core's coverage grows.
 * Moon radius 1 at the origin (south pole -Y), Earth far away on -X. Distances are
 * compressed and the craft is drawn far larger than life; every state comes from the FlightShot.
 */

const EARTH_POS = new THREE.Vector3(-34, 0, 0)
const UP = new THREE.Vector3(0, 1, 0)

/** One colour per orbit, as agreed in docs/DESIGN-DIRECTION.md */
const ORBIT_COLORS: Record<string, string> = {
  'orbit-halo': '#a78bfa',
  'orbit-elliptical': '#a3e635',
  'orbit-100km': '#38bdf8',
}

/** How each orbit is drawn: semi-major axis and eccentricity (in Moon radii), seconds per revolution */
const ORBIT_SHAPES: Record<string, { a: number; e: number; period: number }> = {
  'orbit-halo': { a: 2.3, e: 0.51, period: 34 },
  'orbit-elliptical': { a: 1.72, e: 0.36, period: 24 },
  'orbit-100km': { a: 1.2, e: 0, period: 16 },
}
const DEFAULT_SHAPE = ORBIT_SHAPES['orbit-100km']

/**
 * The orbit plane holds the polar axis, with its lowest point over the south pole. It is set
 * across the Sun's direction (a dawn-dusk orbit), so the craft flies along the line between day
 * and night, where the low Sun throws the long crater shadows the ice hides in.
 */
const PERI = new THREE.Vector3(0, -1, 0)
const SIDE = new THREE.Vector3(-SUN_DIR.z, 0, SUN_DIR.x).normalize()
const ORBIT_NORMAL = new THREE.Vector3().crossVectors(PERI, SIDE).normalize()
/** Which side of the orbit plane the Sun is on: the chase camera stays there, so the scene is lit */
const SUNWARD = ORBIT_NORMAL.dot(SUN_DIR) >= 0 ? 1 : -1
/** Where the orbit camera sits: below the south pole, toward the Sun and the orbit's side */
const POLE_VIEW = new THREE.Vector3(0, -0.78, 0).addScaledVector(ORBIT_NORMAL, 0.42 * SUNWARD).addScaledVector(SIDE, 0.35).normalize()

function orbitPoint(shape: { a: number; e: number }, nu: number, out: THREE.Vector3) {
  const r = (shape.a * (1 - shape.e * shape.e)) / (1 + shape.e * Math.cos(nu))
  return out.copy(PERI).multiplyScalar(r * Math.cos(nu)).addScaledVector(SIDE, r * Math.sin(nu))
}

/** True anomaly from mean anomaly (Kepler's equation, a few Newton steps) */
function trueAnomaly(mean: number, e: number) {
  let E = mean
  for (let i = 0; i < 5; i++) E -= (E - e * Math.sin(E) - mean) / (1 - e * Math.cos(E))
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
}

const TRANSFER = new THREE.CubicBezierCurve3(
  new THREE.Vector3(-29.2, 0.6, 2.2),
  new THREE.Vector3(-18, 3.2, 13),
  new THREE.Vector3(-4.5, 1.2, 8.5),
  new THREE.Vector3(0.25, -0.35, 1.5),
)

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

interface DirectorProps {
  design: Design
  shot: FlightShot
  reduced: boolean
}

function Director({ design, shot, reduced }: DirectorProps) {
  const { camera } = useThree()
  const craft = useRef<THREE.Group>(null)
  const beams = useRef<THREE.Group>(null)
  const link = useRef<THREE.Mesh>(null)
  const shape = ORBIT_SHAPES[shot.orbitId] ?? DEFAULT_SHAPE

  // Animation state kept out of React: it changes every frame
  const s = useRef({
    mode: shot.stage === 'orbit' ? ('orbit' as const) : ('transfer' as const),
    t: shot.transferT,
    mean: -1.2,
    burnLeft: 0,
    burn: 0,
    deploy: shot.transferT > 0.02 || shot.stage === 'orbit' ? 1 : 0,
    tumble: 0,
    camPos: new THREE.Vector3(),
    camLook: new THREE.Vector3(),
    first: true,
  })
  const v = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      tan: new THREE.Vector3(),
      side: new THREE.Vector3(),
      x: new THREE.Vector3(),
      y: new THREE.Vector3(),
      z: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      wantPos: new THREE.Vector3(),
      wantLook: new THREE.Vector3(),
      toEarth: new THREE.Vector3(),
      q: new THREE.Quaternion(),
    }),
    [],
  )

  // Read by the craft every frame: engine and wings
  const live = useRef({ burn: 0, deploy: shot.transferT > 0.02 || shot.stage === 'orbit' ? 1 : 0 })

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    const a = s.current
    const time = state.clock.elapsedTime
    const c = craft.current
    if (!c) return

    // Which rig: follow the shot, but let the capture burn play out before cutting to the orbit
    if (shot.stage !== 'orbit') a.mode = 'transfer'
    else if (a.mode === 'transfer') {
      if (a.first || reduced) a.mode = 'orbit'
      else if (a.t > 0.985) {
        if (a.burnLeft === 0) a.burnLeft = 3.2
        a.burnLeft = Math.max(0, a.burnLeft - dt)
        if (a.burnLeft === 0) a.mode = 'orbit'
      }
    }

    if (a.mode === 'transfer') {
      const target = shot.stage === 'orbit' ? 1 : shot.transferT
      a.t += (target - a.t) * (reduced || a.first ? 1 : ease(dt, shot.stage === 'orbit' ? 1.8 : 0.7))
      const t = Math.min(1, Math.max(0, a.t))
      TRANSFER.getPoint(t, v.pos)
      TRANSFER.getTangent(t, v.tan).normalize()
      v.side.crossVectors(v.tan, UP).normalize()
      // Nose along the path, wings level
      v.z.copy(v.tan)
      v.y.copy(UP).addScaledVector(v.z, -UP.dot(v.z)).normalize()
      // Camera swings from ahead of the craft (Earth behind it) round to behind it (Moon ahead)
      const swing = 2.55 - 2.0 * smooth(0.06, 0.42, t) + (reduced ? 0 : Math.sin(time * 0.13) * 0.08)
      v.wantPos
        .copy(v.pos)
        .addScaledVector(v.tan, -Math.cos(swing) * 0.46)
        .addScaledVector(v.side, Math.sin(swing) * 0.46)
        .addScaledVector(UP, 0.1)
      v.wantLook.copy(v.pos).addScaledVector(v.tan, 0.06)
      a.burn = a.burnLeft > 0 ? 1 : 0
      a.deploy = t > 0.02 ? 1 : 0
    } else {
      a.t = 1
      a.burnLeft = 0
      a.burn = 0
      a.deploy = 1
      a.mean += (dt * Math.PI * 2) / shape.period
      const nu = trueAnomaly(a.mean, shape.e)
      orbitPoint(shape, nu, v.pos)
      // Instruments (+Z) look at the Moon, wings (X) across the track
      v.z.copy(v.pos).normalize().multiplyScalar(-1)
      v.y.crossVectors(v.z, ORBIT_NORMAL).normalize()
      // A composed shot of the south pole, lit from the side, that leans a little toward the craft;
      // the craft sweeps through the frame on each pass over the ice
      const sway = reduced ? 0 : Math.sin(time * 0.05) * 0.12
      v.wantPos.copy(POLE_VIEW).addScaledVector(SIDE, sway).normalize().multiplyScalar(2.55)
      v.wantLook.set(0, -0.62, 0).addScaledVector(v.pos, 0.12)
    }

    if (shot.ending === 'failed' && !reduced) a.tumble += dt * 0.35
    v.x.crossVectors(v.y, v.z).normalize()
    v.m.makeBasis(v.x, v.y, v.z)
    c.position.copy(v.pos)
    c.quaternion.setFromRotationMatrix(v.m)
    if (a.tumble) c.rotateOnAxis(v.x.set(0.3, 1, 0.2).normalize(), a.tumble)

    // Camera: cut on the first frame and on a rig change, glide otherwise
    const cut = a.first || a.camPos.distanceTo(v.wantPos) > 6 || reduced
    const k = cut ? 1 : ease(dt, 2.4)
    a.camPos.lerp(v.wantPos, k)
    a.camLook.lerp(v.wantLook, k)
    camera.position.copy(a.camPos)
    camera.up.copy(UP)
    camera.lookAt(a.camLook)
    a.first = false

    live.current.burn = shot.ending === 'failed' ? 0 : a.burn
    live.current.deploy = a.deploy

    // Instrument beams: on over the polar region, while the instruments record
    const overPole = a.mode === 'orbit' && v.pos.y < 0 && Math.acos(Math.min(1, -v.pos.y / v.pos.length())) < 0.42
    const b = beams.current
    if (b) {
      const on = overPole && shot.science && shot.ending !== 'failed'
      b.visible = on
      if (on) {
        const height = v.pos.length() - 1
        b.position.copy(v.pos)
        b.quaternion.copy(c.quaternion)
        b.scale.setScalar(height)
      }
    }

    // Downlink: a pulsing line from the craft toward Earth while data comes home
    const l = link.current
    if (l) {
      const on = a.mode === 'orbit' && shot.downlink && shot.ending !== 'failed'
      l.visible = on
      if (on) {
        v.toEarth.copy(EARTH_POS).sub(v.pos)
        const len = Math.min(9, v.toEarth.length())
        v.toEarth.normalize()
        l.position.copy(v.pos).addScaledVector(v.toEarth, len / 2)
        l.quaternion.setFromUnitVectors(UP, v.toEarth)
        l.scale.set(1, len, 1)
        const mat = l.material as THREE.MeshBasicMaterial
        mat.opacity = reduced ? 0.35 : 0.2 + 0.2 * Math.sin(time * 9)
      }
    }
  })

  const craftScale = shot.stage === 'orbit' ? 0.26 : 0.2
  const beamColors = shot.instruments.map((id) => INSTRUMENT_COLORS[id] ?? '#ffffff')
  return (
    <>
      <group ref={craft}>
        <CubeSat design={design} scale={craftScale} live={live} />
      </group>
      {/* Beams point along +Z (toward the Moon); scaled in z to reach the ground */}
      <group ref={beams} visible={false}>
        {beamColors.map((color, i) => (
          <mesh key={i} position={[(i - (beamColors.length - 1) / 2) * 0.05, 0, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.16 + i * 0.05, 1, 24, 1, true]} />
            <meshBasicMaterial color={new THREE.Color(color).multiplyScalar(1.4)} transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      <mesh ref={link} visible={false}>
        <cylinderGeometry args={[0.0025, 0.0025, 1, 6, 1, true]} />
        <meshBasicMaterial color={new THREE.Color(0.5, 0.9, 1.1)} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </>
  )
}

interface FlightViewProps {
  design: Design
  shot: FlightShot
  className?: string
}

/** The space view. Mount it only where WebGL is available (see canUseWebGL). */
export function FlightView({ design, shot, className = '' }: FlightViewProps) {
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const quality = useGraphics((s) => s.quality)
  const shape = ORBIT_SHAPES[shot.orbitId] ?? DEFAULT_SHAPE
  const pathPoints = useMemo(() => TRANSFER.getPoints(120), [])
  const ringPoints = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 160; i++) pts.push(orbitPoint(shape, (i / 160) * Math.PI * 2, new THREE.Vector3()))
    return pts
  }, [shape])
  const orbitColor = ORBIT_COLORS[shot.orbitId] ?? '#38bdf8'
  return (
    <Canvas
      className={`!absolute inset-0 ${className}`}
      dpr={quality === 'high' ? [1, 2] : [1, 1.25]}
      camera={{ fov: 45, near: 0.02, far: 900 }}
      gl={{ antialias: true }}
      aria-hidden
    >
      <color attach="background" args={['#000000']} />
      <Suspense fallback={null}>
        <Starfield brightness={0.85} />
        <Sun intensity={2.6} fill={0.05} />
        <Moon iceCoverage={shot.coverage} />
        <group position={EARTH_POS}>
          <Earth radius={3.67} spin={0.006} />
        </group>
        {shot.stage !== 'orbit' && (
          <Line points={pathPoints} color="#fbbf24" lineWidth={1.2} dashed dashSize={0.25} gapSize={0.2} transparent opacity={0.5} />
        )}
        <Line points={ringPoints} color={orbitColor} lineWidth={shot.stage === 'orbit' ? 1.6 : 1} transparent opacity={shot.stage === 'orbit' ? 0.75 : 0.3} />
        <Director design={design} shot={shot} reduced={reduced} />
        <Effects bloom={1} vignette={0.7} />
      </Suspense>
    </Canvas>
  )
}
