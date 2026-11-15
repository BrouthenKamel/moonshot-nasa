import { Component, Suspense, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { useModel } from '../../assets/models'
import type { Design } from '../../sim/types'
import { useUiStore, type FlightCamMode } from '../../state/uiStore'
import type { FlightShot } from '../../viz/flight/flightDirector'
import {
  EARTH,
  EARTH_RADIUS,
  MOON_DISTANCE,
  moonAngle,
  moonPosition,
  planTransfer,
  sunAngle,
  transferPosition,
  transferProgress,
  type TransferPlan,
} from '../../viz/flight/skyMotion'
import { INSTRUMENT_COLORS } from '../instrumentStage/stageModel'
import { CubeSat, Earth, Effects, Moon, SUN_DIR, Starfield, Sun, ease, prefersReducedMotion, useGraphics } from '../space'

/**
 * The flight in space, moving with the mission's days (src/viz/flight/skyMotion.ts):
 * Earth spins and the Sun turns round it over the year; the Moon goes round Earth every 27 days,
 * one face toward it; the craft flies a transfer ellipse round Earth that meets the Moon on the
 * arrival day, fires its engine and spirals down into the polar science orbit, where the ice
 * lights up as the core's coverage grows. Distances are compressed and the craft is drawn far
 * larger than life; every mission state comes from the FlightShot.
 */

const EARTH_POS = new THREE.Vector3(EARTH.x, EARTH.y, EARTH.z)
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
 * across the Sun's direction at the start (a dawn-dusk orbit); like a real orbit it then stays
 * fixed among the stars while the Sun turns round over the year.
 */
const PERI = new THREE.Vector3(0, -1, 0)
const SIDE = new THREE.Vector3(-SUN_DIR.z, 0, SUN_DIR.x).normalize()
const ORBIT_NORMAL = new THREE.Vector3().crossVectors(PERI, SIDE).normalize()
/** Which side of the orbit plane the Sun is on: the chase camera stays there, so the scene is lit */
const SUNWARD = ORBIT_NORMAL.dot(SUN_DIR) >= 0 ? 1 : -1
/** Where the orbit camera sits: below the south pole, toward the Sun and the orbit's side */
const POLE_VIEW = new THREE.Vector3(0, -0.78, 0).addScaledVector(ORBIT_NORMAL, 0.42 * SUNWARD).addScaledVector(SIDE, 0.35).normalize()
/** Steeper view from beneath the south pole (-Y) to inspect crater ice accumulation */
const SOUTH_POLE_VIEW = new THREE.Vector3(0, -0.94, 0).addScaledVector(ORBIT_NORMAL, 0.24 * SUNWARD).addScaledVector(SIDE, 0.18).normalize()

/** The overview: high above Earth, the Moon's whole orbit and the transfer in frame */
const OVERVIEW_LOOK = EARTH_POS.clone().add(new THREE.Vector3(4, 0, 0))
const OVERVIEW_POS = OVERVIEW_LOOK.clone().add(new THREE.Vector3(0, 74, 86))

/** Seconds the capture burn and the spiral down into the science orbit take on screen */
const CAPTURE_SECONDS = 5
/** How far out (in orbit sizes) the craft arrives before it spirals down */
const APPROACH = 3.2
/** Where on the science orbit the spiral begins (mean anomaly) */
const ENTRY_MEAN = -1.2
/** Without a mission clock (replay, labs): days the transfer takes */
const FALLBACK_TRANSFER_DAYS = 120

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

/** Mean anomaly from true anomaly, so the orbit carries on smoothly from where the spiral ends */
function meanAnomaly(nu: number, e: number) {
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2))
  return E - e * Math.sin(E)
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const toV3 = (p: { x: number; y: number; z: number }, out: THREE.Vector3) => out.set(p.x, p.y, p.z)

/** The mission's clock and the transfer's dates, in agency days */
export interface FlightTimeline {
  /** Current day, read every frame */
  getDay: () => number
  launchDay: number
  /** Day the craft reaches the Moon (the capture month) */
  arrivalDay: number
}

interface CamOffset {
  yaw: number
  pitch: number
  zoom: number
  dragging: boolean
}

/** Things the scene moves every frame, shared between the director and the bodies */
interface SkyRefs {
  sunDir: THREE.Vector3
  earthAngle: { current: number }
  sunGroup: React.RefObject<THREE.Group | null>
  moonFrame: React.RefObject<THREE.Group | null>
  moonBody: React.RefObject<THREE.Group | null>
}

interface DirectorProps {
  design: Design
  shot: FlightShot
  reduced: boolean
  camMode: FlightCamMode
  camOffset: React.RefObject<CamOffset>
  plan: TransferPlan
  timeline?: FlightTimeline
  sky: SkyRefs
}

function Director({ design, shot, reduced, camMode, camOffset, plan, timeline, sky }: DirectorProps) {
  const { camera } = useThree()
  const marker = useRef<THREE.Mesh>(null)
  const craft = useRef<THREE.Group>(null)
  const beams = useRef<THREE.Group>(null)
  const link = useRef<THREE.Mesh>(null)
  const shape = ORBIT_SHAPES[shot.orbitId] ?? DEFAULT_SHAPE
  const entryNu = trueAnomaly(ENTRY_MEAN, shape.e)

  // Animation state kept out of React: it changes every frame
  const s = useRef({
    mode: shot.stage === 'orbit' ? ('orbit' as 'transfer' | 'capture' | 'orbit') : ('transfer' as 'transfer' | 'capture' | 'orbit'),
    t: shot.transferT,
    day: 0,
    prevDay: 0,
    capture: 0,
    mean: ENTRY_MEAN,
    burn: 0,
    deploy: shot.transferT > 0.02 || shot.stage === 'orbit' ? 1 : 0,
    tumble: 0,
    camPos: new THREE.Vector3(),
    camLook: new THREE.Vector3(),
    anchor: new THREE.Vector3(),
    anchorKind: '' as string,
    userYaw: 0,
    userPitch: 0,
    userZoom: 1,
    lastCamMode: camMode,
    first: true,
  })
  const v = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      ahead: new THREE.Vector3(),
      rel: new THREE.Vector3(),
      nextRel: new THREE.Vector3(),
      moon: new THREE.Vector3(),
      moonAtArrival: new THREE.Vector3(),
      entry: new THREE.Vector3(),
      tan: new THREE.Vector3(1, 0, 0),
      side: new THREE.Vector3(),
      radial: new THREE.Vector3(),
      x: new THREE.Vector3(),
      y: new THREE.Vector3(),
      z: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      wantPos: new THREE.Vector3(),
      wantLook: new THREE.Vector3(),
      offset: new THREE.Vector3(),
      toward: new THREE.Vector3(),
      anchor: new THREE.Vector3(),
      poleView: new THREE.Vector3(),
      southView: new THREE.Vector3(),
      tmp: new THREE.Vector3(),
    }),
    [],
  )

  // Read by the craft every frame: engine and wings
  const live = useRef({ burn: 0, deploy: shot.transferT > 0.02 || shot.stage === 'orbit' ? 1 : 0 })

  /** The craft on the transfer at progress p: the ellipse, bending at the end onto its approach to the Moon */
  const transferAt = (p: number, out: THREE.Vector3) => {
    toV3(transferPosition(plan, p), out)
    const k = smooth(0.86, 1, p)
    if (k > 0) out.addScaledVector(v.tmp.copy(v.moon).sub(v.moonAtArrival).add(v.entry), k)
    return out
  }

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    const a = s.current
    const time = state.clock.elapsedTime
    const c = craft.current
    if (!c) return

    /* ---- The day: the mission clock, eased so a skipped month glides instead of jumping ---- */
    const span = plan.arrivalDay - plan.launchDay
    a.t += ((shot.stage === 'orbit' ? 1 : shot.transferT) - a.t) * (reduced || a.first ? 1 : ease(dt, 0.9))
    const target = timeline
      ? timeline.getDay()
      : shot.stage === 'orbit'
        ? plan.arrivalDay + time * 1.5
        : plan.launchDay + a.t * span
    if (a.first || reduced || Math.abs(target - a.day) > 400) a.day = target
    else a.day += (target - a.day) * ease(dt, 3)
    const day = a.day
    const dDay = a.first ? 0 : day - a.prevDay
    a.prevDay = day

    /* ---- Earth, Sun and Moon ---- */
    // Earth spins with the days, as a time-lapse capped at half a turn a second
    sky.earthAngle.current += Math.min(Math.max(dDay, 0), dt * 0.5) * Math.PI * 2 * 1.0027
    const sa = sunAngle(day)
    if (sky.sunGroup.current) sky.sunGroup.current.rotation.y = sa
    sky.sunDir.copy(SUN_DIR).applyAxisAngle(UP, sa)
    toV3(moonPosition(day), v.moon)
    toV3(moonPosition(plan.arrivalDay), v.moonAtArrival)
    if (sky.moonFrame.current) sky.moonFrame.current.position.copy(v.moon)
    // One face always toward Earth
    if (sky.moonBody.current) sky.moonBody.current.rotation.y = -moonAngle(day)
    v.poleView.copy(POLE_VIEW).applyAxisAngle(UP, sa)
    v.southView.copy(SOUTH_POLE_VIEW).applyAxisAngle(UP, sa)
    orbitPoint(shape, entryNu, v.entry).multiplyScalar(APPROACH)

    /* ---- Which phase: transfer, the capture burn and spiral, then the science orbit ---- */
    if (shot.stage !== 'orbit') a.mode = 'transfer'
    else if (a.mode === 'transfer') {
      if (a.first || reduced) a.mode = 'orbit'
      else {
        a.mode = 'capture'
        a.capture = 0
      }
    }
    if (a.mode === 'capture') {
      a.capture += dt / CAPTURE_SECONDS
      if (a.capture >= 1) {
        a.mode = 'orbit'
        a.mean = meanAnomaly(entryNu + Math.PI, shape.e)
      }
    }

    if (a.mode === 'transfer') {
      const p = timeline ? transferProgress(plan, day) : a.t
      transferAt(p, v.pos)
      transferAt(Math.min(1, p + 0.004), v.ahead)
      if (v.ahead.distanceToSquared(v.pos) > 1e-10) v.tan.subVectors(v.ahead, v.pos).normalize()
      v.side.crossVectors(v.tan, UP).normalize()
      // Nose along the path, wings level
      v.z.copy(v.tan)
      v.y.copy(UP).addScaledVector(v.z, -UP.dot(v.z)).normalize()
      a.burn = 0
      a.deploy = p > 0.02 ? 1 : 0
    } else {
      let nu: number
      let scale = 1
      if (a.mode === 'capture') {
        // Engine on, spiralling down from the approach into the science orbit
        const u = a.capture
        nu = entryNu + u * Math.PI
        scale = APPROACH + (1 - APPROACH) * smooth(0, 1, u)
        a.burn = 1
      } else {
        a.mean += (dt * Math.PI * 2) / shape.period
        nu = trueAnomaly(a.mean, shape.e)
        a.burn = 0
      }
      orbitPoint(shape, nu, v.rel).multiplyScalar(scale)
      orbitPoint(shape, nu + 0.01, v.nextRel).multiplyScalar(scale)
      v.tan.subVectors(v.nextRel, v.rel).normalize()
      v.pos.copy(v.moon).add(v.rel)
      a.deploy = 1
      // Instruments (+Z) look at the Moon, wings (X) across the track
      v.z.copy(v.rel).normalize().multiplyScalar(-1)
      v.y.crossVectors(v.z, ORBIT_NORMAL).normalize()
    }

    if (shot.ending === 'failed' && !reduced) a.tumble += dt * 0.35
    v.x.crossVectors(v.y, v.z).normalize()
    v.m.makeBasis(v.x, v.y, v.z)
    c.position.copy(v.pos)
    c.quaternion.setFromRotationMatrix(v.m)
    if (a.tumble) c.rotateOnAxis(v.x.set(0.3, 1, 0.2).normalize(), a.tumble)

    /* ---- Camera presets ---- */
    const nearMoon = a.mode !== 'transfer'
    v.rel.subVectors(v.pos, v.moon)
    if (camMode === 'overview') {
      const sway = reduced ? 0 : Math.sin(time * 0.04) * 2.5
      v.wantPos.copy(OVERVIEW_POS).x += sway
      v.wantLook.copy(OVERVIEW_LOOK)
    } else if (camMode === 'pole') {
      const sway = reduced ? 0 : Math.sin(time * 0.05) * 0.08
      v.wantPos.copy(v.southView).addScaledVector(SIDE, sway).normalize().multiplyScalar(2.3).add(v.moon)
      v.wantLook.set(0, -0.82, 0).add(v.moon)
    } else if (camMode === 'chase') {
      if (!nearMoon) {
        v.wantPos.copy(v.pos).addScaledVector(v.tan, -0.48).addScaledVector(v.side, 0.12).addScaledVector(UP, 0.12)
        v.wantLook.copy(v.pos).addScaledVector(v.tan, 0.3)
      } else {
        v.radial.copy(v.rel).normalize()
        v.wantPos.copy(v.pos).addScaledVector(v.tan, -0.58).addScaledVector(v.radial, 0.24).addScaledVector(ORBIT_NORMAL, 0.18 * SUNWARD)
        v.wantLook.copy(v.pos).addScaledVector(v.tan, 0.25).addScaledVector(v.radial, -0.14)
      }
    } else if (camMode === 'earth') {
      // Close to the craft, looking back home past it
      v.toward.copy(EARTH_POS).sub(v.pos).normalize()
      v.wantPos.copy(v.pos).addScaledVector(v.toward, -0.55).addScaledVector(UP, 0.14)
      v.wantLook.copy(EARTH_POS)
    } else if ((camMode === 'moon' || camMode === 'director') && a.mode !== 'orbit') {
      // Close behind the craft, the Moon ahead: the approach and the spiral down to it
      v.toward.copy(v.moon).sub(v.pos).normalize()
      v.side.crossVectors(v.toward, UP).normalize()
      const back = a.mode === 'capture' ? 1.1 : 0.5
      v.wantPos.copy(v.pos).addScaledVector(v.toward, -back).addScaledVector(v.side, 0.12).addScaledVector(UP, 0.14 * back * 2)
      v.wantLook.copy(v.moon)
    } else {
      // In orbit: composed shot of the south pole, lit from the side, leaning toward the craft
      const sway = reduced ? 0 : Math.sin(time * 0.05) * 0.12
      v.wantPos.copy(v.poleView).addScaledVector(SIDE, sway).normalize().multiplyScalar(2.55).add(v.moon)
      v.wantLook.set(0, -0.62, 0).addScaledVector(v.rel, 0.12).add(v.moon)
    }

    // Smooth interactive drag & wheel zoom offset on top of active preset
    const targetOffset = camOffset.current
    const uK = reduced ? 1 : ease(dt, 14)
    a.userYaw += (targetOffset.yaw - a.userYaw) * uK
    a.userPitch += (targetOffset.pitch - a.userPitch) * uK
    a.userZoom += (targetOffset.zoom - a.userZoom) * uK

    if (Math.abs(a.userYaw) > 1e-4 || Math.abs(a.userPitch) > 1e-4 || Math.abs(a.userZoom - 1) > 1e-4) {
      v.offset.subVectors(v.wantPos, v.wantLook)
      const baseR = Math.max(0.05, v.offset.length())
      const basePitch = Math.asin(THREE.MathUtils.clamp(v.offset.y / baseR, -0.999, 0.999))
      const baseYaw = Math.atan2(v.offset.x, v.offset.z)
      const yaw = baseYaw + a.userYaw
      const pitch = THREE.MathUtils.clamp(basePitch + a.userPitch, -1.48, 1.48)
      const r = baseR * a.userZoom
      const cosP = Math.cos(pitch)
      v.offset.set(r * cosP * Math.sin(yaw), r * Math.sin(pitch), r * cosP * Math.cos(yaw))
      v.wantPos.copy(v.wantLook).add(v.offset)
    }

    // Keep camera outside Moon and Earth spheres
    if (camMode !== 'overview') {
      v.offset.subVectors(v.wantPos, v.moon)
      if (v.offset.length() < 1.08) v.wantPos.copy(v.moon).add(v.offset.setLength(1.08))
      v.offset.subVectors(v.wantPos, EARTH_POS)
      if (v.offset.length() < EARTH_RADIUS + 0.25) v.wantPos.copy(EARTH_POS).add(v.offset.setLength(EARTH_RADIUS + 0.25))
    }

    // The camera rides along with what it frames (the craft, the Moon or Earth), so a moving
    // Moon does not slide out of a close shot; it glides between presets.
    const anchorKind = camMode === 'overview' ? 'earth' : a.mode === 'transfer' || camMode === 'earth' || camMode === 'chase' ? 'craft' : 'moon'
    v.anchor.copy(anchorKind === 'earth' ? EARTH_POS : anchorKind === 'craft' ? v.pos : v.moon)
    if (anchorKind === a.anchorKind && !a.first) {
      v.tmp.subVectors(v.anchor, a.anchor)
      a.camPos.add(v.tmp)
      a.camLook.add(v.tmp)
    }
    a.anchor.copy(v.anchor)
    a.anchorKind = anchorKind

    // Camera: cut on the first frame and on wide overview swaps; glide otherwise
    const modeCut = a.lastCamMode !== camMode && (a.lastCamMode === 'overview' || camMode === 'overview')
    const cut = a.first || modeCut || a.camPos.distanceTo(v.wantPos) > 40 || reduced
    a.lastCamMode = camMode
    const trackSpeed = targetOffset.dragging || camMode === 'chase' ? 12 : 2.4
    const k = cut ? 1 : ease(dt, trackSpeed)
    a.camPos.lerp(v.wantPos, k)
    a.camLook.lerp(v.wantLook, k)
    camera.position.copy(a.camPos)
    camera.up.copy(UP)
    camera.lookAt(a.camLook)
    a.first = false

    live.current.burn = shot.ending === 'failed' ? 0 : a.burn
    live.current.deploy = a.deploy

    // Overview: a bright marker so the craft can be found from far away
    const overview = camMode === 'overview'
    const dist = camera.position.distanceTo(v.pos)
    const mk = marker.current
    if (mk) {
      mk.visible = overview
      mk.position.copy(v.pos)
      mk.scale.setScalar(dist * 0.011 * (reduced ? 1 : 1 + Math.sin(time * 3) * 0.15))
    }

    // Instrument beams: on over the polar region, while the instruments record
    const overPole = a.mode === 'orbit' && v.rel.y < 0 && Math.acos(Math.min(1, -v.rel.y / v.rel.length())) < 0.42
    const b = beams.current
    if (b) {
      const on = overPole && shot.science && shot.ending !== 'failed'
      b.visible = on
      if (on) {
        const height = v.rel.length() - 1
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
        v.toward.copy(EARTH_POS).sub(v.pos)
        const len = Math.min(9, v.toward.length())
        v.toward.normalize()
        l.position.copy(v.pos).addScaledVector(v.toward, len / 2)
        l.quaternion.setFromUnitVectors(UP, v.toward)
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
      <mesh ref={marker} visible={false}>
        <sphereGeometry args={[0.45, 16, 12]} />
        <meshBasicMaterial color={new THREE.Color('#e8a33d').multiplyScalar(1.8)} toneMapped={false} />
      </mesh>
      {/* Beams point along +Z (toward the Moon); scaled in z to reach the ground */}
      <group ref={beams} visible={false}>
        {beamColors.map((color, i) => (
          <mesh key={i} position={[(i - (beamColors.length - 1) / 2) * 0.05, 0, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.16 + i * 0.05, 1, 24, 1, true]} />
            <meshBasicMaterial color={new THREE.Color(color).multiplyScalar(1.2)} transparent opacity={0.13} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      <mesh ref={link} visible={false}>
        <cylinderGeometry args={[0.0025, 0.0025, 1, 6, 1, true]} />
        <meshBasicMaterial color={new THREE.Color(1.1, 0.95, 0.75)} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </>
  )
}

/**
 * Draws nothing when an optional model fails to load. The NASA models are generated and
 * gitignored (public/assets/models/nasa), so a fresh checkout may not have them; without this
 * the whole space view would fail and fall back to the island.
 */
class OptionalModel extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function BennuLandmark({ reduced }: { reduced: boolean }) {
  const model = useModel('model.env-asteroid-bennu')
  const ref = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (!ref.current || reduced) return
    ref.current.rotation.y += delta * 0.08
    ref.current.rotation.x += delta * 0.03
  })
  return (
    <group ref={ref} position={[-15, -2.6, -10.5]} scale={0.45}>
      <primitive object={model} />
    </group>
  )
}

function PolarReticle({ active }: { active: boolean }) {
  const ringRef = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (ringRef.current && active) {
      ringRef.current.rotation.z += delta * 0.6
    }
  })
  if (!active) return null
  return (
    <group ref={ringRef} position={[0, -1.004, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[0.075, 0.08, 48]} />
        <meshBasicMaterial color="#5ee6f0" transparent opacity={0.65} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle, idx) => (
        <mesh key={idx} rotation={[0, 0, angle]} position={[0.088, 0, 0]}>
          <planeGeometry args={[0.015, 0.002]} />
          <meshBasicMaterial color="#5ee6f0" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

interface FlightViewProps {
  design: Design
  shot: FlightShot
  className?: string
  /** The mission clock and transfer dates; without it (replay, labs) time follows the shot */
  timeline?: FlightTimeline
}

/** The space view. Mount it only where WebGL is available (see canUseWebGL). */
export function FlightView({ design, shot, className = '', timeline }: FlightViewProps) {
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const quality = useGraphics((s) => s.quality)
  const flightCam = useUiStore((s) => s.flightCam)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null)
  const camOffset = useRef<CamOffset>({ yaw: 0, pitch: 0, zoom: 1, dragging: false })

  const sunGroup = useRef<THREE.Group>(null)
  const moonFrame = useRef<THREE.Group>(null)
  const moonBody = useRef<THREE.Group>(null)
  const sky = useMemo<SkyRefs>(
    () => ({ sunDir: SUN_DIR.clone(), earthAngle: { current: 0 }, sunGroup, moonFrame, moonBody }),
    [],
  )

  useEffect(() => {
    camOffset.current.yaw = 0
    camOffset.current.pitch = 0
    camOffset.current.zoom = 1
  }, [flightCam])

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = Math.exp(e.deltaY * 0.0012)
      camOffset.current.zoom = THREE.MathUtils.clamp(camOffset.current.zoom * factor, 0.45, 2.4)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    camOffset.current.dragging = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    d.x = e.clientX
    d.y = e.clientY
    camOffset.current.yaw -= dx * 0.006
    camOffset.current.pitch = THREE.MathUtils.clamp(camOffset.current.pitch + dy * 0.006, -1.4, 1.4)
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id !== e.pointerId) return
    dragRef.current = null
    camOffset.current.dragging = false
  }

  const resetCamOffset = () => {
    camOffset.current.yaw = 0
    camOffset.current.pitch = 0
    camOffset.current.zoom = 1
  }

  // The transfer's dates: from the mission clock, or a stand-in when there is none
  const launchDay = timeline?.launchDay ?? 0
  const arrivalDay = timeline?.arrivalDay ?? FALLBACK_TRANSFER_DAYS
  const plan = useMemo(() => planTransfer(launchDay, arrivalDay), [launchDay, arrivalDay])

  const shape = ORBIT_SHAPES[shot.orbitId] ?? DEFAULT_SHAPE
  const pathPoints = useMemo(
    () => Array.from({ length: 241 }, (_, i) => toV3(transferPosition(plan, i / 240), new THREE.Vector3())),
    [plan],
  )
  // The part of the path already flown, drawn solid in the overview
  const flownPoints = useMemo(() => {
    const t = shot.stage === 'orbit' ? 1 : timeline ? transferProgress(plan, timeline.getDay()) : shot.transferT
    const n = Math.max(2, Math.ceil(t * 240))
    return Array.from({ length: n + 1 }, (_, i) => toV3(transferPosition(plan, (i / n) * t), new THREE.Vector3()))
    // shot.transferT moves with the clock, so the flown line keeps up
  }, [plan, shot.stage, shot.transferT, timeline])
  const lunarOrbitPoints = useMemo(
    () =>
      Array.from(
        { length: 181 },
        (_, i) => new THREE.Vector3(EARTH.x + MOON_DISTANCE * Math.cos((i / 180) * Math.PI * 2), 0, EARTH.z + MOON_DISTANCE * Math.sin((i / 180) * Math.PI * 2)),
      ),
    [],
  )
  const ringPoints = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 160; i++) pts.push(orbitPoint(shape, (i / 160) * Math.PI * 2, new THREE.Vector3()))
    return pts
  }, [shape])
  const orbitColor = ORBIT_COLORS[shot.orbitId] ?? '#38bdf8'
  const overview = flightCam === 'overview'
  return (
    <div
      ref={wrapperRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={resetCamOffset}
      className={`!absolute inset-0 cursor-grab select-none touch-none active:cursor-grabbing ${className}`}
      aria-hidden
    >
      <Canvas
        className="h-full w-full"
        dpr={quality === 'high' ? [1, 2] : [1, 1.25]}
        camera={{ fov: 45, near: 0.02, far: 900 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#000000']} />
        <Suspense fallback={null}>
          <Starfield brightness={0.75} />
          {/* The Sun turns round over the year (Earth's orbit, seen from Earth) */}
          <group ref={sunGroup}>
            <Sun intensity={2.6} fill={0.05} />
          </group>
          {/* The Moon and what belongs to it move round Earth together */}
          <group ref={moonFrame}>
            <group ref={moonBody}>
              <Moon iceCoverage={shot.coverage} />
            </group>
            <PolarReticle active={shot.stage === 'orbit' && shot.science} />
            <Line points={ringPoints} color={orbitColor} lineWidth={shot.stage === 'orbit' ? 1.2 : 0.9} transparent opacity={shot.stage === 'orbit' ? 0.6 : 0.25} />
          </group>
          <group position={EARTH_POS}>
            <Earth radius={EARTH_RADIUS} angle={sky.earthAngle} sunDir={sky.sunDir} />
          </group>
          <OptionalModel>
            <Suspense fallback={null}>
              <BennuLandmark reduced={reduced} />
            </Suspense>
          </OptionalModel>
          {/* Thin, matte lines: the Moon's orbit in the overview, paper for the planned path, Kapton for the flown part */}
          {overview && <Line points={lunarOrbitPoints} color="#ede6d6" lineWidth={0.8} dashed dashSize={1.2} gapSize={1.2} transparent opacity={0.22} />}
          {(shot.stage !== 'orbit' || overview) && (
            <Line points={pathPoints} color="#ede6d6" lineWidth={1} dashed dashSize={overview ? 1.2 : 0.25} gapSize={overview ? 0.9 : 0.2} transparent opacity={0.32} />
          )}
          {overview && shot.transferT > 0 && <Line points={flownPoints} color="#e8a33d" lineWidth={1.8} transparent opacity={0.9} />}
          <Director design={design} shot={shot} reduced={reduced} camMode={flightCam} camOffset={camOffset} plan={plan} timeline={timeline} sky={sky} />
          <Effects preset="space" />
        </Suspense>
      </Canvas>
    </div>
  )
}
