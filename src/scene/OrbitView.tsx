import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { OrbitOption, OrbitView } from '../viz/orbit/orbitView'
import { stripCount } from '../viz/orbit/orbitView'
import { paintIce, ICE_SIZE } from '../viz/orbit/icePainter'
import {
  CAP_ANGLE_DEG,
  EARTH_DIR,
  SUN_DIR,
  azimuth,
  hiddenStretch,
  inStretch,
  meanAnomalyOf,
  orbitPoint,
  overCap,
  shapeFor,
  trueAnomaly,
  type OrbitShape,
  type Vec3,
} from '../viz/orbit/orbitGeometry'

/**
 * Step 4 as a view of the Moon from space (the Launch Site's Moon end): three
 * polar orbits as glowing rings, the craft flying the picked one, and the
 * south polar cap filling with mapped ice as the 12-month time-lapse runs.
 * Every number comes from the OrbitView model (computeBudgets / goNoGo).
 */

/** Months into the time-lapse (0..12), written by OrbitScreen every frame. */
export interface LapseClock {
  months: number
}

interface SceneProps {
  view: OrbitView
  lapse: RefObject<LapseClock | null>
  reduced: boolean
  onPick: (orbitId: string) => void
}

const TAU = Math.PI * 2
const DEG = Math.PI / 180
const v3 = (v: Vec3) => new THREE.Vector3(v[0], v[1], v[2])
const SUN = v3(SUN_DIR)
const EARTH_POS = v3(EARTH_DIR).multiplyScalar(15)
const LOOK_AT = new THREE.Vector3(0, -0.15, 0)

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Keeps the latest value readable inside useFrame without re-running effects. */
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref
}

/* ------------------------------------------------------------------ */
/* Sky                                                                  */
/* ------------------------------------------------------------------ */

function Stars() {
  const geometry = useMemo(() => {
    const r = seeded(11)
    const n = 2200
    const p = new Float32Array(n * 3)
    const v = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      const z = r() * 2 - 1
      const a = r() * TAU
      const s = Math.sqrt(1 - z * z)
      v.set(s * Math.cos(a), z, s * Math.sin(a)).multiplyScalar(90)
      p.set([v.x, v.y, v.z], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <points geometry={geometry}>
      <pointsMaterial color={0xcbd5e1} size={0.22} sizeAttenuation transparent opacity={0.8} />
    </points>
  )
}

function moonTexture() {
  const c = document.createElement('canvas')
  c.width = 2048
  c.height = 1024
  const x = c.getContext('2d') as CanvasRenderingContext2D
  const r = seeded(7)
  x.fillStyle = '#8b8d92'
  x.fillRect(0, 0, c.width, c.height)
  for (let i = 0; i < 26; i++) {
    const cx = r() * c.width
    const cy = (0.2 + r() * 0.5) * c.height
    const rad = 60 + r() * 170
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad)
    g.addColorStop(0, 'rgba(60,62,70,.55)')
    g.addColorStop(1, 'rgba(60,62,70,0)')
    x.fillStyle = g
    x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2)
  }
  for (let i = 0; i < 2600; i++) {
    const cy = r() * c.height
    const cx = r() * c.width
    const rad = r() ** 3 * 26 + 1.5
    const stretch = 1 / Math.max(0.25, Math.sin((cy / c.height) * Math.PI))
    x.save()
    x.translate(cx, cy)
    x.scale(stretch, 1)
    x.fillStyle = `rgba(50,52,58,${0.25 + r() * 0.3})`
    x.beginPath()
    x.arc(0, 0, rad, 0, TAU)
    x.fill()
    x.strokeStyle = `rgba(215,216,220,${0.25 + r() * 0.3})`
    x.lineWidth = Math.max(1, rad * 0.14)
    x.beginPath()
    x.arc(0, 0, rad, 3.6, 6.2)
    x.stroke()
    x.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function Moon() {
  const texture = useMemo(() => moonTexture(), [])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh>
      <sphereGeometry args={[1, 96, 64]} />
      <meshStandardMaterial map={texture} bumpMap={texture} bumpScale={2.2} roughness={1} metalness={0} />
    </mesh>
  )
}

function labelTexture(text: string) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const x = c.getContext('2d') as CanvasRenderingContext2D
  x.font = '600 34px ui-sans-serif, system-ui, sans-serif'
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillStyle = '#93c5fd'
  x.fillText(text, 128, 32)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Earth() {
  const label = useMemo(() => labelTexture('Earth'), [])
  useEffect(() => () => label.dispose(), [label])
  return (
    <group position={EARTH_POS}>
      <mesh>
        <sphereGeometry args={[0.42, 32, 24]} />
        <meshStandardMaterial color={0x3b82f6} emissive={0x1d4ed8} emissiveIntensity={0.5} roughness={0.7} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.5, 32, 24]} />
        <meshBasicMaterial color={0x60a5fa} transparent opacity={0.18} side={THREE.BackSide} />
      </mesh>
      <sprite position={[0, 0.85, 0]} scale={[1.6, 0.4, 1]}>
        <spriteMaterial map={label} transparent depthWrite={false} />
      </sprite>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* South polar cap                                                      */
/* ------------------------------------------------------------------ */

function capGeometry() {
  const cap = CAP_ANGLE_DEG * DEG
  const seg = 72
  const rings = 24
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let j = 0; j <= rings; j++)
    for (let i = 0; i <= seg; i++) {
      const rho = j / rings
      const th = (i / seg) * TAU
      const c = rho * cap
      const R = 1.004
      pos.push(R * Math.sin(c) * Math.cos(th), -R * Math.cos(c), R * Math.sin(c) * Math.sin(th))
      uv.push(0.5 + 0.5 * rho * Math.cos(th), 0.5 + 0.5 * rho * Math.sin(th))
    }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i
      const b = a + seg + 1
      idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

function IceCap({ view, lapse }: { view: OrbitView; lapse: SceneProps['lapse'] }) {
  const geometry = useMemo(() => capGeometry(), [])
  const paint = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = ICE_SIZE
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return { ctx: canvas.getContext('2d') as CanvasRenderingContext2D, texture }
  }, [])
  useEffect(
    () => () => {
      geometry.dispose()
      paint.texture.dispose()
    },
    [geometry, paint]
  )
  const latest = useLatest(view.selected)
  const painted = useRef('')
  useFrame(() => {
    const o = latest.current
    const strips = stripCount(o, lapse.current?.months ?? 12)
    const key = `${o.id}|${o.stripTone}|${strips}`
    if (key === painted.current) return
    painted.current = key
    paintIce(paint.ctx, { strips, tone: o.stripTone, angle0: (shapeFor(o.id).planeDeg + 90) * DEG })
    paint.texture.needsUpdate = true
  })
  return (
    <mesh geometry={geometry} renderOrder={1}>
      <meshBasicMaterial map={paint.texture} transparent side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* Orbit rings                                                          */
/* ------------------------------------------------------------------ */

function ringCurve(shape: OrbitShape) {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < 400; i++) pts.push(v3(orbitPoint(shape, (i / 400) * TAU)))
  return new THREE.CatmullRomCurve3(pts, true)
}

/** Mean anomaly of a point near the orbit (for colouring the tube's vertices). */
function meanAnomalyAt(shape: OrbitShape, p: THREE.Vector3) {
  const u = azimuth(shape.planeDeg + 90)
  const side = p.x * u[0] + p.z * u[2]
  return meanAnomalyOf(shape, Math.atan2(side, -p.y))
}

function Ring({
  option,
  picked,
  onPick,
}: {
  option: OrbitOption
  picked: boolean
  onPick: (id: string) => void
}) {
  const shape = shapeFor(option.id)
  const { gl } = useThree()
  const [hover, setHover] = useState(false)
  const { tube, pick } = useMemo(() => {
    const curve = ringCurve(shape)
    const tube = new THREE.TubeGeometry(curve, 600, 0.011, 8, true)
    const shadow = hiddenStretch(shape, SUN_DIR, 1 - option.sunlitPct / 100)
    const col = new THREE.Color(option.color)
    const P = tube.attributes.position
    const v = new THREE.Vector3()
    const cols: number[] = []
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i)
      let f = inStretch(shadow, meanAnomalyAt(shape, v)) ? 0.3 : 1
      f *= THREE.MathUtils.clamp(1 - (v.length() - 4.5) / 4.5, 0.12, 1)
      cols.push(col.r * f, col.g * f, col.b * f)
    }
    tube.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
    return { tube, pick: new THREE.TubeGeometry(curve, 200, 0.09, 6, true) }
  }, [shape, option.sunlitPct, option.color])
  useEffect(
    () => () => {
      tube.dispose()
      pick.dispose()
    },
    [tube, pick]
  )
  useEffect(() => {
    if (!hover) return
    gl.domElement.style.cursor = 'pointer'
    return () => {
      gl.domElement.style.cursor = ''
    }
  }, [hover, gl])

  return (
    <group>
      <mesh geometry={tube}>
        <meshBasicMaterial vertexColors transparent opacity={picked ? 1 : hover ? 0.55 : 0.22} depthWrite={false} />
      </mesh>
      <mesh
        geometry={pick}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          setHover(true)
        }}
        onPointerOut={() => setHover(false)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          if (e.delta > 6) return // that was a camera drag
          onPick(option.id)
        }}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The craft                                                            */
/* ------------------------------------------------------------------ */

const TRAIL = 60

function Craft({ option, reduced }: { option: OrbitOption; reduced: boolean }) {
  const shape = shapeFor(option.id)
  const craft = useRef<THREE.Group>(null)
  const dot = useRef<THREE.MeshBasicMaterial>(null)
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  const beam = useRef<THREE.Mesh>(null)
  const beamMat = useRef<THREE.MeshBasicMaterial>(null)
  const stretches = useMemo(
    () => ({
      sun: hiddenStretch(shape, SUN_DIR, 1 - option.sunlitPct / 100),
      earth: hiddenStretch(shape, EARTH_DIR, 1 - option.earthPct / 100),
    }),
    [shape, option.sunlitPct, option.earthPct]
  )
  const lines = useMemo(() => {
    const trail = new THREE.BufferGeometry()
    trail.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TRAIL * 3), 3))
    const home = new THREE.BufferGeometry()
    home.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3))
    return {
      trail: new THREE.Line(trail, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7 })),
      home: new THREE.Line(home, new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.45 })),
    }
  }, [])
  useEffect(
    () => () => {
      for (const l of [lines.trail, lines.home]) {
        l.geometry.dispose()
        ;(l.material as THREE.Material).dispose()
      }
    },
    [lines]
  )
  const pos = useMemo(() => new THREE.Vector3(), [])
  const surf = useMemo(() => new THREE.Vector3(), [])
  const Y = useMemo(() => new THREE.Vector3(0, 1, 0), [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const meanNow = reduced ? 0 : ((t / shape.period) % 1) * TAU
    const p = orbitPoint(shape, trueAnomaly(shape, meanNow))
    pos.set(p[0], p[1], p[2])
    craft.current?.position.copy(pos)

    const dark = inStretch(stretches.sun, meanNow)
    dot.current?.color.set(dark ? 0x64748b : 0xffffff)
    if (glow.current) glow.current.opacity = dark ? 0.08 : 0.28

    // Trail: where the craft was a moment ago
    const arr = lines.trail.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < TRAIL; i++) {
      const m = reduced ? 0 : (((t - i * 0.012 * shape.period) / shape.period) % 1) * TAU
      const q = orbitPoint(shape, trueAnomaly(shape, m))
      arr.set(q, i * 3)
    }
    lines.trail.geometry.attributes.position.needsUpdate = true
    ;(lines.trail.material as THREE.LineBasicMaterial).color.set(option.color)
    lines.trail.visible = !reduced

    // Line home, cut for the share of the time Earth is out of view
    const seesEarth = !inStretch(stretches.earth, meanNow)
    lines.home.visible = seesEarth
    if (seesEarth) {
      const h = lines.home.geometry.attributes.position.array as Float32Array
      h.set([pos.x, pos.y, pos.z, EARTH_POS.x, EARTH_POS.y, EARTH_POS.z])
      lines.home.geometry.attributes.position.needsUpdate = true
    }

    // Sensor beam over the polar cap
    const b = beam.current
    const show = option.stripTone !== 'none' && overCap(p)
    if (b && beamMat.current) {
      b.visible = show
      if (show) {
        surf.copy(pos).normalize()
        const h = pos.length() - 1
        const ice = option.stripTone === 'ice'
        b.position.copy(surf).multiplyScalar(1 + h / 2)
        b.scale.set(ice ? 0.05 : 0.02, h, ice ? 0.05 : 0.02)
        b.quaternion.setFromUnitVectors(Y, surf)
        beamMat.current.color.set(ice ? 0x22d3ee : 0xfbbf24)
        beamMat.current.opacity = ice ? 0.45 : reduced ? 0.35 : 0.25 + 0.2 * Math.sin(t * 11)
      }
    }
  })

  return (
    <group>
      <group ref={craft}>
        <mesh>
          <sphereGeometry args={[0.035, 16, 12]} />
          <meshBasicMaterial ref={dot} color={0xffffff} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.075, 16, 12]} />
          <meshBasicMaterial ref={glow} color={0xffffff} transparent opacity={0.28} depthWrite={false} />
        </mesh>
      </group>
      <primitive object={lines.trail} />
      <primitive object={lines.home} />
      <mesh ref={beam} visible={false}>
        <coneGeometry args={[1, 1, 24, 1, true]} />
        <meshBasicMaterial ref={beamMat} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Camera: drag to look around, scroll to zoom, slow sway when idle    */
/* ------------------------------------------------------------------ */

function CameraRig({ targetDist, reduced }: { targetDist: number; reduced: boolean }) {
  const { camera, gl } = useThree()
  const cam = useRef({ yaw: 212 * DEG, pitch: -0.42, dist: targetDist, target: targetDist })
  const drag = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    cam.current.target = targetDist
  }, [targetDist])

  useEffect(() => {
    const el = gl.domElement
    const down = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY }
      el.style.cursor = 'grabbing'
    }
    const move = (e: PointerEvent) => {
      if (!drag.current) return
      const c = cam.current
      c.yaw += (e.clientX - drag.current.x) * 0.006
      c.pitch = THREE.MathUtils.clamp(c.pitch - (e.clientY - drag.current.y) * 0.005, -1.35, 0.9)
      drag.current = { x: e.clientX, y: e.clientY }
    }
    const up = () => {
      drag.current = null
      el.style.cursor = ''
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const c = cam.current
      c.target = THREE.MathUtils.clamp(c.target * (1 + e.deltaY * 0.001), 3, 14)
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl])

  useFrame((state) => {
    const c = cam.current
    c.dist = reduced ? c.target : c.dist + (c.target - c.dist) * 0.05
    // A gentle sway around where the player left the camera, so the idle view stays on the lit side
    const yaw = reduced ? c.yaw : c.yaw + 0.25 * Math.sin(state.clock.elapsedTime * 0.07)
    camera.position
      .set(Math.cos(yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.sin(yaw) * Math.cos(c.pitch))
      .multiplyScalar(c.dist)
    camera.lookAt(LOOK_AT)
  })
  return null
}

/* ------------------------------------------------------------------ */

export function OrbitScene({ view, lapse, reduced, onPick }: SceneProps) {
  const selected = view.selected
  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, 2]}
      camera={{ fov: 42, near: 0.05, far: 200, position: [0, -2, 6] }}
      gl={{ antialias: true }}
      aria-hidden
    >
      <color attach="background" args={[0x03050a]} />
      <CameraRig targetDist={shapeFor(selected.id).camDist} reduced={reduced} />
      <directionalLight position={SUN.clone().multiplyScalar(20)} intensity={3.1} color={0xfff4e0} />
      <ambientLight intensity={0.16} color={0x8fa3c8} />
      <Stars />
      <Moon />
      <Earth />
      <IceCap view={view} lapse={lapse} />
      {view.options.map((o) => (
        <Ring key={o.id} option={o} picked={o.id === selected.id} onPick={onPick} />
      ))}
      {selected.reachable && <Craft key={selected.id} option={selected} reduced={reduced} />}
    </Canvas>
  )
}
