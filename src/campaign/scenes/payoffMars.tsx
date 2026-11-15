/**
 * Payoff 4, Mars base: three cut shots.
 * (a) entry: a capsule streaks into the thin red atmosphere, plasma on the heat shield and a
 * glowing wake · (b) descent: the supersonic parachute snaps open with a jolt and the heat
 * shield falls away over the orange plains · (c) landing: retro-rockets, a red dust storm
 * blasts out radially, then clears to show the craft beside its habitat in a butterscotch sky.
 * success: on target, modules light up · partial: off target, one module · failed: the
 * parachute tears and streams, an impact plume rises on the horizon.
 */
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Starfield } from '../../scene/space/Sky'
import { Burst, Glow, Plume, Safe, noise2, useShowTime } from './payoffParts'
import { MARS, easeInCubic, easeOutCubic, easeOutElastic, ring, seg } from './payoffTimeline'
import type { Outcome } from './types'

const SKY_HORIZON = new THREE.Color('#d6a476')
const SKY_ZENITH = new THREE.Color('#7d5a45')
const DUSTY = new THREE.Color('#a8603a')

type Shot = 'entry' | 'descent' | 'landing'
const shotAt = (t: number): Shot => (t < MARS.descentShot ? 'entry' : t < MARS.landingShot ? 'descent' : 'landing')

/* ================= (a) entry ================= */

const PLANET_R = 50

const planetVertex = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vPos = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = cameraPosition - w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const planetFragment = /* glsl */ `
  uniform vec3 sunDir;
  varying vec3 vPos;
  varying vec3 vNormalW;
  float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float n3(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * n3(p); p *= 2.07; a *= 0.5; } return s; }
  void main() {
    vec3 p = normalize(vPos);
    float m = fbm(p * 3.2);
    float fine = fbm(p * 22.0);
    vec3 rust = vec3(0.5, 0.18, 0.07);
    vec3 dust = vec3(0.78, 0.42, 0.22);
    vec3 basalt = vec3(0.27, 0.14, 0.09);
    vec3 col = mix(basalt, rust, smoothstep(0.32, 0.5, m));
    col = mix(col, dust, smoothstep(0.55, 0.72, m));
    col *= 0.55 + 0.9 * fine;
    // a long canyon scar and the north polar cap
    float canyon = smoothstep(0.035, 0.0, abs(p.y + 0.05 + 0.08 * sin(p.x * 6.0)) ) * smoothstep(0.2, 0.6, p.z);
    col = mix(col, basalt * 0.6, canyon * 0.8);
    col = mix(col, vec3(0.95, 0.92, 0.88), smoothstep(0.93, 0.96, p.y + 0.04 * fine));
    float ndl = dot(normalize(vNormalW), sunDir);
    vec3 lit = col * (max(ndl, 0.0) * 1.8 + 0.015);
    gl_FragColor = vec4(lit, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
const airFragment = /* glsl */ `
  uniform vec3 sunDir;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewW);
    float rim = pow(1.0 - abs(dot(n, v)), 3.0);
    float lit = smoothstep(-0.3, 0.4, dot(n, sunDir));
    gl_FragColor = vec4(vec3(1.0, 0.5, 0.3) * rim * rim * lit * 0.9, 1.0);
  }
`

const MARS_SUN = new THREE.Vector3(0.75, 0.35, 0.55).normalize()

function Planet() {
  const surface = useMemo(
    () => new THREE.ShaderMaterial({ uniforms: { sunDir: { value: MARS_SUN } }, vertexShader: planetVertex, fragmentShader: planetFragment }),
    [],
  )
  const air = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { sunDir: { value: MARS_SUN } },
        vertexShader: planetVertex,
        fragmentShader: airFragment,
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  )
  return (
    <group rotation={[1.25, 0.8, 0.3]}>
      <mesh material={surface}>
        <sphereGeometry args={[PLANET_R, 128, 96]} />
      </mesh>
      <mesh material={air} scale={1.035}>
        <sphereGeometry args={[PLANET_R, 96, 64]} />
      </mesh>
    </group>
  )
}

const shockFragment = /* glsl */ `
  uniform float uK;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec3 vPos;
  void main() {
    vec3 n = normalize(vNormalW);
    float rim = 1.0 - abs(dot(n, normalize(vViewW)));
    float front = smoothstep(-0.6, 1.0, normalize(vPos).y);
    vec3 col = mix(vec3(1.0, 0.35, 0.12), vec3(1.0, 0.85, 0.6), front);
    gl_FragColor = vec4(col * (0.25 + pow(rim, 1.5) * 1.6) * front * uK, 1.0);
  }
`

/** A capsule: heat shield at local +y (the way it flies), backshell tapering behind */
function Capsule({ glow }: { glow?: (t: number) => number }) {
  const time = useShowTime()
  const shield = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    if (shield.current && glow) shield.current.emissiveIntensity = glow(time.current) * 3
  })
  return (
    <group>
      <mesh position-y={0.05} castShadow>
        <sphereGeometry args={[2.2, 40, 12, 0, Math.PI * 2, 0, 0.5]} />
        <meshStandardMaterial ref={shield} color="#4a3426" roughness={0.7} emissive="#ff7a2e" emissiveIntensity={0} />
      </mesh>
      <mesh position-y={-1.0} castShadow>
        <cylinderGeometry args={[2.0, 0.8, 2.4, 32, 1, true]} />
        <meshStandardMaterial color="#e8e4dc" metalness={0.2} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position-y={-2.3}>
        <cylinderGeometry args={[0.8, 0.6, 0.4, 24]} />
        <meshStandardMaterial color="#9c9890" metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  )
}

function EntryShot() {
  const time = useShowTime()
  const craft = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera)
  const shock = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uK: { value: 0 } },
        vertexShader: planetVertex,
        fragmentShader: shockFragment,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  )
  const heat = (t: number) => 0.25 + 0.75 * seg(t, 0, 3.2)
  const pos = useMemo(() => new THREE.Vector3(), [])
  const vel = useMemo(() => new THREE.Vector3(1, -0.2, -0.15).normalize(), [])
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vel), [vel])
  useFrame(() => {
    const t = time.current
    if (shotAt(t) !== 'entry') return
    // skimming down into the limb of the planet
    pos.set(-22, PLANET_R + 9.5, 14).addScaledVector(vel, t * 5.5)
    craft.current?.position.copy(pos)
    craft.current?.quaternion.copy(q)
    shock.uniforms.uK.value = 0.6 * heat(t) * (0.9 + 0.1 * Math.sin(t * 40))
    const shake = 0.03 * heat(t) * Math.sin(t * 61)
    camera.position.copy(pos).add(new THREE.Vector3(-13 + t * 0.6, 5.5 + shake, 13))
    camera.up.set(0, 1, 0)
    camera.lookAt(pos.x + 4, pos.y - 4.5, pos.z - 3)
  })
  return (
    <>
      <Safe>
        <Starfield brightness={0.7} />
      </Safe>
      <directionalLight position={MARS_SUN.clone().multiplyScalar(100)} intensity={2.4} color="#fff2e0" />
      <ambientLight intensity={0.08} />
      <Planet />
      <group ref={craft}>
        <group scale={0.55}>
          <Capsule glow={heat} />
          {/* the shock layer wrapping the shield, stretched back into a wake */}
          <mesh material={shock} position-y={-2.6} scale={[3.2, 6.5, 3.2]}>
            <sphereGeometry args={[1, 40, 24]} />
          </mesh>
          <group position-y={-1.2}>
            <Plume length={30} radius={3.2} hot="#ffd7a0" cool="#ff5a24" strength={(t) => heat(t) * 0.9} />
          </group>
          <Glow position={[0, 1.4, 0]} size={11} color="#ffb070" level={(t) => heat(t) * 1.6} />
          {/* sparks of ablated shield streaming off behind */}
          <Burst count={1400} origin={[0, -0.5, 0]} radius={1.8} from={0} to={MARS.descentShot} speed={[24, 50]} life={[0.25, 0.7]} up={[-1, -0.9]} size={0.08} maxPx={10} color="#ffa860" additive opacity={1.2} soft={0.6} seed={31} />
        </group>
      </group>
    </>
  )
}

/* ================= shared Mars ground ================= */

function marsGeometry(size: number, segs: number) {
  const g = new THREE.PlaneGeometry(size, size, segs, segs)
  g.rotateX(-Math.PI / 2)
  const p = g.attributes.position as THREE.BufferAttribute
  const c = new Float32Array(p.count * 3)
  const a = new THREE.Color('#b0603a')
  const b = new THREE.Color('#d48b5a')
  const d = new THREE.Color('#5e3424')
  const tmp = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const r = Math.hypot(x, z)
    const flat = THREE.MathUtils.smoothstep(r, 12, 40)
    // dunes and mesas
    const dune = Math.sin(x * 0.09 + noise2(x * 0.02, z * 0.02) * 4) * 0.8
    const mesa = THREE.MathUtils.smoothstep(noise2(x * 0.006 + 9, z * 0.006 - 3), 0.62, 0.7) * 26 * THREE.MathUtils.smoothstep(r, 160, 260)
    const rough = (noise2(x * 0.05, z * 0.05) - 0.5) * 4 + (noise2(x * 0.3, z * 0.3) - 0.5) * 0.6
    p.setY(i, (dune + mesa + rough) * flat)
    const n = noise2(x * 0.03 + 5, z * 0.03)
    tmp.copy(a).lerp(b, n).lerp(d, THREE.MathUtils.smoothstep(noise2(x * 0.12, z * 0.12), 0.65, 0.85) * 0.7)
    c.set([tmp.r, tmp.g, tmp.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  g.computeVertexNormals()
  return g
}

function MarsGround({ size = 1400, segs = 260 }: { size?: number; segs?: number }) {
  const geo = useMemo(() => marsGeometry(size, segs), [size, segs])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
    </mesh>
  )
}

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const skyFragment = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSun;
  varying vec3 vDir;
  void main() {
    float up = clamp(vDir.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(up, 0.55));
    // Mars sunlight scatters blue close around the Sun
    float s = max(dot(vDir, uSun), 0.0);
    col += vec3(0.55, 0.7, 0.9) * pow(s, 60.0) * 0.6 + vec3(1.0, 0.95, 0.85) * pow(s, 800.0) * 2.5;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

function Sky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uHorizon: { value: SKY_HORIZON }, uZenith: { value: SKY_ZENITH }, uSun: { value: MARS_SUN } },
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  )
  const camera = useThree((s) => s.camera)
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => ref.current?.position.copy(camera.position))
  return (
    <mesh ref={ref} material={mat} renderOrder={-10}>
      <sphereGeometry args={[1500, 32, 16]} />
    </mesh>
  )
}

function MarsLight({ shadows }: { shadows?: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null)
  useFrame(() => {
    const l = light.current
    if (!l || !shadows || l.userData.ready) return
    l.userData.ready = true
    l.shadow.mapSize.set(2048, 2048)
    const c = l.shadow.camera
    c.left = c.bottom = -28
    c.right = c.top = 28
    c.near = 1
    c.far = 300
    l.shadow.bias = -0.0005
    c.updateProjectionMatrix()
  })
  return (
    <>
      <directionalLight ref={light} position={MARS_SUN.clone().multiplyScalar(120)} intensity={2.6} color="#ffe6c8" castShadow={shadows} />
      <hemisphereLight args={['#e0b088', '#5a2f1c', 0.75]} />
    </>
  )
}

/* ================= (b) descent ================= */

/** Canopy with orange and white gores; the lines run from its rim to the capsule */
function Parachute() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(7, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.42)
    const c = new Float32Array(g.attributes.position.count * 3)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const gore = Math.floor(((Math.atan2(p.getZ(i), p.getX(i)) / (Math.PI * 2) + 0.5) * 16 + 0.001)) % 2
      const band = p.getY(i) > 5.9 && p.getY(i) < 6.3
      const col = band ? [0.95, 0.95, 0.95] : gore ? [0.95, 0.47, 0.12] : [0.97, 0.96, 0.93]
      c.set(col, i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    return g
  }, [])
  const lines = useMemo(() => {
    const pts: number[] = []
    const rimY = 7 * Math.cos(Math.PI * 0.42)
    const rimR = 7 * Math.sin(Math.PI * 0.42)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      pts.push(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR, 0, -14, 0)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])
  return (
    <group>
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.85} />
      </mesh>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#efe6d6" transparent opacity={0.7} />
      </lineSegments>
    </group>
  )
}

function DescentShot({ outcome }: { outcome: Outcome }) {
  const time = useShowTime()
  const camera = useThree((s) => s.camera)
  const rig = useRef<THREE.Group>(null)
  const chute = useRef<THREE.Group>(null)
  const capsule = useRef<THREE.Group>(null)
  const shield = useRef<THREE.Group>(null)
  const failed = outcome === 'failed'
  useFrame(() => {
    const t = time.current
    if (shotAt(t) !== 'descent') return
    const d = t - MARS.descentShot
    // fall fast, then slow hard under the canopy
    const open = seg(t, MARS.chute, MARS.chute + 0.45)
    const dc = MARS.chute - MARS.descentShot
    const slow = failed ? 55 : 14
    const y = 520 - 55 * Math.min(d, dc) - slow * Math.max(0, d - dc)
    const jolt = failed ? 0 : 3 * Math.max(0, ring(t, MARS.chute + 0.12, 10, 5))
    rig.current?.position.set(0, y + jolt, 0)
    if (chute.current) {
      const c = chute.current
      c.visible = t > MARS.chute - 0.05
      const s = 0.05 + 0.95 * easeOutElastic(open)
      if (failed && t > MARS.tear) {
        // torn: a long, narrow streamer thrashing above the capsule
        const k = easeOutCubic(seg(t, MARS.tear, MARS.tear + 0.5))
        c.scale.set(s * (1 - 0.8 * k), s * (1 + 1.3 * k), s * (1 - 0.8 * k))
        c.rotation.set(Math.sin(t * 13) * 0.25 * k, t * 2 * k, Math.sin(t * 9) * 0.3 * k)
      } else {
        c.scale.set(s, s * (0.7 + 0.3 * open), s)
        c.rotation.set(Math.sin(t * 1.7) * 0.04, 0, Math.sin(t * 1.3) * 0.04)
      }
    }
    if (capsule.current) capsule.current.rotation.set(Math.sin(t * 2.1) * 0.06 * (1 + jolt), 0, Math.sin(t * 1.6) * 0.07 * (1 + (failed ? 3 : 0)))
    if (shield.current) {
      const k = Math.max(0, t - MARS.shieldDrop)
      shield.current.visible = true
      shield.current.position.set(k * 1.5, -0.2 - 9 * k * k, k * 0.8)
      shield.current.rotation.set(k * 1.1, 0, k * 0.7)
      if (failed) shield.current.position.set(0, -0.2, 0)
    }
    const shake = (failed ? 0.25 : 0.4) * Math.exp(-Math.max(0, t - MARS.chute - 0.1) * 3) * (t > MARS.chute ? 1 : 0) + (failed ? 0.08 : 0.02)
    const p = rig.current?.position ?? new THREE.Vector3()
    camera.position.set(p.x + 32 + Math.sin(t * 67) * shake, p.y + 18 + Math.cos(t * 59) * shake, p.z + 42)
    camera.up.set(0, 1, 0)
    camera.lookAt(p.x, p.y + 1 + 6 * open, p.z)
  })
  return (
    <>
      <Sky />
      <MarsLight />
      <group position-y={-40} scale={6}>
        <MarsGround size={700} segs={200} />
      </group>
      <group ref={rig}>
        <group ref={chute} position-y={14}>
          <Parachute />
        </group>
        <group ref={capsule} rotation-x={Math.PI}>
          {/* heat shield points down now */}
          <group scale={0.9}>
            <mesh position-y={-1.0} castShadow>
              <cylinderGeometry args={[2.0, 0.8, 2.4, 32]} />
              <meshStandardMaterial color="#e8e4dc" metalness={0.2} roughness={0.6} />
            </mesh>
            <mesh position-y={-2.3}>
              <cylinderGeometry args={[0.8, 0.6, 0.4, 24]} />
              <meshStandardMaterial color="#9c9890" metalness={0.5} roughness={0.5} />
            </mesh>
          </group>
        </group>
        <group ref={shield}>
          <mesh rotation-x={Math.PI} castShadow>
            <sphereGeometry args={[2.0, 40, 12, 0, Math.PI * 2, 0, 0.5]} />
            <meshStandardMaterial color="#3e2c22" roughness={0.8} emissive="#ff6a20" emissiveIntensity={0.15} />
          </mesh>
        </group>
        {/* the lander's legs, revealed when the shield drops */}
        {!failed && (
          <group position-y={-0.6}>
            {[0, 1, 2].map((i) => (
              <mesh key={i} position={[Math.cos(i * 2.1) * 1.2, -0.4, Math.sin(i * 2.1) * 1.2]}>
                <boxGeometry args={[0.25, 0.9, 0.25]} />
                <meshStandardMaterial color="#d6a64a" metalness={0.7} roughness={0.35} />
              </mesh>
            ))}
          </group>
        )}
      </group>
    </>
  )
}

/* ================= (c) landing ================= */

function MarsLander({ outcome }: { outcome: Outcome }) {
  const time = useShowTime()
  const ref = useRef<THREE.Group>(null)
  const retro = (t: number) => (t < MARS.retro || t > MARS.touchdown + 0.1 ? 0 : 0.8 + 0.2 * seg(t, MARS.retro, MARS.retro + 0.6))
  useFrame(() => {
    const t = time.current
    const k = seg(t, MARS.retro, MARS.touchdown)
    const y = 46 * (1 - k) ** 1.8
    const g = ref.current
    if (!g) return
    g.position.set(-6 * (1 - k) ** 2, y, 0)
    const squash = 1 - 0.06 * Math.max(0, ring(t, MARS.touchdown, 11, 4))
    g.scale.set(1, squash, 1)
    g.rotation.z = Math.sin(t * 1.4) * 0.03 * (1 - k)
  })
  return (
    <group ref={ref}>
      <mesh position-y={2.3} castShadow>
        <cylinderGeometry args={[2.4, 2.6, 1.2, 6]} />
        <meshStandardMaterial color="#d9a441" metalness={0.75} roughness={0.3} />
      </mesh>
      <mesh position-y={3.3} castShadow>
        <cylinderGeometry args={[1.5, 2.2, 1, 6]} />
        <meshStandardMaterial color="#e6e1d6" metalness={0.25} roughness={0.55} />
      </mesh>
      <mesh position={[0.6, 4.4, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.4, 6]} />
        <meshStandardMaterial color="#cfcac0" />
      </mesh>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2
        return (
          <group key={i}>
            <mesh position={[Math.cos(a) * 2.9, 1, Math.sin(a) * 2.9]} rotation={[Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]} castShadow>
              <cylinderGeometry args={[0.1, 0.1, 2.6, 8]} />
              <meshStandardMaterial color="#8d8a84" metalness={0.7} roughness={0.35} />
            </mesh>
            <mesh position={[Math.cos(a) * 3.5, 0.06, Math.sin(a) * 3.5]} castShadow>
              <cylinderGeometry args={[0.45, 0.5, 0.12, 14]} />
              <meshStandardMaterial color="#8d8a84" />
            </mesh>
          </group>
        )
      })}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + 0.4
        return <Plume key={i} position={[Math.cos(a) * 1.7, 1.6, Math.sin(a) * 1.7]} length={5.5} radius={0.65} hot="#fff0d0" cool="#ff7a30" strength={retro} />
      })}
      <Glow position={[0.6, 5.2, 0]} size={1.2} color={outcome === 'partial' ? '#ffb23d' : '#6fffa0'} level={(t) => (t > MARS.lights ? (Math.sin(t * 5) > 0.5 ? 1.6 : 0.05) : 0)} />
    </group>
  )
}

const WIN_ON = new THREE.Color('#ffd49a').multiplyScalar(3)
const WIN_OFF = new THREE.Color('#2a1d16')

function Habitat({ position, rotY, delay }: { position: [number, number, number]; rotY: number; delay: number }) {
  const time = useShowTime()
  const mats = useRef<THREE.MeshBasicMaterial[]>([])
  useFrame(() => {
    const t = time.current
    mats.current.forEach((m, i) => m.color.copy(WIN_OFF).lerp(WIN_ON, t > MARS.lights + delay + i * 0.18 ? 1 : 0))
  })
  return (
    <group position={position} rotation-y={rotY}>
      <mesh position-y={1.6} rotation-z={Math.PI / 2} castShadow receiveShadow>
        <cylinderGeometry args={[1.5, 1.5, 6.5, 28]} />
        <meshStandardMaterial color="#ece6da" roughness={0.6} metalness={0.15} />
      </mesh>
      <mesh position-y={3.15}>
        <boxGeometry args={[5.6, 0.12, 2]} />
        <meshStandardMaterial color="#1c2b4c" metalness={0.5} roughness={0.3} />
      </mesh>
      {[-2, -0.7, 0.7, 2].map((x, i) => (
        <mesh key={x} position={[x, 1.9, 1.46]}>
          <boxGeometry args={[0.55, 0.38, 0.06]} />
          <meshBasicMaterial ref={(m) => void (m && (mats.current[i] = m))} color={WIN_OFF} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function LandingShot({ outcome }: { outcome: Outcome }) {
  const time = useShowTime()
  const camera = useThree((s) => s.camera)
  const failed = outcome === 'failed'
  const falling = useRef<THREE.Group>(null)
  useFrame(() => {
    const t = time.current
    if (shotAt(t) !== 'landing') return
    const k = seg(t, MARS.landingShot, MARS.landingShot + 7)
    if (failed) {
      // a wide shot: the capsule and its streamer drop out of the sky, far off
      camera.position.set(28 - 4 * k, 3.2, 40)
      camera.lookAt(-6, 14 - 6 * seg(t, MARS.landingShot, MARS.impact + 1), -60)
      const f = falling.current
      if (f) {
        const fk = seg(t, MARS.landingShot, MARS.impact)
        f.visible = t < MARS.impact
        f.position.set(-14 + 8 * fk, 130 * (1 - easeInCubic(fk) * 0.5 - fk * 0.5), -80)
      }
      return
    }
    const shake = 0.12 * Math.exp(-Math.max(0, t - MARS.touchdown) * 3) * (t > MARS.touchdown ? 1 : 0)
    camera.position.set(26 - 8 * k + Math.sin(t * 70) * shake, 2.6 + 1.2 * k, 30 - 6 * k)
    const lander = 46 * (1 - seg(t, MARS.retro, MARS.touchdown)) ** 1.8
    camera.lookAt(-1.5, Math.max(3, lander * 0.75 + 2), 0)
  })
  const lift = (t: number) => seg(t, MARS.retro + 0.8, MARS.touchdown) ** 1.2
  const modules: [number, number, number, number][] =
    outcome === 'success'
      ? [
          [-14, 0, -6, 0.35],
          [-11, 0, 7, -0.25],
          [-25, 0, 0, 1.4],
        ]
      : outcome === 'partial'
        ? [[-13, 0, -4, 0.5]]
        : []
  return (
    <>
      <Sky />
      <MarsLight shadows />
      <MarsGround />
      {!failed && <MarsLander outcome={outcome} />}
      {modules.map(([x, y, z, r], i) => (
        <Habitat key={i} position={[x, y, z]} rotY={r} delay={i * 0.35} />
      ))}
      {!failed && (
        <>
          {/* the red storm: billowing outward along the ground, then settling */}
          <Burst count={3200} origin={[0, 0.6, 0]} radius={3} from={MARS.retro + 0.8} to={MARS.touchdown + 0.25} weight={lift} speed={[7, 18]} life={[2.2, 3.8]} up={[0.02, 0.35]} tau={1.4} rise={1.4} swirl={0.7} floor={0.4} size={6.5} growth={1.8} color="#b0643c" opacity={0.22} seed={41} />
          <Burst count={1400} origin={[0, 0.3, 0]} radius={2} from={MARS.retro + 1.2} to={MARS.touchdown} weight={lift} speed={[26, 48]} life={[0.4, 0.8]} up={[0.0, 0.04]} tau={1.6} size={0.3} growth={1.5} color="#e2a27a" opacity={0.9} maxPx={40} soft={0.6} seed={42} />
        </>
      )}
      {failed && (
        <>
          <group ref={falling}>
            <mesh rotation-x={Math.PI}>
              <coneGeometry args={[1.6, 2.4, 24]} />
              <meshStandardMaterial color="#e3ddd1" roughness={0.6} />
            </mesh>
            <mesh position-y={9}>
              <cylinderGeometry args={[0.15, 1.1, 14, 10, 1, true]} />
              <meshStandardMaterial color="#e9873a" side={THREE.DoubleSide} roughness={0.8} />
            </mesh>
          </group>
          <Glow position={[-6, 3, -80]} size={40} color="#ffd9a0" level={(t) => (t > MARS.impact ? 2.5 * Math.exp(-(t - MARS.impact) * 3) : 0)} />
          {/* the impact plume: a column, then a mushroom of red dust */}
          <Burst count={1200} origin={[-6, 1, -80]} radius={3} from={MARS.impact} to={MARS.impact + 0.6} speed={[14, 46]} life={[2.5, 4]} up={[0.92, 1]} tau={0.9} rise={3.5} swirl={1.6} size={8} growth={2.4} color="#93522f" opacity={0.55} seed={51} />
          <Burst count={800} origin={[-6, 0.5, -80]} radius={4} from={MARS.impact} to={MARS.impact + 0.3} speed={[10, 26]} life={[2.5, 3.8]} up={[0, 0.15]} tau={1.2} rise={0.6} swirl={0.8} size={7} growth={1.8} color="#a75f38" opacity={0.5} seed={52} />
          <Burst count={300} origin={[-6, 1, -80]} radius={1} from={MARS.impact} to={MARS.impact + 0.12} speed={[15, 40]} life={[1, 2.2]} up={[0.3, 0.95]} gravity={9} floor={0} size={0.3} color="#ffb060" additive soft={0.5} seed={53} maxPx={16} />
        </>
      )}
    </>
  )
}

/* ================= the three shots ================= */

export function MarsScene({ outcome }: { outcome: Outcome }) {
  const time = useShowTime()
  const scene = useThree((s) => s.scene)
  const shots = useRef<Record<Shot, THREE.Group | null>>({ entry: null, descent: null, landing: null })
  const fog = useMemo(() => new THREE.Fog(SKY_HORIZON.clone(), 60, 900), [])
  const space = useMemo(() => new THREE.Color('#020306'), [])
  useFrame(() => {
    const t = time.current
    const shot = shotAt(t)
    for (const k of Object.keys(shots.current) as Shot[]) {
      const g = shots.current[k]
      if (g) g.visible = k === shot
    }
    if (shot === 'entry') {
      scene.fog = null
      scene.background = space
    } else {
      scene.background = SKY_HORIZON
      scene.fog = fog
      if (shot === 'descent') {
        fog.color.copy(SKY_HORIZON)
        fog.near = 120
        fog.far = 2600
      } else {
        // the storm thickens the air, then clears
        const storm = outcome === 'failed' ? 0 : seg(t, MARS.retro + 1, MARS.touchdown) * (1 - easeOutCubic(seg(t, MARS.clear[0], MARS.clear[1])))
        fog.color.copy(SKY_HORIZON).lerp(DUSTY, storm * 0.5)
        fog.near = 40 - 25 * storm
        fog.far = 700 - 520 * storm
      }
    }
  })
  return (
    <>
      <group ref={(g) => void (shots.current.entry = g)}>
        <EntryShot />
      </group>
      <group ref={(g) => void (shots.current.descent = g)} visible={false}>
        <DescentShot outcome={outcome} />
      </group>
      <group ref={(g) => void (shots.current.landing = g)} visible={false}>
        <LandingShot outcome={outcome} />
      </group>
    </>
  )
}
