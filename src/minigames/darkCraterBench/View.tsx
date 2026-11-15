import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { MinigameProps } from '../contract'
import { audio } from '../../assets/audio'
import { sayRoom } from '../../assets/ihVoice'
import { useModel } from '../../assets/models'
import type { ModelId } from '../../assets/manifest'
import { instrumentLock } from '../../scene/instrumentStage/labLocks'
import { INSTRUMENT_COLORS } from '../../scene/instrumentStage/stageModel'
import { StageBoundary } from '../../scene/instrumentStage/StageBoundary'
import { useAgencyStore } from '../../state/agencyStore'
import {
  GRID,
  INSTRUMENT_IDS,
  MAX_INSTRUMENTS_ABOARD,
  SCANNERS,
  VERTS,
  addToTray,
  brightness,
  buildBench,
  buildResult,
  foundStats,
  getInstrument,
  heightAt,
  litMap,
  newScan,
  powerNeedle,
  reelFill,
  scanStep,
  shortName,
  trayCheck,
  type Bench,
  type ScanState,
} from './logic'

/* ---------------------------------------------------------------- layout */

/** Ground level of the model on the bench */
const TY = 0.3
const LAMP_R = 1.3
const SHELF_X = -2.25
const SHELF_Z = [-0.95, -0.32, 0.32, 0.95]
const TRAY_X = 2.15
const TRAY_SLOT_Z = [-0.35, 0.35]
const TRAY_HALF = { x: 0.55, z: 0.8 }
const HOLD_Y = TY + 0.6

const col = (id: string) => INSTRUMENT_COLORS[id] ?? '#94a3b8'

/* ---------------------------------------------------------------- shared live state */

interface Live {
  /** Pointer on the bench plane */
  x: number
  z: number
  /** Smoothed sweep speed */
  speed: number
  scanning: boolean
  tooFast: boolean
  /** Reel fill 0..1 and needle 0..1 of the last-held instrument */
  fill: number
  needle: number
  spin: number
  lampDrag: boolean
}

interface Status {
  scanning: boolean
  tooFast: boolean
  icePct: number
  shadowPct: number
}

declare global {
  interface Window {
    __benchDev?: {
      project: (x: number, y: number, z: number) => { x: number; y: number }
      state: () => { held: string | null; tray: string[]; az: number; stats: Record<string, ReturnType<typeof foundStats>> }
      layout: { shelf: number[][]; tray: number[]; lampR: number; ty: number }
    }
  }
}

/* ---------------------------------------------------------------- bits of scene */

function Studio() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const p = new THREE.PMREMGenerator(gl)
    const t = p.fromScene(new RoomEnvironment(), 0.04).texture
    p.dispose()
    scene.environment = t
    scene.environmentIntensity = 0.7
    return () => {
      scene.environment = null
      t.dispose()
    }
  }, [gl, scene])
  return null
}

/** A catalogue GLB centred on its group's origin and scaled so its longest side is `size` */
function Part({ id, size }: { id: string; size: number }) {
  const model = useModel(`model.${id}` as ModelId)
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model)
    const c = box.getCenter(new THREE.Vector3())
    const d = box.getSize(new THREE.Vector3())
    const s = size / Math.max(d.x, d.y, d.z)
    return { s, off: [-c.x * s, -c.y * s, -c.z * s] as [number, number, number] }
  }, [model, size])
  return (
    <group position={fit.off}>
      <group scale={fit.s}>
        <primitive object={model} />
      </group>
    </group>
  )
}

function PartBlock({ id, size }: { id: string; size: number }) {
  return (
    <StageBoundary
      fallback={
        <mesh>
          <boxGeometry args={[size * 0.5, size * 0.5, size]} />
          <meshStandardMaterial color={col(id)} />
        </mesh>
      }
    >
      <Suspense fallback={null}>
        <Part id={id} size={size} />
      </Suspense>
    </StageBoundary>
  )
}

/** The crater, the skirt that closes its sides and the overlay of discovered ice */
function Terrain({ bench, lit, az, scans, live }: { bench: Bench; lit: Uint8Array; az: number; scans: Record<string, ScanState>; live: React.MutableRefObject<Live> }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(VERTS * 3)
    for (let v = 0; v < VERTS; v++) {
      pos[v * 3] = bench.px[v]
      pos[v * 3 + 1] = bench.py[v]
      pos[v * 3 + 2] = bench.pz[v]
    }
    const idx: number[] = []
    const W = GRID + 1
    for (let j = 0; j < GRID; j++)
      for (let i = 0; i < GRID; i++) {
        const a = j * W + i
        idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1)
      }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3))
    g.setIndex(idx)
    return g
  }, [bench])
  const overlay = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(geo.getAttribute('position').array as Float32Array)
    for (let v = 0; v < VERTS; v++) pos[v * 3 + 1] += 0.006
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(VERTS * 4), 4))
    g.setIndex(geo.getIndex())
    return g
  }, [geo])
  const skirt = useMemo(() => {
    const W = GRID + 1
    const edges: number[][] = [[], [], [], []]
    for (let i = 0; i < W; i++) {
      edges[0].push(i)
      edges[1].push((W - 1) * W + i)
      edges[2].push(i * W)
      edges[3].push(i * W + W - 1)
    }
    const pos: number[] = []
    const idx: number[] = []
    for (const e of edges) {
      const base = pos.length / 3
      for (const v of e) {
        pos.push(bench.px[v], bench.py[v], bench.pz[v], bench.px[v], -TY, bench.pz[v])
      }
      for (let k = 0; k < e.length - 1; k++) {
        const a = base + k * 2
        idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3, a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
    g.setIndex(idx)
    return g
  }, [bench])

  // Bake the lamp's light into the ground colours: lit cells grey, shadow near black
  useEffect(() => {
    const c = geo.getAttribute('color') as THREE.BufferAttribute
    for (let v = 0; v < VERTS; v++) {
      const b = brightness(bench, lit, v, az)
      const tint = lit[v] ? 1 : 0.8
      c.setXYZ(v, b * 0.86, b * 0.85 * tint, b * 0.82 * (lit[v] ? 1 : 1.5))
    }
    c.needsUpdate = true
  }, [bench, lit, az, geo])

  // The discovered-ice overlay: each instrument's find in its own colour, swept lanes faint
  const dirty = useRef(true)
  const since = useRef(0)
  useFrame((_, dt) => {
    if (live.current.scanning) dirty.current = true
    since.current += dt
    if (!dirty.current || since.current < 0.1) return
    since.current = 0
    dirty.current = false
    const c = overlay.getAttribute('color') as THREE.BufferAttribute
    const colors = INSTRUMENT_IDS.map((id) => new THREE.Color(col(id)))
    for (let v = 0; v < VERTS; v++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      INSTRUMENT_IDS.forEach((id, k) => {
        const s = scans[id]
        if (!s) return
        const hydro = SCANNERS[id].sees === 'hydrogen'
        const na = s.found[v] ? (hydro ? 0.25 + 0.5 * bench.hydrogen[v] : 0.9) : s.looked[v] ? 0.1 : 0
        if (na > a) {
          a = na
          r = colors[k].r
          g = colors[k].g
          b = colors[k].b
        }
      })
      c.setXYZW(v, r, g, b, a)
    }
    c.needsUpdate = true
  })

  return (
    <group position={[0, TY, 0]}>
      <mesh geometry={geo}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={overlay} renderOrder={2}>
        <meshBasicMaterial vertexColors transparent depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh geometry={skirt}>
        <meshStandardMaterial color="#1a1e26" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/** The desk lamp: a gooseneck on a ring around the crater; drag its head to move the Sun */
function Lamp({ az, live, onGrab }: { az: number; live: React.MutableRefObject<Live>; onGrab: () => void }) {
  const bx = Math.cos(az) * LAMP_R
  const bz = Math.sin(az) * LAMP_R
  const headY = TY + Math.tan((12 * Math.PI) / 180) * LAMP_R + 0.1
  const arm = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.45, 0),
      new THREE.Vector3(0.05, headY - 0.1, 0),
    ])
    return new THREE.TubeGeometry(curve, 16, 0.018, 8)
  }, [headY])
  return (
    <group position={[bx, 0, bz]} rotation={[0, -az, 0]}>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.13, 0.15, 0.04, 24]} />
        <meshStandardMaterial color="#3a404a" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh geometry={arm}>
        <meshStandardMaterial color="#59616d" metalness={0.7} roughness={0.35} />
      </mesh>
      {/* head: a shade turned to face the crater (local -x is toward the centre after the rotation) */}
      <group
        position={[0.05, headY, 0]}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          live.current.lampDrag = true
          onGrab()
        }}
        onPointerOver={() => (document.body.style.cursor = 'grab')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <mesh rotation={[0, 0, -Math.PI / 2 + 0.3]} position={[-0.06, 0, 0]}>
          <coneGeometry args={[0.15, 0.22, 24, 1, true]} />
          <meshStandardMaterial color="#d9a441" side={THREE.DoubleSide} metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[-0.12, -0.01, 0]}>
          <sphereGeometry args={[0.07, 16, 12]} />
          <meshBasicMaterial color="#fff4cf" toneMapped={false} />
        </mesh>
        <pointLight position={[-0.2, 0, 0]} intensity={1.4} distance={2.2} color="#ffe9b8" />
      </group>
    </group>
  )
}

/** The tape recorder: its reel fills at the instrument's data rate and its needle follows the power draw */
function Recorder({ live }: { live: React.MutableRefObject<Live> }) {
  const tape = useRef<THREE.Mesh>(null)
  const supply = useRef<THREE.Mesh>(null)
  const spokes = useRef<THREE.Group[]>([])
  const needle = useRef<THREE.Group>(null)
  const needleV = useRef(0)
  useFrame((_, dt) => {
    const l = live.current
    const f = l.fill
    tape.current?.scale.set(0.35 + f * 0.9, 1, 0.35 + f * 0.9)
    supply.current?.scale.set(1.25 - f * 0.9, 1, 1.25 - f * 0.9)
    spokes.current.forEach((g) => g && (g.rotation.y -= l.spin * dt))
    needleV.current += (l.needle - needleV.current) * Math.min(1, dt * 4)
    if (needle.current) needle.current.rotation.y = 1.05 - needleV.current * 2.1
  })
  const reel = (x: number, which: 'tape' | 'supply', k: number) => (
    <group position={[x, 0.1, 0]}>
      <mesh ref={which === 'tape' ? tape : supply} position={[0, 0.01, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.03, 32]} />
        <meshStandardMaterial color={which === 'tape' ? '#3a2f26' : '#2b2420'} roughness={0.6} />
      </mesh>
      <group ref={(g) => { if (g) spokes.current[k] = g }}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0.04, 0]} rotation={[0, (i * Math.PI) / 3, 0]}>
            <boxGeometry args={[0.34, 0.012, 0.03]} />
            <meshStandardMaterial color="#c9ced6" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}
        <mesh position={[0, 0.045, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.03, 16]} />
          <meshStandardMaterial color="#8d95a1" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
    </group>
  )
  return (
    <group position={[0, 0, 1.75]}>
      <mesh position={[0, 0.045, 0]}>
        <boxGeometry args={[1.6, 0.09, 0.62]} />
        <meshStandardMaterial color="#2b3038" metalness={0.3} roughness={0.55} />
      </mesh>
      {reel(-0.5, 'tape', 0)}
      {reel(0.5, 'supply', 1)}
      {/* power gauge: a flat dial with a needle */}
      <group position={[0, 0.1, 0.02]}>
        <mesh>
          <cylinderGeometry args={[0.2, 0.2, 0.012, 32, 1, false, -Math.PI * 0.33, Math.PI * 0.66]} />
          <meshStandardMaterial color="#d8cfbc" roughness={0.8} />
        </mesh>
        <group ref={needle} position={[0, 0.012, 0.08]}>
          <mesh position={[0, 0, -0.1]}>
            <boxGeometry args={[0.008, 0.01, 0.2]} />
            <meshBasicMaterial color="#e8603d" toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** The payload tray on its scale: needle for the mass, a stack of coins for the cost */
function TrayScale({ tray, check, onDrop, onPick, onHover }: { tray: string[]; check: ReturnType<typeof trayCheck>; onDrop: () => void; onPick: (id: string) => void; onHover: (id: string | null) => void }) {
  const needle = useRef<THREE.Group>(null)
  const plate = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    const target = 1.0 - Math.min(1, check.mass / 6) * 2.0
    if (needle.current) needle.current.rotation.z += (target - needle.current.rotation.z) * Math.min(1, dt * 5)
    if (plate.current) plate.current.position.y += (-Math.min(1, check.mass / 6) * 0.03 - plate.current.position.y) * Math.min(1, dt * 6)
  })
  const coins = Math.max(0, Math.ceil(check.cost))
  return (
    <group position={[TRAY_X, 0, 0]}>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[1.25, 0.12, 1.75]} />
        <meshStandardMaterial color="#232830" metalness={0.5} roughness={0.5} />
      </mesh>
      <group ref={plate}>
        <mesh
          position={[0, 0.14, 0]}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            onDrop()
          }}
          data-tray
        >
          <boxGeometry args={[1.1, 0.04, 1.6]} />
          <meshStandardMaterial color={check.ok ? '#3d4654' : '#6b3a30'} metalness={0.6} roughness={0.4} />
        </mesh>
        {TRAY_SLOT_Z.map((z, k) => (
          <group key={k}>
            <mesh position={[0, 0.162, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.3, 0.33, 40]} />
              <meshBasicMaterial color="#9aa6b6" transparent opacity={tray[k] ? 0.15 : 0.7} />
            </mesh>
            {tray[k] && (
              <group
                position={[0, 0.3, z]}
                rotation={[0.4, 0.5, 0]}
                onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                  e.stopPropagation()
                  onPick(tray[k])
                }}
                onPointerOver={() => {
                  document.body.style.cursor = 'pointer'
                  onHover(tray[k])
                }}
                onPointerOut={() => {
                  document.body.style.cursor = ''
                  onHover(null)
                }}
              >
                <PartBlock id={tray[k]} size={0.5} />
              </group>
            )}
          </group>
        ))}
      </group>
      {/* the dial behind the tray */}
      <group position={[0.1, 0.52, -1.05]}>
        <mesh>
          <cylinderGeometry args={[0.3, 0.3, 0.04, 40]} />
          <meshStandardMaterial color="#d8cfbc" roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.26, 0]}>
          <boxGeometry args={[0.08, 0.5, 0.06]} />
          <meshStandardMaterial color="#232830" />
        </mesh>
        <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.03]}>
          <group ref={needle}>
            <mesh position={[0, 0.0, -0.13]} rotation={[Math.PI / 2, 0, 0]}>
              <boxGeometry args={[0.012, 0.26, 0.012]} />
              <meshBasicMaterial color="#e8603d" toneMapped={false} />
            </mesh>
          </group>
        </group>
      </group>
      {/* coins: one per $1M, rounded up */}
      <group position={[-0.35, 0.16, 1.0]}>
        {Array.from({ length: coins }).map((_, i) => (
          <mesh key={i} position={[(i % 2) * 0.01, 0.01 + i * 0.022, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.018, 20]} />
            <meshStandardMaterial color="#e0b13d" metalness={0.9} roughness={0.3} />
          </mesh>
        ))}
      </group>
      <Html position={[0, 0.95, -1.05]} center distanceFactor={7} style={{ pointerEvents: 'none' }}>
        <div data-testid="bench-scale" className="whitespace-nowrap bg-ink-1/80 px-2 py-1 text-center text-xs text-paper">
          {tray.length === 0 ? 'Payload tray' : `${check.mass.toFixed(1)} kg · $${check.cost.toFixed(1)}M · ${tray.length}/${MAX_INSTRUMENTS_ABOARD}`}
        </div>
      </Html>
    </group>
  )
}

/** One frame loop: pointer on the bench, lamp dragging, scanning, readouts, held instrument and its beam */
function Sim({
  bench,
  lit,
  held,
  scans,
  live,
  tray,
  onLamp,
  onStatus,
  onActivity,
  onScanStart,
}: {
  bench: Bench
  lit: Uint8Array
  held: string | null
  scans: Record<string, ScanState>
  live: React.MutableRefObject<Live>
  tray: string[]
  onLamp: (az: number) => void
  onStatus: (s: Status) => void
  onActivity: () => void
  onScanStart: () => void
}) {
  const { camera, pointer, raycaster } = useThree()
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -TY), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const prev = useRef({ x: 0, z: 0, ok: false })
  const group = useRef<THREE.Group>(null)
  const cone = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const lastStatus = useRef(0)
  const lastAz = useRef(0)
  const whir = useRef(0)
  const wasScanning = useRef(false)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__benchDev = {
      project: (x, y, z) => {
        const v = new THREE.Vector3(x, y, z).project(camera)
        const r = (document.querySelector('[data-testid="bench-canvas"]') as HTMLElement).getBoundingClientRect()
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
      },
      state: () => ({
        held,
        tray,
        az: lastAz.current,
        stats: Object.fromEntries(INSTRUMENT_IDS.map((id) => [id, foundStats(bench, scans[id])])),
      }),
      layout: { shelf: SHELF_Z.map((z) => [SHELF_X, z]), tray: [TRAY_X, 0], lampR: LAMP_R, ty: TY },
    }
    return () => {
      delete window.__benchDev
    }
  }, [camera, held, tray, bench, scans])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const l = live.current
    raycaster.setFromCamera(pointer, camera)
    const ok = raycaster.ray.intersectPlane(plane, hit) !== null
    if (ok) {
      const dx = hit.x - prev.current.x
      const dz = hit.z - prev.current.z
      const inst = prev.current.ok && dt > 0 ? Math.hypot(dx, dz) / dt : 0
      l.speed += (inst - l.speed) * Math.min(1, dt * 12)
      l.x = hit.x
      l.z = hit.z
    } else l.speed = 0
    prev.current = { x: l.x, z: l.z, ok }

    if (l.lampDrag) {
      const az = Math.atan2(l.z, l.x)
      if (Math.abs(az - lastAz.current) > 0.004) {
        lastAz.current = az
        onLamp(az)
      }
      onActivity()
    }

    let scanning = false
    let tooFast = false
    if (held && !l.lampDrag) {
      const spec = SCANNERS[held]
      const inst = getInstrument(held)
      const r = scanStep(bench, lit, spec, scans[held], l.x, l.z, dt, l.speed)
      scanning = r.active && !r.tooFast
      tooFast = r.tooFast
      l.fill = reelFill(inst, scans[held].seconds)
      l.needle = scanning ? powerNeedle(inst) : 0
      l.spin = scanning ? 2 + (inst.dataPerTurn / 1500) * 14 : 0
      if (scanning) onActivity()
      // the held instrument hangs over the pointer with its beam on the ground
      if (group.current) {
        group.current.position.set(l.x, HOLD_Y, l.z)
        const gy = TY + heightAt(l.x, l.z)
        if (cone.current) {
          const h = HOLD_Y - gy - 0.1
          cone.current.position.set(0, -0.1 - h / 2, 0)
          cone.current.scale.set(spec.radius, h, spec.radius)
          const m = cone.current.material as THREE.MeshBasicMaterial
          m.color.set(tooFast ? '#ff6b4a' : col(held))
          m.opacity = scanning ? 0.32 : 0.14
        }
        if (ring.current) {
          ring.current.position.set(0, gy - HOLD_Y + 0.02, 0)
          ring.current.scale.set(spec.radius, spec.radius, 1)
          ;(ring.current.material as THREE.MeshBasicMaterial).color.set(tooFast ? '#ff6b4a' : col(held))
        }
      }
    } else {
      l.needle = 0
      l.spin = 0
    }
    l.scanning = scanning
    l.tooFast = tooFast

    if (scanning) {
      whir.current -= dt
      if (!wasScanning.current || whir.current <= 0) {
        whir.current = 3
        onScanStart()
      }
    }
    wasScanning.current = scanning

    lastStatus.current += dt
    if (lastStatus.current > 0.15) {
      lastStatus.current = 0
      const st = held ? foundStats(bench, scans[held]) : { icePct: 0, shadowPct: 0 }
      onStatus({ scanning, tooFast, ...st })
    }
  })

  return (
    <group ref={group} visible={!!held}>
      {held && (
        <>
          <group rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
            <PartBlock id={held} size={0.34} />
          </group>
          <mesh ref={cone} raycast={() => null} renderOrder={3}>
            <coneGeometry args={[1, 1, 28, 1, true]} />
            <meshBasicMaterial transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
          </mesh>
          <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={3}>
            <ringGeometry args={[0.9, 1, 40]} />
            <meshBasicMaterial transparent opacity={0.9} depthWrite={false} depthTest={false} />
          </mesh>
        </>
      )}
    </group>
  )
}

/* ---------------------------------------------------------------- the screen */

const HOVER_LINE: Record<string, (i: ReturnType<typeof getInstrument>) => string> = {
  'inst-camera': (i) => `A camera needs light: sharp where the lamp reaches, black in shadow. It records ${i.dataPerTurn} MB a month.`,
  'inst-ir-spec': (i) => `Reads ice's fingerprint in reflected sunlight, so shadows stay blank. It draws ${-i.power} W.`,
  'inst-laser': (i) => `Brings its own light, so it works in the dark, but sees a thin strip: sweep slowly. It draws ${-i.power} W.`,
  'inst-neutron': (i) => `Senses hydrogen through dark and rock, but its picture is blurry. It draws only ${-i.power} W.`,
}

const FC_BENCH: FC<MinigameProps> = ({ onComplete, onExit, replay }) => {
  const bench = useMemo(buildBench, [])
  const scans = useMemo(() => Object.fromEntries(INSTRUMENT_IDS.map((id) => [id, newScan()])) as Record<string, ScanState>, [])
  const live = useRef<Live>({ x: 0, z: 0, speed: 0, scanning: false, tooFast: false, fill: 0, needle: 0, spin: 0, lampDrag: false })
  const t0 = useRef(performance.now())
  const day = useAgencyStore((s) => s.day)

  const [az, setAz] = useState(0.9)
  const lit = useMemo(() => litMap(bench, az), [bench, az])
  const [held, setHeld] = useState<string | null>(null)
  const [tray, setTray] = useState<string[]>([])
  const [hover, setHover] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ scanning: false, tooFast: false, icePct: 0, shadowPct: 0 })

  const heldRef = useRef<string | null>(null)
  heldRef.current = held
  const trayRef = useRef<string[]>([])
  trayRef.current = tray
  const lastActive = useRef(performance.now())
  const hinted = useRef(false)
  const noteTimer = useRef<number | null>(null)

  const activity = useCallback(() => {
    lastActive.current = performance.now()
    hinted.current = false
  }, [])
  const flash = useCallback((text: string) => {
    setNote(text)
    if (noteTimer.current) window.clearTimeout(noteTimer.current)
    noteTimer.current = window.setTimeout(() => setNote(null), 3500)
  }, [])

  useEffect(() => {
    sayRoom('science-lab', 'intro')
    const id = window.setInterval(() => {
      if (!hinted.current && performance.now() - lastActive.current > 20000) {
        hinted.current = true
        sayRoom('science-lab', 'hint')
      }
    }, 1000)
    const up = () => {
      live.current.lampDrag = false
      // released over the tray: the instrument goes in (a real drag and drop)
      const l = live.current
      if (heldRef.current && Math.abs(l.x - 2.15) < TRAY_HALF.x && Math.abs(l.z) < TRAY_HALF.z) drop()
    }
    window.addEventListener('pointerup', up)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('pointerup', up)
      if (noteTimer.current) window.clearTimeout(noteTimer.current)
      document.body.style.cursor = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = useCallback(
    (id: string) => {
      activity()
      const lock = instrumentLock(id, day)
      if (lock.locked) {
        flash(lock.text)
        return
      }
      setTray((t) => t.filter((x) => x !== id))
      setHeld(id)
      setHover(null)
      live.current.fill = reelFill(getInstrument(id), scans[id].seconds)
      audio.play('sfx.ih-part-click')
    },
    [activity, day, flash, scans],
  )

  function drop() {
    const id = heldRef.current
    if (!id) return
    activity()
    const next = addToTray(trayRef.current, id)
    if (next === trayRef.current) {
      flash(`The tray holds ${MAX_INSTRUMENTS_ABOARD} instruments. Take one out first.`)
      return
    }
    const c = trayCheck(next)
    if (!c.ok) {
      flash(c.reason)
      return
    }
    setTray(next)
    setHeld(null)
    audio.play('sfx.ih-part-click')
    audio.play('sfx.ih-coin-drop')
  }

  const putBack = useCallback(() => {
    if (heldRef.current) {
      setHeld(null)
      activity()
    }
  }, [activity])

  const check = useMemo(() => trayCheck(tray), [tray])
  const holdsDark = tray.some((id) => getInstrument(id).seesShadow)

  const lock = () => {
    sayRoom('science-lab', 'success')
    onComplete(buildResult(bench, tray, scans, (performance.now() - t0.current) / 1000))
  }

  const caption = (() => {
    if (note) return note
    const shown = hover ?? held
    if (hover) return `${shortName(hover)}: ${HOVER_LINE[hover](getInstrument(hover))}`
    if (held && status.tooFast) return `Too fast: the ${shortName(held)} needs to linger. Slow down.`
    if (held && status.scanning) {
      const i = getInstrument(held)
      return `${shortName(held)} · ${-i.power} W · ${i.dataPerTurn} MB/month`
    }
    if (shown) return `${shortName(shown)}: ${HOVER_LINE[shown](getInstrument(shown))}`
    if (tray.length > 0 && !holdsDark) return 'Nothing in the tray sees into shadow. Is that what you want?'
    if (tray.length > 0) return 'Take any instrument back out to test it more, or lock in the payload.'
    return 'Pick up an instrument and sweep it over the crater. Drag the lamp to move the Sun.'
  })()

  return (
    <div className="relative h-full w-full bg-ink-0" data-testid="bench-root" onPointerDown={activity}>
      <Canvas
        data-testid="bench-canvas"
        camera={{ position: [0, 3.7, 4.7], fov: 45, near: 0.1, far: 30 }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0.45)}
        gl={{ antialias: true }}
        onContextMenu={(e) => {
          e.preventDefault()
          putBack()
        }}
      >
        <color attach="background" args={['#090c12']} />
        <Studio />
        <ambientLight intensity={0.25} />
        <directionalLight position={[2, 5, 3]} intensity={0.5} />
        <mesh position={[0, -0.08, 0.2]}>
          <boxGeometry args={[6.6, 0.16, 5]} />
          <meshStandardMaterial color="#1c2129" roughness={0.8} />
        </mesh>
        <Terrain bench={bench} lit={lit} az={az} scans={scans} live={live} />
        <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <ringGeometry args={[LAMP_R - 0.015, LAMP_R + 0.015, 96]} />
          <meshBasicMaterial color="#6b7380" />
        </mesh>
        <Lamp az={az} live={live} onGrab={activity} />
        <Recorder live={live} />

        {INSTRUMENT_IDS.map((id, k) => {
          const away = held === id || tray.includes(id)
          const locked = instrumentLock(id, day).locked
          return (
            <group key={id} position={[SHELF_X, 0, SHELF_Z[k]]}>
              <mesh position={[0, 0.05, 0]}>
                <boxGeometry args={[0.7, 0.1, 0.5]} />
                <meshStandardMaterial color="#232830" metalness={0.4} roughness={0.6} />
              </mesh>
              {!away && (
                <group
                  position={[0, 0.34, 0]}
                  rotation={[0.35, 0.6, 0]}
                  onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                    e.stopPropagation()
                    pick(id)
                  }}
                  onPointerOver={() => {
                    document.body.style.cursor = locked ? 'not-allowed' : 'pointer'
                    setHover(id)
                  }}
                  onPointerOut={() => {
                    document.body.style.cursor = ''
                    setHover(null)
                  }}
                >
                  <PartBlock id={id} size={0.5} />
                </group>
              )}
            </group>
          )
        })}

        <TrayScale tray={tray} check={check} onDrop={drop} onPick={pick} onHover={setHover} />
        <Sim
          bench={bench}
          lit={lit}
          held={held}
          scans={scans}
          live={live}
          tray={tray}
          onLamp={setAz}
          onStatus={(s) => setStatus((p) => (p.scanning === s.scanning && p.tooFast === s.tooFast && p.icePct === s.icePct ? p : s))}
          onActivity={activity}
          onScanStart={() => audio.play('sfx.ih-tape-reel-whir')}
        />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-4">
        <div data-testid="bench-caption" className="max-w-3xl bg-ink-1/85 px-4 py-2 text-center text-sm text-paper">
          {caption}
        </div>
      </div>
      <div className="absolute bottom-5 right-5 flex gap-3">
        <button type="button" className="fp-btn-secondary" onClick={onExit} data-testid="bench-exit">
          {replay ? 'Skip' : 'Back to campus'}
        </button>
        {tray.length > 0 && (
          <button type="button" className="fp-btn-primary" onClick={lock} data-testid="room-complete">
            Lock in payload
          </button>
        )}
      </div>
    </div>
  )
}

export default FC_BENCH
