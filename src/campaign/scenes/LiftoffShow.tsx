import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import * as THREE from 'three'
import type { AudioId, ModelId } from '../../assets/manifest'
import { audio } from '../../assets/audio'
import { preloadModel, useModel } from '../../assets/models'
import { BODY_RADIUS_M, getRocketPart, type RocketSlot } from '../../data/rocket'
import { layoutRocket, type PlacedPart } from '../../viz/rocket/rocketView'
import { Earth } from '../../scene/space/Earth'
import { Effects } from '../../scene/space/Effects'
import { ease, prefersReducedMotion } from '../../scene/space/quality'
import { Explosion, Flash, GroundCloud, Plume, SkyDome, SpeedStreaks, Trail, Vapour, type Nozzle, type Now } from './liftoffFx'
import {
  MOUNT_Y,
  PROFILES,
  TOWER,
  beatsBetween,
  climb,
  enginePower,
  liftoffBeats,
  liftoffPlan,
  liftoffPose,
  missionClock,
  rocketBase,
  rocketPitch,
  shotAt,
  skyDark,
  type LiftoffPlan,
} from './liftoffShots'
import type { LiftoffShowProps } from './types'

/**
 * The campaign's rocket liftoff, cut like a launch broadcast (shot table in liftoffShots.ts):
 * the pad at dusk, engine start, liftoff past the tower, the long-lens tracking camera, booster
 * and stage separation, and the upper stage above Earth. A failed launch ends in the tracking shot.
 * Each rocket size differs in stack, engines, boosters, smoke, shake, sound, length and shot count.
 */

const TOWER_MODEL: ModelId = 'model.env-mobile-launcher'

for (const p of Object.values(PROFILES))
  for (const [slot, id] of Object.entries(p.config)) {
    const m = getRocketPart(slot as RocketSlot, id)?.model
    if (m) preloadModel(m)
  }
preloadModel(TOWER_MODEL)

/** Booster nozzles and their exit height, in body radii (from the kit models) */
const BOOSTER_NOZZLES: Record<string, { pos: [number, number][]; r: number; bottom: number }> = {
  boosters_2_heavy: { pos: [[1.65, 0], [-1.65, 0]], r: 0.42, bottom: -0.96 },
  boosters_4: { pos: [[1.01, -1.01], [-1.01, -1.01], [-1.01, 1.01], [1.01, 1.01]], r: 0.27, bottom: -0.61 },
}

function engineNozzles(engineId: string, k: number): { nozzles: Nozzle[]; clusterR: number } {
  if (engineId === 'engine_single') return { nozzles: [{ x: 0, z: 0, r: 0.7 * k }], clusterR: 0.78 * k }
  const ring = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2
    return { x: Math.cos(a) * 0.64 * k, z: Math.sin(a) * 0.64 * k, r: 0.19 * k }
  })
  return { nozzles: [{ x: 0, z: 0, r: 0.19 * k }, ...ring], clusterR: 0.95 * k }
}

/* ---------------- safety: no WebGL, a missing model ---------------- */

class Boundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}

function Safe({ fallback = null, children }: { fallback?: ReactNode; children: ReactNode }) {
  return (
    <Boundary fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </Boundary>
  )
}

/* ---------------- the rocket ---------------- */

function PartFallback({ placed }: { placed: PlacedPart }) {
  const { part, slot } = placed
  const h = Math.max(0.2, part.height)
  if (slot === 'engine')
    return (
      <mesh position-y={-h / 2}>
        <cylinderGeometry args={[0.5, 0.85, h, 16]} />
        <meshStandardMaterial color="#3a3836" metalness={0.6} roughness={0.5} />
      </mesh>
    )
  if (slot === 'nose')
    return (
      <mesh position-y={placed.y + h / 2}>
        <coneGeometry args={[1, h, 24]} />
        <meshStandardMaterial color="#e9e6df" roughness={0.6} />
      </mesh>
    )
  if (slot === 'boosters') {
    const nz = BOOSTER_NOZZLES[part.id]
    return (
      <>
        {(nz?.pos ?? []).map(([x, z], i) => (
          <mesh key={i} position={[x, h / 2, z]}>
            <cylinderGeometry args={[nz.r * 1.3, nz.r * 1.3, h, 12]} />
            <meshStandardMaterial color="#e6e1d6" roughness={0.6} />
          </mesh>
        ))}
      </>
    )
  }
  if (slot === 'fins') return null
  return (
    <mesh position-y={placed.y + h / 2}>
      <cylinderGeometry args={[1, 1, h, 24]} />
      <meshStandardMaterial color={slot === 'stage1' ? '#c8742f' : '#e9e6df'} roughness={0.6} />
    </mesh>
  )
}

function LoadedPart({ placed }: { placed: PlacedPart }) {
  const root = useModel(placed.part.model!)
  return <primitive object={root} position-y={placed.y} />
}

function Part({ placed }: { placed: PlacedPart }) {
  return (
    <Safe fallback={<PartFallback placed={placed} />}>
      <LoadedPart placed={placed} />
    </Safe>
  )
}

/**
 * Boosters for the separation shot: the kit model's meshes regrouped one group per booster,
 * each pivoting at its own base, so each one can peel away on its own.
 */
function LoadedSplitBoosters({ placed, groups }: { placed: PlacedPart; groups: RefObject<(THREE.Group | null)[]> }) {
  const root = useModel(placed.part.model!)
  const nz = BOOSTER_NOZZLES[placed.part.id]
  const split = useMemo(() => {
    const holder = new THREE.Group()
    const gs = nz.pos.map(([x, z]) => {
      const g = new THREE.Group()
      g.position.set(x, nz.bottom, z)
      g.userData.radial = new THREE.Vector3(x, 0, z).normalize()
      holder.add(g)
      return g
    })
    holder.updateMatrixWorld(true)
    root.updateMatrixWorld(true)
    const meshes: THREE.Mesh[] = []
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
    })
    const box = new THREE.Box3()
    const c = new THREE.Vector3()
    const inv = new THREE.Matrix4()
    for (const m of meshes) {
      box.setFromObject(m).getCenter(c)
      let best = 0
      let bestD = Infinity
      nz.pos.forEach(([x, z], i) => {
        const d = (c.x - x) ** 2 + (c.z - z) ** 2
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      const g = gs[best]
      const world = m.matrixWorld.clone()
      inv.copy(g.matrixWorld).invert()
      g.add(m)
      m.matrix.copy(inv.multiply(world))
      m.matrix.decompose(m.position, m.quaternion, m.scale)
    }
    return { holder, gs }
  }, [root, nz])
  useEffect(() => {
    groups.current = split.gs
  }, [split, groups])
  return <primitive object={split.holder} position-y={placed.y} />
}

/* ---------------- the pad at dusk ---------------- */

function LatticeTower() {
  const bars = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number] }[] = []
    const w = 9
    const h = TOWER.heightM
    for (const x of [-w / 2, w / 2]) for (const z of [-w / 2, w / 2]) out.push({ p: [x, h / 2, z], s: [0.8, h, 0.8] })
    for (let y = 6; y < h; y += 6) {
      out.push({ p: [0, y, -w / 2], s: [w, 0.5, 0.5] }, { p: [0, y, w / 2], s: [w, 0.5, 0.5] })
      out.push({ p: [-w / 2, y, 0], s: [0.5, 0.5, w] }, { p: [w / 2, y, 0], s: [0.5, 0.5, w] })
    }
    return out
  }, [])
  return (
    <group>
      {bars.map((b, i) => (
        <mesh key={i} position={b.p}>
          <boxGeometry args={b.s} />
          <meshStandardMaterial color="#5b4a3e" roughness={0.8} metalness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

function TowerModel() {
  const root = useModel(TOWER_MODEL)
  return <primitive object={root} scale={TOWER.heightM / 24} />
}

/** A lamp mast with a bright head and a faint beam reaching for the rocket */
function Floodlight({ at, aim }: { at: [number, number]; aim: [number, number, number] }) {
  const mast = 26
  const head = useMemo(() => new THREE.Vector3(at[0], mast, at[1]), [at])
  const beam = useMemo(() => {
    const target = new THREE.Vector3(...aim)
    const dir = target.clone().sub(head)
    const len = dir.length()
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize())
    return { len, q, mid: head.clone().add(dir.multiplyScalar(len / 2)) }
  }, [aim, head])
  const spot = useRef<THREE.SpotLight>(null)
  useEffect(() => {
    const s = spot.current
    if (!s) return
    s.target.position.set(...aim)
    s.target.updateMatrixWorld()
  }, [aim])
  return (
    <group>
      <mesh position={[at[0], mast / 2, at[1]]}>
        <cylinderGeometry args={[0.25, 0.4, mast, 8]} />
        <meshStandardMaterial color="#3d3b38" roughness={0.7} metalness={0.5} />
      </mesh>
      <mesh position={head.toArray()}>
        <boxGeometry args={[3, 1.6, 0.8]} />
        <meshBasicMaterial color={new THREE.Color(5, 4.6, 3.8)} toneMapped={false} />
      </mesh>
      <mesh position={beam.mid.toArray()} quaternion={beam.q}>
        <coneGeometry args={[7, beam.len, 24, 1, true]} />
        <meshBasicMaterial color="#ffe9c8" transparent opacity={0.045} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <spotLight ref={spot} position={head.toArray()} angle={0.32} penumbra={0.6} intensity={2600} decay={2} color="#fff0d8" />
    </group>
  )
}

/** Launch mount: four legs and a square table with a hole the flame goes through */
function Mount() {
  const t = MOUNT_Y
  return (
    <group>
      {[
        [-5, -5],
        [5, -5],
        [-5, 5],
        [5, 5],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, t / 2, z]}>
          <boxGeometry args={[2, t, 2]} />
          <meshStandardMaterial color="#47433d" roughness={0.9} />
        </mesh>
      ))}
      {[
        { p: [0, t - 0.6, -4.6], s: [12, 1.2, 2.8] },
        { p: [0, t - 0.6, 4.6], s: [12, 1.2, 2.8] },
        { p: [-4.6, t - 0.6, 0], s: [2.8, 1.2, 6.4] },
        { p: [4.6, t - 0.6, 0], s: [2.8, 1.2, 6.4] },
      ].map((b, i) => (
        <mesh key={i} position={b.p as [number, number, number]}>
          <boxGeometry args={b.s as [number, number, number]} />
          <meshStandardMaterial color="#514c45" roughness={0.85} metalness={0.2} />
        </mesh>
      ))}
      {/* the flame trench, open both ways along x */}
      <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[70, 9]} />
        <meshStandardMaterial color="#0b0a09" roughness={1} />
      </mesh>
    </group>
  )
}

function PadSet({ plan, now, dims }: { plan: LiftoffPlan; now: Now; dims: Dims }) {
  const { k, placed, engineH, H, booster } = dims
  const rocket = useRef<THREE.Group>(null)
  const p = plan.profile
  // after a failure the trail ends where the vehicle was lost
  const flightTime = useMemo(() => () => (plan.explodeAt === null ? now() : Math.min(now(), plan.explodeAt)), [plan, now])
  const base = useMemo(() => {
    const v = new THREE.Vector3()
    return () => v.set(...rocketBase(plan, flightTime()))
  }, [plan, flightTime])
  const tip = useMemo(() => {
    const v = new THREE.Vector3()
    return () => v.set(...rocketBase(plan, now())).add(new THREE.Vector3(0, H * 0.45, 0))
  }, [plan, now, H])
  const tracking = plan.shots.find((s) => s.id === 'tracking')
  useFrame(() => {
    const t = now()
    const g = rocket.current
    if (!g) return
    g.position.copy(base())
    g.rotation.z = rocketPitch(plan, t)
    g.visible = plan.explodeAt === null || t < plan.explodeAt
  })
  const core = engineNozzles(p.config.engine, k)
  const corePower = () => enginePower(plan, now())
  const boosterPower = () => (now() >= plan.liftoffAt && (plan.explodeAt === null || now() < plan.explodeAt) ? 1 : 0)
  const stretch = () => (tracking && now() >= tracking.from ? 2.4 : 1)
  const aim: [number, number, number] = [0, MOUNT_Y + H * 0.45, 0]
  return (
    <group>
      <hemisphereLight args={['#7a76a8', '#2a1d14', 0.75]} />
      <directionalLight position={[-420, 40, -260]} intensity={2.6} color="#ff9a58" />
      <directionalLight position={[-120, 90, 260]} intensity={0.55} color="#8a96c8" />
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[30000, 30000]} />
        <meshStandardMaterial color="#241e18" roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
        <circleGeometry args={[60, 48]} />
        <meshStandardMaterial color="#3a352f" roughness={0.9} />
      </mesh>
      {/* a dark tree line and a far causeway on the horizon */}
      {Array.from({ length: 14 }, (_, i) => {
        const a = -0.5 + (i / 13) * 2.6
        const d = 2200 + (i % 3) * 500
        return (
          <mesh key={i} position={[Math.cos(a) * d * -1, 10, -Math.sin(a) * d]} rotation-y={a}>
            <boxGeometry args={[30, 20 + (i % 4) * 6, 900]} />
            <meshStandardMaterial color="#0d0c0b" roughness={1} />
          </mesh>
        )
      })}
      <Mount />
      <group position={[TOWER.x, 0, TOWER.z]}>
        <Safe fallback={<LatticeTower />}>
          <TowerModel />
        </Safe>
        {/* red warning beacon on top */}
        <mesh position-y={TOWER.heightM + 1.2}>
          <sphereGeometry args={[0.6, 10, 8]} />
          <meshBasicMaterial color={new THREE.Color(5, 0.5, 0.3)} toneMapped={false} />
        </mesh>
      </group>
      <Floodlight at={[-34, 30]} aim={aim} />
      <Floodlight at={[30, 34]} aim={aim} />
      <Floodlight at={[-30, -36]} aim={aim} />
      <group ref={rocket}>
        <group position-y={engineH * k} scale={k}>
          {placed.map((pp) => (
            <Part key={pp.slot} placed={pp} />
          ))}
        </group>
        <Plume nozzles={core.nozzles} clusterR={core.clusterR} power={corePower} stretch={stretch} />
        {booster &&
          booster.pos.map(([x, z], i) => (
            <group key={i} position={[x * k, (engineH + booster.bottom) * k, z * k]}>
              <Plume nozzles={[{ x: 0, z: 0, r: booster.r * k }]} clusterR={booster.r * k * 1.3} power={boosterPower} stretch={stretch} light={0.6} />
            </group>
          ))}
      </group>
      <Vapour now={now} until={plan.ignitionAt} H={H} r={k} base={base} />
      <GroundCloud
        now={now}
        count={p.smokePuffs}
        radius={p.smokeRadius}
        from={plan.ignitionAt}
        liftoffAt={plan.liftoffAt}
        glow={() => enginePower(plan, now()) * Math.exp(-climb(plan, now()) / 70)}
        origin={[0, 0, 0]}
      />
      <Trail now={now} from={tracking ? tracking.from : plan.duration} until={plan.explodeAt} ground={MOUNT_Y + 10} base={base} r={k} />
      {plan.explodeAt !== null && <Explosion now={now} at={plan.explodeAt} where={tip} size={34 * p.scale} />}
    </group>
  )
}

/* ---------------- high up: separation and space ---------------- */

const LOWER: readonly RocketSlot[] = ['engine', 'stage1', 'fins']

function HighSet({ plan, now, dims }: { plan: LiftoffPlan; now: Now; dims: Dims }) {
  const { k, placed, engineH, H, booster, coreH } = dims
  const p = plan.profile
  const root = useRef<THREE.Group>(null)
  const lower = useRef<THREE.Group>(null)
  const boosterGroups = useRef<(THREE.Group | null)[]>([])
  const upperBell = useRef<THREE.Mesh>(null)
  const hasUpper = p.config.stage2 !== 'none'
  const boosterPart = placed.find((pp) => pp.slot === 'boosters')
  const stagingShot = plan.shots.find((s) => s.id === 'staging')
  const spaceShot = plan.shots.find((s) => s.id === 'space')
  const sepY = (engineH + coreH) * k
  const q = useMemo(() => new THREE.Quaternion(), [])
  const axis = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const t = now()
    const inSpace = !!spaceShot && t >= spaceShot.from
    // in space, the upper stage is brought to the origin, where the camera looks
    root.current?.position.set(0, inSpace && hasUpper ? -sepY : 0, 0)
    // boosters peel away: tops tip outward about their bases, falling behind
    const bs = plan.boosterSepAt === null ? -1 : t - plan.boosterSepAt
    boosterGroups.current.forEach((g, i) => {
      if (!g) return
      const radial = g.userData.radial as THREE.Vector3 | undefined
      if (!radial || !booster) return
      const [x, z] = booster.pos[i]
      const s = Math.max(0, bs)
      g.visible = !stagingShot || t < stagingShot.from
      axis.set(radial.z, 0, -radial.x)
      q.setFromAxisAngle(axis, Math.min(2.4, s * s * 0.5 + s * 0.25))
      g.quaternion.copy(q)
      const out = s * s * 1.2 + s * 1.5
      g.position.set(x + radial.x * out, booster.bottom - s * s * 2.2, z + radial.z * out)
    })
    // first stage drops away after main engine cut-off
    const ss = plan.stageSepAt === null ? -1 : t - plan.stageSepAt
    const l = lower.current
    if (l) {
      const s = Math.max(0, ss)
      l.position.set(s * 0.4, -(s * s * 3.2 + s * 2.5), 0)
      l.rotation.z = s * s * 0.06
      l.visible = !inSpace || !hasUpper
    }
    if (upperBell.current) upperBell.current.visible = hasUpper && ss > 0.15
  })
  const core = engineNozzles(p.config.engine, k)
  const corePower = () => {
    const t = now()
    if (plan.stageSepAt !== null && t >= plan.stageSepAt - 0.1) return 0
    return 1
  }
  const boosterPower = () => (plan.boosterSepAt !== null && now() >= plan.boosterSepAt - 0.1 ? 0 : 1)
  const upperPower = () => (plan.stageSepAt !== null && now() > plan.stageSepAt + 0.7 ? Math.min(1, (now() - plan.stageSepAt - 0.7) * 3) : 0)
  return (
    <group>
      <ambientLight intensity={0.12} color="#7e8cb0" />
      <directionalLight position={[-120, 50, 60]} intensity={3.2} color="#fff1dd" />
      <directionalLight position={[60, -80, -40]} intensity={0.35} color="#4a6fb0" />
      <Stars radius={9000} depth={3000} count={3000} factor={160} saturation={0} fade speed={0} />
      <group position={[0, -5000 * 1.085, 0]}>
        <Safe
          fallback={
            <mesh>
              <sphereGeometry args={[5000, 96, 48]} />
              <meshStandardMaterial color="#1f4f8f" roughness={0.8} />
            </mesh>
          }
        >
          <Earth radius={5000} spin={0.002} />
        </Safe>
      </group>
      <SpeedStreaks span={H} visible={() => !spaceShot || now() < spaceShot.from} />
      <group ref={root}>
        <group ref={lower}>
          <group position-y={engineH * k} scale={k}>
            {placed
              .filter((pp) => LOWER.includes(pp.slot))
              .map((pp) => (
                <Part key={pp.slot} placed={pp} />
              ))}
          </group>
          <Plume nozzles={core.nozzles} clusterR={core.clusterR} power={corePower} stretch={() => 2.2} />
        </group>
        {boosterPart && booster && (
          <group position-y={engineH * k} scale={k}>
            <Safe fallback={<PartFallback placed={boosterPart} />}>
              <LoadedSplitBoosters placed={boosterPart} groups={boosterGroups} />
            </Safe>
          </group>
        )}
        {booster &&
          booster.pos.map(([x, z], i) => (
            <group key={i} position={[x * k, (engineH + booster.bottom) * k, z * k]}>
              <Plume nozzles={[{ x: 0, z: 0, r: booster.r * k }]} clusterR={booster.r * k * 1.3} power={boosterPower} stretch={() => 2.2} light={0.5} />
            </group>
          ))}
        {booster &&
          booster.pos.map(([x, z], i) => (
            <group key={`sep${i}`} position={[x * k * 0.7, (engineH + coreH * 0.62) * k, z * k * 0.7]}>
              <Flash now={now} at={plan.boosterSepAt} size={k * 1.6} life={0.5} />
            </group>
          ))}
        <group position-y={engineH * k} scale={k}>
          {placed
            .filter((pp) => !LOWER.includes(pp.slot) && pp.slot !== 'boosters')
            .map((pp) => (
              <Part key={pp.slot} placed={pp} />
            ))}
        </group>
        {hasUpper && (
          <group position-y={sepY}>
            <mesh ref={upperBell} position-y={-0.45 * k} visible={false}>
              <cylinderGeometry args={[0.18 * k, 0.48 * k, 0.9 * k, 20, 1, true]} />
              <meshStandardMaterial color="#2c2a28" metalness={0.7} roughness={0.4} side={THREE.DoubleSide} />
            </mesh>
            <group position-y={-0.9 * k}>
              <Plume nozzles={[{ x: 0, z: 0, r: 0.42 * k }]} clusterR={0.5 * k} power={upperPower} stretch={() => 2.6} light={0.4} />
            </group>
            <Flash now={now} at={plan.stageSepAt} size={k * 3} />
          </group>
        )}
      </group>
    </group>
  )
}

/* ---------------- the director ---------------- */

interface Dims {
  /** metres per body radius */
  k: number
  placed: PlacedPart[]
  /** engine height in body radii */
  engineH: number
  coreH: number
  H: number
  upperH: number
  booster: (typeof BOOSTER_NOZZLES)[string] | null
}

function useDims(plan: LiftoffPlan): Dims {
  return useMemo(() => {
    const cfg = plan.profile.config
    const k = BODY_RADIUS_M * plan.profile.scale
    const layout = layoutRocket(cfg)
    const core = getRocketPart('stage1', cfg.stage1)!
    const upper = getRocketPart('stage2', cfg.stage2)!
    const nose = getRocketPart('nose', cfg.nose)!
    return {
      k,
      placed: layout.placed,
      engineH: -layout.bottom,
      coreH: core.height,
      H: layout.heightUnits * k,
      // with no upper stage the whole rocket flies on into space
      upperH: cfg.stage2 === 'none' ? layout.heightUnits * k : (upper.height + nose.height) * k,
      booster: BOOSTER_NOZZLES[cfg.boosters] ?? null,
    }
  }, [plan])
}

function Director({ plan, now, dims, sets }: { plan: LiftoffPlan; now: Now; dims: Dims; sets: { pad: RefObject<THREE.Group | null>; high: RefObject<THREE.Group | null> } }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const advance = useThree((s) => s.advance)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __liftoffScene?: THREE.Scene }).__liftoffScene = scene
  }, [scene])
  useEffect(() => {
    // Dev only: lets a headless browser (no requestAnimationFrame) step the show for screenshots
    if (import.meta.env.DEV) (window as unknown as { __liftoffAdvance?: (ts: number) => void }).__liftoffAdvance = advance
  }, [advance])
  const look = useRef(new THREE.Vector3())
  const lastShot = useRef<string | null>(null)
  const goal = useMemo(() => new THREE.Vector3(), [])
  useFrame((st, dt) => {
    const t = now()
    const shot = shotAt(plan, t)
    const pose = liftoffPose(plan, t, { H: dims.H, r: dims.k, upperH: dims.upperH })
    goal.set(...pose.look)
    const cut = lastShot.current !== shot.id
    lastShot.current = shot.id
    if (cut || !pose.springLook) look.current.copy(goal)
    else look.current.lerp(goal, ease(dt, 4))
    const amp = plan.reduced ? 0 : pose.shake * plan.profile.shake
    const e = st.clock.elapsedTime
    const n = (a: number, b: number) => Math.sin(e * a) * 0.6 + Math.sin(e * b + 1.7) * 0.4
    camera.position.set(pose.pos[0] + amp * 0.25 * n(31, 47), pose.pos[1] + amp * 0.25 * n(37, 53), pose.pos[2])
    const dist = camera.position.distanceTo(look.current)
    camera.lookAt(look.current.x + dist * 0.012 * amp * n(29, 41), look.current.y + dist * 0.012 * amp * n(43, 59), look.current.z)
    if (Math.abs(camera.fov - pose.fov) > 1e-3) {
      camera.fov = pose.fov
      camera.updateProjectionMatrix()
    }
    if (sets.pad.current) sets.pad.current.visible = pose.set === 'pad'
    if (sets.high.current) sets.high.current.visible = pose.set === 'high'
  })
  return null
}

/** Tells the show its models are in, so the clock starts with a rocket on the pad */
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady])
  return null
}

function ShowScene({ plan, now, onReady }: { plan: LiftoffPlan; now: Now; onReady: () => void }) {
  const dims = useDims(plan)
  const pad = useRef<THREE.Group>(null)
  const high = useRef<THREE.Group>(null)
  const dark = () => {
    const t = now()
    const s = shotAt(plan, t)
    if (s.set === 'pad') return skyDark(plan, t)
    return s.id === 'space' ? 2 : s.id === 'staging' ? 1.55 : 1.3
  }
  return (
    <>
      <SkyDome dark={dark} />
      <group ref={pad}>
        <PadSet plan={plan} now={now} dims={dims} />
      </group>
      <group ref={high} visible={false}>
        <HighSet plan={plan} now={now} dims={dims} />
      </group>
      <Director plan={plan} now={now} dims={dims} sets={{ pad, high }} />
      <Suspense fallback={null}>
        <PreloadRocket placed={dims.placed} />
        <Ready onReady={onReady} />
      </Suspense>
    </>
  )
}

/** Suspends until every model of this rocket and the tower are loaded (errors are swallowed by Safe elsewhere) */
function PreloadRocket({ placed }: { placed: PlacedPart[] }) {
  return (
    <Boundary>
      {placed.map((p) => (
        <ModelProbe key={p.slot} id={p.part.model!} />
      ))}
      <ModelProbe id={TOWER_MODEL} />
    </Boundary>
  )
}

function ModelProbe({ id }: { id: ModelId }) {
  useModel(id)
  return null
}

/* ---------------- the overlay ---------------- */

/** How long the show waits for its models before it starts anyway */
const LOAD_WAIT_MS = 3000

export function LiftoffShow({ rocket, missionName, launchFails, onDone }: LiftoffShowProps) {
  const [reduced] = useState(prefersReducedMotion)
  const plan = useMemo(() => liftoffPlan(rocket, { fails: launchFails, reduced }), [rocket, launchFails, reduced])
  const beats = useMemo(() => liftoffBeats(plan), [plan])
  const start = useRef<number | null>(null)
  const done = useRef(false)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])
  const [shotIdx, setShotIdx] = useState(0)
  const [clock, setClock] = useState(() => missionClock(plan, 0))
  const [webgl, setWebgl] = useState(true)

  const finish = useCallback(() => {
    if (done.current) return
    done.current = true
    audio.hush()
    onDoneRef.current()
  }, [])

  const now = useMemo<Now>(() => {
    // Dev only: `&lt=<seconds>` freezes the show at that moment (screenshots, tuning)
    const frozen = import.meta.env.DEV ? parseFloat(new URLSearchParams(window.location.search).get('lt') ?? '') : NaN
    if (Number.isFinite(frozen)) return () => Math.min(plan.duration - 0.01, frozen)
    return () => (start.current === null ? 0 : Math.min(plan.duration, (performance.now() - start.current) / 1000))
  }, [plan])
  const begin = useCallback(() => {
    if (start.current === null) start.current = performance.now()
  }, [])

  // The show clock lives here, outside the Canvas, so captions, sounds and the end still run without WebGL
  useEffect(() => {
    start.current = null
    done.current = false
    const wait = window.setTimeout(begin, LOAD_WAIT_MS)
    let prev = -1
    let prevShot = -1
    const play = (id: AudioId) => {
      try {
        audio.play(id)
      } catch {
        // sound is decoration
      }
    }
    const tick = window.setInterval(() => {
      if (start.current === null) return
      const t = now()
      const idx = plan.shots.indexOf(shotAt(plan, t))
      if (idx !== prevShot) {
        prevShot = idx
        play(plan.shots[idx].cutSound)
        setShotIdx(idx)
      }
      for (const b of beatsBetween(beats, prev, t)) {
        if (b.sound) play(b.sound)
        if (b.voice) {
          try {
            audio.say(b.voice)
          } catch {
            // no voice
          }
        }
      }
      prev = t
      setClock(missionClock(plan, t))
      if (t >= plan.duration) finish()
    }, 50)
    return () => {
      window.clearTimeout(wait)
      window.clearInterval(tick)
    }
  }, [plan, beats, now, begin, finish])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish])

  const shot = plan.shots[shotIdx] ?? plan.shots[0]
  const lost = shot.id === 'lost'
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-ink-0" role="dialog" aria-label={`Launch of ${missionName}`}>
      {webgl && (
        <Boundary fallback={<NoWebGL onFail={() => setWebgl(false)} />}>
          <Canvas
            style={{ position: 'absolute', inset: 0 }}
            dpr={[1, 2]}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            camera={{ fov: 34, near: 0.5, far: 60000, position: [-70, 9, 160] }}
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping
            }}
          >
            <ShowScene plan={plan} now={now} onReady={begin} />
            <Effects preset="night" />
          </Canvas>
        </Boundary>
      )}
      {!webgl && <div className="absolute inset-0 bg-gradient-to-b from-ink-0 via-ink-1 to-[#3a2416]" />}
      {/* letterbox bars: it is a broadcast */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[6vh] bg-ink-0" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[11vh] bg-gradient-to-t from-ink-0 via-ink-0/85 to-transparent" />
      <button type="button" className="fp-btn-ghost absolute right-4 top-3" onClick={finish}>
        Skip ▸
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-1 px-4 text-center" aria-live="polite">
        <span className={`fp-label ${lost ? 'text-nogo' : ''}`}>
          {clock} · {missionName}
        </span>
        <span className={`text-base sm:text-lg ${lost ? 'text-nogo' : 'text-paper'}`}>{shot.caption}</span>
      </div>
    </div>
  )
}

function NoWebGL({ onFail }: { onFail: () => void }) {
  useEffect(() => onFail(), [onFail])
  return null
}
