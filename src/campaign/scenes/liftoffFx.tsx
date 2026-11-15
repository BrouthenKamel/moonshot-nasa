import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * The liftoff show's effects: sky dome, exhaust plumes, the ground cloud, venting vapour,
 * the exhaust trail and the explosion. Each one reads the show clock (`now()`, seconds)
 * every frame and is otherwise stateless, so a cut can land anywhere.
 */

export type Now = () => number

/* ---------------- shared bits ---------------- */

let softTex: THREE.Texture | null = null
/** A soft round puff with a little lumpiness, drawn once on a canvas */
function puffTexture(): THREE.Texture {
  if (softTex) return softTex
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.35, 'rgba(255,255,255,0.75)')
    grad.addColorStop(0.7, 'rgba(255,255,255,0.22)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
    // lumps, so overlapping puffs read as billows rather than discs
    for (let i = 0; i < 14; i++) {
      const a = hash(i * 3.1) * Math.PI * 2
      const d = 12 + hash(i * 7.7) * 26
      const x = size / 2 + Math.cos(a) * d
      const y = size / 2 + Math.sin(a) * d
      const r = 14 + hash(i * 5.3) * 18
      const lump = g.createRadialGradient(x, y, 0, x, y, r)
      lump.addColorStop(0, 'rgba(255,255,255,0.35)')
      lump.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = lump
      g.fillRect(0, 0, size, size)
    }
  }
  softTex = new THREE.CanvasTexture(c)
  softTex.colorSpace = THREE.SRGBColorSpace
  return softTex
}

/** Deterministic 0..1 noise from a number */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** A pool of sprites, each with its own material so it can fade on its own */
function useSprites(n: number, additive: boolean) {
  const sprites = useMemo(() => {
    const tex = puffTexture()
    return Array.from({ length: n }, () => {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        toneMapped: !additive,
      })
      const s = new THREE.Sprite(mat)
      s.visible = false
      return s
    })
  }, [n, additive])
  useEffect(() => () => sprites.forEach((s) => s.material.dispose()), [sprites])
  return sprites
}

/* ---------------- sky ---------------- */

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const skyFragment = /* glsl */ `
  uniform float dark;
  uniform vec3 sunDir;
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    float hp = max(h, 0.0);
    // orange dusk
    vec3 duskHorizon = vec3(1.0, 0.52, 0.26);
    vec3 duskLow = vec3(0.66, 0.30, 0.32);
    vec3 duskMid = vec3(0.20, 0.17, 0.33);
    vec3 duskTop = vec3(0.04, 0.05, 0.13);
    vec3 dusk = mix(duskHorizon, duskLow, smoothstep(0.0, 0.07, hp));
    dusk = mix(dusk, duskMid, smoothstep(0.06, 0.28, hp));
    dusk = mix(dusk, duskTop, smoothstep(0.25, 0.85, hp));
    float sun = max(dot(vDir, normalize(sunDir)), 0.0);
    dusk += vec3(1.0, 0.55, 0.25) * (pow(sun, 24.0) * 0.9 + pow(sun, 4.0) * 0.18);
    // deep blue, high up
    vec3 deep = mix(vec3(0.12, 0.22, 0.46), vec3(0.03, 0.06, 0.18), smoothstep(0.0, 0.3, hp));
    deep = mix(deep, vec3(0.006, 0.012, 0.04), smoothstep(0.3, 0.9, hp));
    // space: black above a thin blue band
    vec3 space = mix(vec3(0.05, 0.12, 0.3), vec3(0.0, 0.0, 0.006), smoothstep(-0.05, 0.12, h));
    vec3 col = dark < 1.0 ? mix(dusk, deep, dark) : mix(deep, space, clamp(dark - 1.0, 0.0, 1.0));
    // below the horizon: haze over the ground
    if (h < 0.0) col = mix(col, col * 0.35, smoothstep(0.0, -0.08, h));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** A big sphere that follows the camera; `dark` 0 = dusk, 1 = deep blue, 2 = space */
export function SkyDome({ dark }: { dark: () => number }) {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { dark: { value: 0 }, sunDir: { value: new THREE.Vector3(-0.85, 0.04, -0.55) } },
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => () => mat.dispose(), [mat])
  useFrame(({ camera }) => {
    mat.uniforms.dark.value = dark()
    mesh.current?.position.copy(camera.position)
  })
  return (
    <mesh ref={mesh} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[18000, 48, 24]} />
    </mesh>
  )
}

/* ---------------- plume ---------------- */

export interface Nozzle {
  x: number
  z: number
  /** nozzle radius */
  r: number
  /** height of the nozzle exit relative to the plume group's origin */
  y?: number
}

const HOT = new THREE.Color(6, 4.4, 2.4)
const WARM = new THREE.Color(2.6, 1.15, 0.38)

/**
 * Exhaust: a white-hot core per engine, one soft orange plume around the cluster, and a
 * flickering light. `power()` 0..1; `stretch()` lengthens it (thinner air up high).
 */
export function Plume({
  nozzles,
  clusterR,
  power,
  stretch,
  light = 1,
}: {
  nozzles: Nozzle[]
  clusterR: number
  power: () => number
  stretch?: () => number
  light?: number
}) {
  const group = useRef<THREE.Group>(null)
  const cores = useRef<THREE.Group>(null)
  const outer = useRef<THREE.Group>(null)
  const lamp = useRef<THREE.PointLight>(null)
  useFrame((st) => {
    const p = power()
    const g = group.current
    if (!g) return
    g.visible = p > 0.01
    if (!g.visible) return
    const e = st.clock.elapsedTime
    const flick = 1 + 0.1 * Math.sin(e * 47) + 0.06 * Math.sin(e * 83 + 1.3)
    const s = stretch ? stretch() : 1
    cores.current?.scale.set(0.7 + 0.3 * p, p * flick * (0.8 + 0.2 * s), 0.7 + 0.3 * p)
    outer.current?.scale.set(0.6 + 0.4 * p + 0.15 * (s - 1), p * flick * s, 0.6 + 0.4 * p + 0.15 * (s - 1))
    if (lamp.current) lamp.current.intensity = p * flick * 2200 * light * clusterR
  })
  const coreLen = (r: number) => r * 7
  const outerLen = clusterR * 11
  return (
    <group ref={group} visible={false}>
      <group ref={cores}>
        {nozzles.map((n, i) => (
          <group key={i} position={[n.x, n.y ?? 0, n.z]}>
            <mesh position-y={-coreLen(n.r) / 2} rotation-x={Math.PI}>
              <coneGeometry args={[n.r * 0.92, coreLen(n.r), 20, 1, true]} />
              <meshBasicMaterial color={HOT} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={outer}>
        <mesh position-y={-outerLen / 2} rotation-x={Math.PI}>
          <coneGeometry args={[clusterR * 1.25, outerLen, 28, 1, true]} />
          <meshBasicMaterial color={WARM} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <mesh position-y={-outerLen * 0.6} rotation-x={Math.PI}>
          <coneGeometry args={[clusterR * 1.9, outerLen * 1.2, 28, 1, true]} />
          <meshBasicMaterial color={new THREE.Color(1.2, 0.5, 0.18)} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      </group>
      <pointLight ref={lamp} position-y={-clusterR * 3} color="#ffa860" intensity={0} decay={2} />
    </group>
  )
}

/* ---------------- ground cloud ---------------- */

const SMOKE_COOL = new THREE.Color('#b9b0a6')
const SMOKE_DUSK = new THREE.Color('#d9b9a0')
const SMOKE_HOT = new THREE.Color('#ffc08a')

/**
 * Steam and smoke billowing out of the flame trench from ignition, spreading low along the
 * ground (mostly both ways along the trench, ±x) and rising slowly.
 */
export function GroundCloud({
  now,
  count,
  radius,
  from,
  liftoffAt,
  glow,
  origin,
}: {
  now: Now
  count: number
  radius: number
  from: number
  liftoffAt: number
  /** 0..1, how hot the flame is right now (lights the cloud from inside) */
  glow: () => number
  origin: [number, number, number]
}) {
  const sprites = useSprites(count, false)
  const puffs = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const trench = hash(i * 1.7) < 0.72
        const side = hash(i * 2.3) < 0.5 ? 0 : Math.PI
        // the rest rolls out behind the pad (-z), away from the close-up cameras
        const a = trench ? side + (hash(i * 4.1) - 0.5) * 0.9 : Math.PI + hash(i * 4.1) * Math.PI
        // births spread over ignition .. a few seconds after liftoff, denser after T-0
        const birth = from + Math.pow(hash(i * 9.2), 0.8) * (liftoffAt - from + 4.5)
        return {
          dir: [Math.cos(a), Math.sin(a)] as const,
          birth,
          reach: radius * (0.35 + 0.65 * hash(i * 6.6)) * (trench ? 1 : 0.6),
          rise: 1.2 + hash(i * 3.9) * 3.2,
          size: 0.8 + hash(i * 8.8) * 0.6,
          spin: (hash(i * 5.5) - 0.5) * 0.3,
        }
      }),
    [count, radius, from, liftoffAt],
  )
  const tmp = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const t = now()
    const g = glow()
    puffs.forEach((p, i) => {
      const s = sprites[i]
      const age = t - p.birth
      s.visible = age > 0
      if (age <= 0) return
      const out = p.reach * (1 - Math.exp(-age / 2.6))
      const x = origin[0] + p.dir[0] * (4 + out)
      const z = origin[2] + p.dir[1] * (4 + out) * 0.75
      const y = origin[1] + 1.5 + age * p.rise + (out / radius) * 6
      s.position.set(x, y, z)
      const sc = (8 + radius * 0.34 * (1 - Math.exp(-age / 2.5)) + age * 1.6) * p.size
      s.scale.set(sc, sc, 1)
      const m = s.material
      m.rotation = p.spin * age
      m.opacity = Math.min(1, age * 1.6) * 0.82 * (age > 14 ? Math.max(0, 1 - (age - 14) / 6) : 1)
      const heat = g * Math.exp(-(out + y * 0.6) / (radius * 0.28))
      tmp.copy(SMOKE_COOL).lerp(SMOKE_DUSK, Math.min(1, out / radius + 0.2)).lerp(SMOKE_HOT, Math.min(1, heat))
      m.color.copy(tmp)
    })
  })
  return (
    <group>
      {sprites.map((s, i) => (
        <primitive key={i} object={s} />
      ))}
    </group>
  )
}

/* ---------------- venting vapour ---------------- */

/** White wisps of boil-off venting from the tank and sliding down its side, looping until liftoff */
export function Vapour({ now, until, H, r, base }: { now: Now; until: number; H: number; r: number; base: () => THREE.Vector3 }) {
  const N = 34
  const sprites = useSprites(N, false)
  const wisps = useMemo(
    () =>
      Array.from({ length: N }, (_, i) => ({
        h: 0.18 + hash(i * 2.9) * 0.62,
        a: hash(i * 1.3) * Math.PI * 2,
        life: 1.8 + hash(i * 3.3) * 1.4,
        phase: hash(i * 7.1) * 3,
      })),
    [],
  )
  useFrame(() => {
    const t = now()
    const b = base()
    const fade = t < until ? 1 : Math.max(0, 1 - (t - until) / 1.2)
    wisps.forEach((w, i) => {
      const s = sprites[i]
      s.visible = fade > 0
      if (!s.visible) return
      const age = (t + w.phase) % w.life
      const k = age / w.life
      const out = r * (1.05 + k * 2.4)
      s.position.set(b.x + Math.cos(w.a) * out, b.y + H * w.h - k * r * 4.5, b.z + Math.sin(w.a) * out)
      const sc = r * (1.2 + k * 3.2)
      s.scale.set(sc, sc, 1)
      s.material.opacity = Math.sin(k * Math.PI) * 0.32 * fade
      s.material.color.set('#e6ecf2')
    })
  })
  return (
    <group>
      {sprites.map((s, i) => (
        <primitive key={i} object={s} />
      ))}
    </group>
  )
}

/* ---------------- exhaust trail (long lens) ---------------- */

/**
 * The exhaust trail seen from downrange: a column of puffs from the pad up to the rocket, older
 * (lower) puffs wider and more spread, lit warm by the low sun, with a hot glow under the engines.
 */
export function Trail({ now, from, until, ground, base, r }: { now: Now; from: number; until: number | null; ground: number; base: () => THREE.Vector3; r: number }) {
  const N = 56
  const sprites = useSprites(N, false)
  const glow = useRef<THREE.Mesh>(null)
  const low = useMemo(() => new THREE.Color('#d39a78'), [])
  const high = useMemo(() => new THREE.Color('#e4d6cb'), [])
  useFrame(() => {
    const t = now()
    const b = base()
    const len = b.y - ground
    const on = t > from && len > 4
    if (glow.current) glow.current.visible = on && (until === null || t < until)
    sprites.forEach((s, i) => {
      s.visible = on
      if (!on) return
      // f = 1 at the rocket, 0 at the ground; puffs pack closer near the rocket
      const f = 1 - Math.pow(i / (N - 1), 1.35)
      const y = ground + len * f
      const age = 1 - f
      const wob = (hash(i * 2.2) - 0.5) * r * 6 * age
      s.position.set(b.x * f + wob, y, b.z + (hash(i * 3.4) - 0.5) * r * 4 * age)
      const sc = r * (2.2 + age * 22) * (0.85 + hash(i * 1.1) * 0.3)
      s.scale.set(sc, sc * 1.15, 1)
      s.material.opacity = (0.35 + 0.4 * (1 - age)) * Math.min(1, len / 40)
      s.material.color.copy(high).lerp(low, Math.min(1, age * 1.4))
    })
    if (!glow.current?.visible) return
    const gl = Math.min(len, r * 26)
    glow.current.position.set(b.x, b.y - gl / 2, b.z)
    glow.current.scale.set(1, gl, 1)
  })
  return (
    <>
      {sprites.map((s, i) => (
        <primitive key={i} object={s} />
      ))}
      <mesh ref={glow} visible={false}>
        {/* unit height: scaled to the glow's length each frame */}
        <cylinderGeometry args={[r * 1.1, r * 0.25, 1, 16, 1, true]} />
        <meshBasicMaterial color={new THREE.Color(3.2, 1.5, 0.5)} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </>
  )
}

/* ---------------- explosion ---------------- */

/** Flash, an expanding fireball, black smoke and glowing debris streaks, from `at` at `where()` */
export function Explosion({ now, at, where, size }: { now: Now; at: number; where: () => THREE.Vector3; size: number }) {
  const FIRE = 30
  const SMOKE = 26
  const DEBRIS = 34
  const fire = useSprites(FIRE, true)
  const smoke = useSprites(SMOKE, false)
  const flash = useSprites(1, true)
  const debris = useRef<(THREE.Mesh | null)[]>([])
  const lamp = useRef<THREE.PointLight>(null)
  const origin = useRef<THREE.Vector3 | null>(null)
  const dirs = useMemo(
    () =>
      Array.from({ length: Math.max(FIRE, SMOKE, DEBRIS) }, (_, i) => {
        const u = hash(i * 3.7) * 2 - 1
        const a = hash(i * 9.1) * Math.PI * 2
        const s = Math.sqrt(1 - u * u)
        return { v: new THREE.Vector3(Math.cos(a) * s, u * 0.8 + 0.15, Math.sin(a) * s), speed: 0.5 + hash(i * 4.4) }
      }),
    [],
  )
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const t = now()
    const age = t - at
    const live = age >= 0
    if (!live) {
      origin.current = null
      for (const s of [...fire, ...smoke, ...flash]) s.visible = false
      for (const d of debris.current) if (d) d.visible = false
      if (lamp.current) lamp.current.intensity = 0
      return
    }
    if (!origin.current) origin.current = where().clone()
    const o = origin.current
    // flash: a white burst for a quarter second
    const f = flash[0]
    f.visible = age < 1.4
    f.position.copy(o)
    const fs = size * (1.5 + age * 6) * Math.max(0, 1 - age / 1.4)
    f.scale.set(fs * 1.6, fs * 1.6, 1)
    f.material.opacity = Math.max(0, 1 - age / 0.9)
    f.material.color.setRGB(4, 3.4, 2.6)
    if (lamp.current) {
      lamp.current.position.copy(o)
      lamp.current.intensity = Math.max(0, 1 - age / 2.2) * 4e7 * size
    }
    fire.forEach((s, i) => {
      const d = dirs[i]
      const out = size * 1.6 * d.speed * (1 - Math.exp(-age * 2.2))
      s.visible = age < 2.8
      tmp.copy(d.v).multiplyScalar(out).add(o)
      tmp.y -= age * age * size * 0.04
      s.position.copy(tmp)
      const sc = size * (0.5 + 0.9 * (1 - Math.exp(-age * 2))) * (0.7 + d.speed * 0.5)
      s.scale.set(sc, sc, 1)
      s.material.opacity = Math.max(0, 1 - age / 2.6) * 0.9
      const k = Math.min(1, age / 1.2)
      s.material.color.setRGB(4 - 2.8 * k, 1.9 - 1.5 * k, 0.6 - 0.5 * k)
    })
    smoke.forEach((s, i) => {
      const d = dirs[i]
      const a2 = age - 0.25
      s.visible = a2 > 0
      if (!s.visible) return
      const out = size * 1.3 * d.speed * (1 - Math.exp(-a2 * 1.4))
      tmp.copy(d.v).multiplyScalar(out).add(o)
      tmp.y += a2 * size * 0.05
      s.position.copy(tmp)
      const sc = size * (0.6 + 1.1 * (1 - Math.exp(-a2)))
      s.scale.set(sc, sc, 1)
      s.material.opacity = Math.min(1, a2 * 2) * 0.75
      s.material.color.setRGB(0.16, 0.13, 0.12)
    })
    debris.current.forEach((m, i) => {
      if (!m) return
      const d = dirs[i]
      m.visible = age < 3.2
      const sp = size * 2.4 * (0.4 + d.speed)
      tmp.copy(d.v).multiplyScalar(sp * age).add(o)
      tmp.y -= 9.8 * age * age * 1.4
      m.position.copy(tmp)
      // point along the velocity so it reads as a streak
      const vy = d.v.y * sp - 9.8 * 2.8 * age
      m.lookAt(tmp.x + d.v.x * sp, tmp.y + vy, tmp.z + d.v.z * sp)
      const mat = m.material as THREE.MeshBasicMaterial
      mat.opacity = Math.max(0, 1 - age / 3.2)
    })
  })
  return (
    <group>
      {[...smoke, ...fire, ...flash].map((s, i) => (
        <primitive key={i} object={s} />
      ))}
      {Array.from({ length: DEBRIS }, (_, i) => (
        <mesh key={i} ref={(m) => void (debris.current[i] = m)} visible={false}>
          <boxGeometry args={[size * 0.035, size * 0.035, size * 0.28]} />
          <meshBasicMaterial color={new THREE.Color(5, 2.6, 0.9)} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <pointLight ref={lamp} color="#ffb070" intensity={0} decay={2} />
    </group>
  )
}

/* ---------------- speed streaks (high set) ---------------- */

/** Faint flecks of haze and ice rushing past, so a rocket fixed at the origin still feels fast */
export function SpeedStreaks({ span, visible }: { span: number; visible: () => boolean }) {
  const N = 36
  const sprites = useSprites(N, true)
  const seeds = useMemo(() => Array.from({ length: N }, (_, i) => ({ x: (hash(i * 1.9) - 0.5) * span * 2.4, z: (hash(i * 2.7) - 0.5) * span * 2.4, ph: hash(i * 6.1) })), [span])
  useFrame((st) => {
    const on = visible()
    const e = st.clock.elapsedTime
    seeds.forEach((s, i) => {
      const sp = sprites[i]
      sp.visible = on
      if (!on) return
      const y = span * 1.6 - (((e * 0.9 + s.ph) % 1) * span * 3.2)
      sp.position.set(s.x, y, s.z)
      sp.scale.set(span * 0.008, span * 0.14, 1)
      sp.material.opacity = 0.1
      sp.material.color.setRGB(0.6, 0.75, 1)
    })
  })
  return (
    <group>
      {sprites.map((s, i) => (
        <primitive key={i} object={s} />
      ))}
    </group>
  )
}

/* ---------------- a separation flash ---------------- */

/** A soft additive burst at `at` (show time), gone after `life` seconds; position is the parent's origin */
export function Flash({ now, at, size, life = 0.7 }: { now: Now; at: number | null; size: number; life?: number }) {
  const [sprite] = useSprites(1, true)
  useFrame(() => {
    const age = at === null ? -1 : now() - at
    const on = age >= 0 && age < life
    sprite.visible = on
    if (!on) return
    const k = age / life
    const sc = size * (0.6 + 2.2 * Math.sqrt(k))
    sprite.scale.set(sc, sc, 1)
    sprite.material.opacity = (1 - k) * (1 - k)
    sprite.material.color.setRGB(3.2, 2.4, 1.6)
  })
  return <primitive object={sprite} />
}
