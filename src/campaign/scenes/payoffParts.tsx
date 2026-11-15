/**
 * Shared pieces for the payoff shows: the show clock, a model loader that never throws,
 * GPU particle bursts (dust sheets, debris, plasma trails), rocket plumes, glow sprites
 * and the lunar ground.
 */
import { Component, Suspense, createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { assetUrl, useModel, type ModelId } from '../../assets'

/* ---------------- show clock ---------------- */

/** Seconds since the show started; advanced by PayoffShow, read by every scene each frame */
export type ShowTime = { current: number }
export const ShowClock = createContext<ShowTime>({ current: 0 })
export const useShowTime = () => useContext(ShowClock)

/* ---------------- models ---------------- */

class ModelBoundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}

interface FitProps {
  id: ModelId
  /** Scale so the model is this tall (metres), standing on y = 0, centred in x/z */
  height?: number
  /** Or scale so its longest side is this long, centred on the origin */
  maxDim?: number
  shadows?: boolean
}

function LoadedModel({ id, height, maxDim, shadows = true }: FitProps) {
  const scene = useModel(id)
  const fitted = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    let s = 1
    if (height) s = height / Math.max(size.y, 1e-6)
    else if (maxDim) s = maxDim / Math.max(size.x, size.y, size.z, 1e-6)
    const y = height ? -box.min.y * s : -center.y * s
    return { s, offset: [-center.x * s, y, -center.z * s] as [number, number, number] }
  }, [scene, height, maxDim])
  useLayoutEffect(() => {
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = shadows
        o.receiveShadow = shadows
      }
    })
  }, [scene, shadows])
  return (
    <group position={fitted.offset} scale={fitted.s}>
      <primitive object={scene} />
    </group>
  )
}

/** A manifest model, sized to fit; shows `fallback` while loading and if it fails to load */
export function SafeModel({ fallback = null, ...props }: FitProps & { fallback?: ReactNode }) {
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedModel {...props} />
      </Suspense>
    </ModelBoundary>
  )
}

/** Any subtree that may suspend or throw (textures), with a fallback */
export function Safe({ fallback = null, children }: { fallback?: ReactNode; children: ReactNode }) {
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ModelBoundary>
  )
}

/* ---------------- deterministic randomness ---------------- */

export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/* ---------------- glow texture ---------------- */

const glowCache = new Map<string, THREE.Texture>()
/** Soft radial dot, white by default: tint it with the material colour */
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0.25)', hard = 0.1): THREE.Texture {
  const key = `${inner}|${outer}|${hard}`
  const hit = glowCache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  if (g) {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, inner)
    grad.addColorStop(hard, inner)
    grad.addColorStop(0.35, outer)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  glowCache.set(key, t)
  return t
}

/** An additive glow sprite whose brightness is read every frame (0 hides it) */
export function Glow({
  position,
  size,
  color,
  level,
}: {
  position?: [number, number, number]
  size: number
  color: THREE.ColorRepresentation
  level: (t: number) => number
}) {
  const time = useShowTime()
  const ref = useRef<THREE.Sprite>(null)
  const base = useMemo(() => new THREE.Color(color), [color])
  const map = useMemo(() => glowTexture(), [])
  useFrame(() => {
    const s = ref.current
    if (!s) return
    const k = level(time.current)
    s.visible = k > 0.001
    ;(s.material as THREE.SpriteMaterial).color.copy(base).multiplyScalar(k)
  })
  return (
    <sprite ref={ref} position={position} scale={[size, size, 1]}>
      <spriteMaterial map={map} blending={THREE.AdditiveBlending} depthWrite={false} transparent fog={false} toneMapped={false} />
    </sprite>
  )
}

/* ---------------- particle bursts ---------------- */

const burstVertex = /* glsl */ `
  attribute vec3 aDir;
  attribute float aSpeed;
  attribute float aBirth;
  attribute float aLife;
  attribute float aWeight;
  attribute float aSeed;
  uniform float uTime;
  uniform float uTau;
  uniform float uGravity;
  uniform float uRise;
  uniform float uFloor;
  uniform float uSize;
  uniform float uGrowth;
  uniform float uScale;
  uniform float uSwirl;
  uniform float uMaxPx;
  varying float vAlpha;
  varying float vShade;
  void main() {
    float age = uTime - aBirth;
    float life = aLife;
    if (age < 0.0 || age > life) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }
    float dist = aSpeed * uTau * (1.0 - exp(-age / uTau));
    vec3 p = position + aDir * dist;
    p.y += uRise * age * (0.6 + aSeed) - 0.5 * uGravity * age * age;
    // A little turbulence so billowing dust does not look like a perfect ring
    p.x += sin(age * 1.7 + aSeed * 31.0) * uSwirl * age;
    p.z += cos(age * 1.3 + aSeed * 17.0) * uSwirl * age;
    p.y = max(p.y, uFloor);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float k = age / life;
    gl_PointSize = min(uSize * (0.6 + aSeed * 0.8) * (1.0 + uGrowth * k) * uScale / max(-mv.z, 0.1), uMaxPx);
    // fade what flies right past the lens, so near particles never become huge discs
    vAlpha = aWeight * smoothstep(0.0, 0.06, age) * pow(1.0 - k, 1.4) * smoothstep(3.0, 14.0, -mv.z);
    vShade = 0.75 + aSeed * 0.5;
  }
`

const burstFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uSoft;
  varying float vAlpha;
  varying float vShade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, uSoft) * vAlpha * uOpacity;
    gl_FragColor = vec4(uColor * vShade, a);
  }
`

export interface BurstProps {
  count: number
  origin?: [number, number, number]
  /** Birth window in show seconds */
  from: number
  to: number
  /** Emission strength 0..1 at a birth time (precomputed per particle) */
  weight?: (t: number) => number
  speed: [number, number]
  life: [number, number]
  /** Vertical part of each particle's direction: [min, max] in -1..1 (0 = flat radial sheet) */
  up?: [number, number]
  /** Start radius around the origin */
  radius?: number
  /** Seconds for the speed to decay (big = no drag) */
  tau?: number
  gravity?: number
  rise?: number
  swirl?: number
  floor?: number
  /** World size of a particle */
  size: number
  growth?: number
  color: THREE.ColorRepresentation
  opacity?: number
  additive?: boolean
  /** Edge falloff exponent (1 soft, 0.3 hard) */
  soft?: number
  seed?: number
  /** Largest a particle may draw on screen, in device pixels */
  maxPx?: number
}

/**
 * A burst of GPU particles: every particle's flight is a closed-form function of the
 * show clock, so nothing is simulated on the CPU and replays are identical.
 */
export function Burst({
  count,
  origin = [0, 0, 0],
  from,
  to,
  weight,
  speed,
  life,
  up = [0, 0],
  radius = 0,
  tau = 1000,
  gravity = 0,
  rise = 0,
  swirl = 0,
  floor = -1e5,
  size,
  growth = 0,
  color,
  opacity = 1,
  additive = false,
  soft = 1,
  seed = 1,
  maxPx = 700,
}: BurstProps) {
  const time = useShowTime()
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const height = useThree((s) => s.size.height)
  const dpr = useThree((s) => s.viewport.dpr)
  const geometry = useMemo(() => {
    const r = rng(seed)
    const pos = new Float32Array(count * 3)
    const dir = new Float32Array(count * 3)
    const spd = new Float32Array(count)
    const birth = new Float32Array(count)
    const lifeA = new Float32Array(count)
    const w = new Float32Array(count)
    const sd = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2
      const vy = up[0] + (up[1] - up[0]) * r()
      const h = Math.sqrt(Math.max(0, 1 - vy * vy))
      dir.set([Math.cos(a) * h, vy, Math.sin(a) * h], i * 3)
      const r0 = radius * Math.sqrt(r())
      pos.set([origin[0] + Math.cos(a) * r0, origin[1], origin[2] + Math.sin(a) * r0], i * 3)
      spd[i] = speed[0] + (speed[1] - speed[0]) * r()
      birth[i] = from + (to - from) * r()
      lifeA[i] = life[0] + (life[1] - life[0]) * r()
      w[i] = weight ? weight(birth[i]) : 1
      sd[i] = r()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3))
    g.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1))
    g.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1))
    g.setAttribute('aLife', new THREE.BufferAttribute(lifeA, 1))
    g.setAttribute('aWeight', new THREE.BufferAttribute(w, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(...origin), 1e4)
    return g
  }, [count, seed, from, to]) // weight is fixed for a show; a new closure each render must not rebuild it
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uTau: { value: tau },
          uGravity: { value: gravity },
          uRise: { value: rise },
          uSwirl: { value: swirl },
          uFloor: { value: floor },
          uSize: { value: size },
          uGrowth: { value: growth },
          uScale: { value: 1 },
          uMaxPx: { value: maxPx },
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: opacity },
          uSoft: { value: soft },
        },
        vertexShader: burstVertex,
        fragmentShader: burstFragment,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    [tau, gravity, rise, swirl, floor, size, growth, color, opacity, soft, additive, maxPx],
  )
  useFrame(() => {
    material.uniforms.uTime.value = time.current
    const fov = THREE.MathUtils.degToRad(camera.fov ?? 50)
    material.uniforms.uScale.value = (height * dpr) / (2 * Math.tan(fov / 2))
  })
  return <points geometry={geometry} material={material} frustumCulled={false} />
}

/* ---------------- rocket plume ---------------- */

const plumeVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vRim;
  void main() {
    vUv = uv;
    vec3 n = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vRim = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`
const plumeFragment = /* glsl */ `
  uniform vec3 uHot;
  uniform vec3 uCool;
  uniform float uStrength;
  uniform float uTime;
  varying vec2 vUv;
  varying float vRim;
  void main() {
    // uv.y: 1 at the nozzle, 0 at the far end
    float along = vUv.y;
    float flick = 0.85 + 0.15 * sin(uTime * 60.0 + vUv.x * 40.0) * sin(uTime * 23.0);
    float body = pow(along, 1.6) * pow(vRim, 1.4);
    vec3 col = mix(uCool, uHot, pow(along, 3.0));
    gl_FragColor = vec4(col * body * uStrength * flick, 1.0);
  }
`

/** Additive cone hanging down from y = 0 (the nozzle); `strength(t)` 0 hides it */
export function Plume({
  length,
  radius,
  hot = '#fff2d6',
  cool = '#ff8a3a',
  strength,
  position,
}: {
  length: number
  radius: number
  hot?: string
  cool?: string
  strength: (t: number) => number
  position?: [number, number, number]
}) {
  const time = useShowTime()
  const group = useRef<THREE.Group>(null)
  const geo = useMemo(() => {
    const g = new THREE.ConeGeometry(radius, length, 32, 1, true)
    g.translate(0, -length / 2, 0)
    return g
  }, [radius, length])
  const geoCore = useMemo(() => {
    const g = new THREE.ConeGeometry(radius * 0.35, length * 0.55, 24, 1, true)
    g.translate(0, -length * 0.275, 0)
    return g
  }, [radius, length])
  const mats = useMemo(
    () =>
      [
        [hot, cool, 1.4],
        ['#ffffff', hot, 3.2],
      ].map(
        ([h, c, k]) =>
          new THREE.ShaderMaterial({
            uniforms: { uHot: { value: new THREE.Color(h as string).multiplyScalar(k as number) }, uCool: { value: new THREE.Color(c as string) }, uStrength: { value: 0 }, uTime: { value: 0 } },
            vertexShader: plumeVertex,
            fragmentShader: plumeFragment,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
          }),
      ),
    [hot, cool],
  )
  useFrame(() => {
    const t = time.current
    const k = strength(t)
    if (group.current) {
      group.current.visible = k > 0.002
      group.current.scale.set(1 + 0.04 * Math.sin(t * 47), 0.85 + 0.15 * k + 0.05 * Math.sin(t * 31), 1 + 0.04 * Math.sin(t * 53))
    }
    for (const m of mats) {
      m.uniforms.uStrength.value = k
      m.uniforms.uTime.value = t
    }
  })
  return (
    <group ref={group} position={position}>
      {/* apex at the nozzle, widening downward */}
      <mesh geometry={geo} material={mats[0]} />
      <mesh geometry={geoCore} material={mats[1]} />
    </group>
  )
}

/* ---------------- lunar ground ---------------- */

/** Smooth value noise for the terrain (deterministic) */
function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
export function noise2(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

const CRATERS: [number, number, number, number][] = (() => {
  const r = rng(7)
  const out: [number, number, number, number][] = []
  for (let i = 0; i < 46; i++) {
    const ang = r() * Math.PI * 2
    const dist = 16 + r() * 150
    out.push([Math.cos(ang) * dist, Math.sin(ang) * dist, 1.5 + r() ** 2 * 16, 0.25 + r() * 0.3])
  }
  return out
})()

/** Ground height at (x, z): flat near the origin (the landing site), cratered further out */
export function lunarHeight(x: number, z: number, flat = 9): number {
  let h = 0
  let amp = 2.2
  let f = 0.018
  for (let o = 0; o < 5; o++) {
    h += (noise2(x * f + 3.1 * o, z * f - 1.7 * o) - 0.5) * amp
    amp *= 0.45
    f *= 2.2
  }
  for (const [cx, cz, cr, depth] of CRATERS) {
    const d = Math.hypot(x - cx, z - cz) / cr
    if (d < 1.6) {
      // bowl with a raised rim
      const bowl = d < 1 ? -(1 - d * d) * depth * cr * 0.5 : 0
      const rim = Math.exp(-((d - 1) ** 2) / 0.03) * depth * cr * 0.18
      h += bowl + rim
    }
  }
  const r = Math.hypot(x, z)
  const k = THREE.MathUtils.smoothstep(r, flat * 0.6, flat * 1.6)
  return h * k
}

/** Ground height including the optional sloped landing site (partial landing: a crater wall) */
export function siteHeight(x: number, z: number, slope = 0): number {
  return lunarHeight(x, z) + slope * x * Math.exp(-(x * x + z * z) / 160)
}

function GroundMesh({ size, segments, color, slope }: { size: number; segments: number; color: string; slope: number }) {
  const tex = useTexture(assetUrl('texture.lunar-crater-closeup'))
  const map = useMemo(() => {
    const t = tex.clone()
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(size / 22, size / 22)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    t.needsUpdate = true
    return t
  }, [tex, size])
  const geo = useMemo(() => buildGround(size, segments, slope), [size, segments, slope])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial map={map} color={color} roughness={1} metalness={0} vertexColors />
    </mesh>
  )
}

function buildGround(size: number, segments: number, slope: number) {
  const g = new THREE.PlaneGeometry(size, size, segments, segments)
  g.rotateX(-Math.PI / 2)
  const p = g.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    p.setY(i, siteHeight(x, z, slope))
    const shade = 0.72 + noise2(x * 0.05, z * 0.05) * 0.4 + noise2(x * 0.4, z * 0.4) * 0.12
    colors.set([shade, shade * 0.98, shade * 0.95], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

/** Grey cratered regolith with the NASA crater photo tiled on it; `slope` tilts the landing site */
export function LunarGround({ size = 360, segments = 220, color = '#bdb7ad', slope = 0 }: { size?: number; segments?: number; color?: string; slope?: number }) {
  const fallbackGeo = useMemo(() => buildGround(size, Math.min(segments, 160), slope), [size, segments, slope])
  return (
    <Safe
      fallback={
        <mesh geometry={fallbackGeo} receiveShadow>
          <meshStandardMaterial color="#8d8880" roughness={1} vertexColors />
        </mesh>
      }
    >
      <GroundMesh size={size} segments={segments} color={color} slope={slope} />
    </Safe>
  )
}

/** Low, harsh south-pole sunlight with a long shadow range, plus a faint earthshine fill */
export function LowSun({
  position = [-60, 9, -30],
  intensity = 4.2,
  extent = 30,
  target = [0, 0, 0],
}: {
  position?: [number, number, number]
  intensity?: number
  extent?: number
  target?: [number, number, number]
}) {
  const light = useRef<THREE.DirectionalLight>(null)
  const scene = useThree((s) => s.scene)
  const [tx, ty, tz] = target
  useLayoutEffect(() => {
    const l = light.current
    if (!l) return
    l.shadow.mapSize.set(2048, 2048)
    const c = l.shadow.camera
    c.left = -extent
    c.right = extent
    c.top = extent
    c.bottom = -extent
    c.near = 1
    c.far = 260
    l.shadow.bias = -0.0005
    l.shadow.normalBias = 0.04
    c.updateProjectionMatrix()
    l.target.position.set(tx, ty, tz)
    scene.add(l.target)
    return () => {
      scene.remove(l.target)
    }
  }, [extent, scene, tx, ty, tz])
  return (
    <>
      <directionalLight ref={light} position={position} intensity={intensity} color="#fff3e2" castShadow />
      <directionalLight position={[40, 30, 60]} intensity={0.12} color="#8fb0ff" />
      <hemisphereLight args={['#4a5670', '#0c0b0a', 0.12]} />
    </>
  )
}
