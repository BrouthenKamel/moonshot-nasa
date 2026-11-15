/**
 * Payoff 1, Lunar Ice Mapper: over the south pole, a radar sweep turns around the pole
 * (the Moon rotating under a polar orbit) and the ice in the shadowed craters lights up
 * cyan behind it. An LRO-like orbiter crosses overhead.
 * success: the full map lights up · partial: the sweep stalls half way · failed: the orbiter
 * goes silent, the sweep never starts, the feed turns to static.
 */
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Moon } from '../../scene/space/Moon'
import { Starfield, Sun } from '../../scene/space/Sky'
import { useSpaceTexture } from '../../scene/space/textures'
import { Glow, Safe, SafeModel, useShowTime } from './payoffParts'
import { ICE, easeInOutCubic, easeOutCubic, seg } from './payoffTimeline'
import type { Outcome } from './types'

const R = 10
const CAP = THREE.MathUtils.degToRad(12)
const POLE = new THREE.Vector3(0, -R, 0)

const sweepVertex = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const sweepFragment = /* glsl */ `
  uniform sampler2D iceMap;
  uniform float capAngle;
  uniform float sweep;
  uniform float line;
  uniform float time;
  uniform float dim;
  varying vec3 vPos;
  #define TAU 6.2831853
  void main() {
    vec3 p = normalize(vPos);
    float r = acos(clamp(-p.y, -1.0, 1.0)) / capAngle;
    if (r > 1.0) discard;
    vec2 dir = normalize(p.xz + vec2(1e-6));
    // Same azimuthal projection the ice map was baked with (see Moon.tsx)
    float ice = texture2D(iceMap, vec2(0.5 + 0.5 * r * dir.x, 0.5 - 0.5 * r * dir.y)).r;
    float az = atan(p.z, p.x);
    float rel = mod(az + 3.14159265, TAU);
    float behind = sweep - rel;
    float revealed = step(0.0, behind);
    float fresh = exp(-max(behind, 0.0) * 2.2) * revealed;
    float edge = smoothstep(1.0, 0.88, r);

    float pulse = 0.92 + 0.08 * sin(time * 2.3 + r * 9.0);
    vec3 cyan = vec3(0.12, 0.78, 0.95);
    vec3 col = cyan * ice * (0.75 * pulse + 2.6 * fresh) * revealed * dim;

    // The sweep arm, a radar-style trailing wedge and range rings
    float arc = abs(behind) * max(r, 0.08);
    float arm = exp(-arc * arc * 9000.0) * line;
    float wedge = fresh * 0.10 * line;
    float rings = (1.0 - smoothstep(0.0, 0.012, abs(fract(r * 5.0) - 0.5) - 0.48)) * 0.05 * revealed * dim;
    col += vec3(0.5, 1.0, 1.0) * arm * 2.2 + cyan * (wedge + rings) * smoothstep(0.02, 0.2, r);
    // Outer rim of the mapped zone
    col += cyan * exp(-pow((r - 0.985) * 70.0, 2.0)) * 0.35 * dim;
    gl_FragColor = vec4(col * edge, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function IceSweep({ outcome }: { outcome: Outcome }) {
  const time = useShowTime()
  const ice = useSpaceTexture('texture.moon-ice', { data: true })
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { iceMap: { value: ice }, capAngle: { value: CAP }, sweep: { value: 0 }, line: { value: 0 }, time: { value: 0 }, dim: { value: 1 } },
        vertexShader: sweepVertex,
        fragmentShader: sweepFragment,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [ice],
  )
  useFrame(() => {
    const t = time.current
    const u = material.uniforms
    u.time.value = t
    if (outcome === 'failed') {
      u.sweep.value = -1
      u.line.value = 0
      return
    }
    const full = Math.PI * 2 + 0.05
    if (outcome === 'success') {
      u.sweep.value = easeInOutCubic(seg(t, ICE.sweepStart, ICE.sweepEnd)) * full
      u.line.value = seg(t, ICE.sweepStart, ICE.sweepStart + 0.4) * (1 - seg(t, ICE.sweepEnd, ICE.sweepEnd + 0.6))
      // the finished map breathes once, brighter
      u.dim.value = 1 + 0.6 * Math.exp(-(((t - ICE.sweepEnd - 0.4) / 0.5) ** 2))
    } else {
      // partial: same pace, then the arm stalls at half and flickers out
      const k = seg(t, ICE.sweepStart, ICE.sweepEnd)
      const stopK = seg(ICE.partialStop, ICE.sweepStart, ICE.sweepEnd)
      u.sweep.value = easeInOutCubic(Math.min(k, stopK)) * full
      const after = t - ICE.partialStop
      const flicker = after > 0 ? (Math.sin(t * 55) > 0.2 ? 1 : 0.15) * Math.max(0, 1 - after / 0.9) : 1
      u.line.value = seg(t, ICE.sweepStart, ICE.sweepStart + 0.4) * flicker
    }
  })
  return (
    <mesh material={material} renderOrder={2}>
      <sphereGeometry args={[R * 1.0015, 160, 32, 0, Math.PI * 2, Math.PI - CAP, CAP]} />
    </mesh>
  )
}

function OrbiterFallback() {
  return (
    <group scale={0.11}>
      <mesh castShadow>
        <boxGeometry args={[1.2, 1.6, 1.2]} />
        <meshStandardMaterial color="#c9a24a" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, -1.9]}>
        <boxGeometry args={[0.05, 1.4, 2.4]} />
        <meshStandardMaterial color="#1d2b4a" metalness={0.3} roughness={0.5} />
      </mesh>
    </group>
  )
}

/** The orbiter crossing the frame over the pole */
function Orbiter({ outcome }: { outcome: Outcome }) {
  const time = useShowTime()
  const ref = useRef<THREE.Group>(null)
  const from = useMemo(() => POLE.clone().add(new THREE.Vector3(-5.2, -1.95, 2.6)), [])
  const to = useMemo(() => POLE.clone().add(new THREE.Vector3(5.6, -1.55, 1.1)), [])
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const t = time.current
    const k = seg(t, ICE.craftIn, ICE.craftOut)
    g.position.lerpVectors(from, to, k)
    g.rotation.set(0.4, 0.15, -0.2)
    if (outcome === 'failed' && t > ICE.silent) {
      // dead: a slow tumble
      const d = t - ICE.silent
      g.rotation.set(0.4 + d * 0.35, 0.15 + d * 0.22, -0.2 + d * 0.5)
    }
  })
  const beacon = (t: number) => {
    if (outcome === 'failed' && t > ICE.silent) return t < ICE.silent + 0.8 ? (Math.sin(t * 40) > 0 ? 1.6 : 0) : 0
    return Math.sin(t * 6) > 0.6 ? 1.4 : 0.08
  }
  return (
    <group ref={ref}>
      <SafeModel id="model.env-lro" maxDim={0.6} fallback={<OrbiterFallback />} />
      <Glow position={[0, 0.16, 0]} size={0.22} color={outcome === 'failed' ? '#ff5a3c' : '#7dffb0'} level={beacon} />
    </group>
  )
}

const staticFragment = /* glsl */ `
  uniform float time;
  uniform float amount;
  varying vec2 vUv;
  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 px = floor(vUv * vec2(320.0, 200.0));
    float n = h(px + floor(time * 30.0) * 7.13);
    float band = smoothstep(0.0, 0.02, abs(fract(vUv.y * 3.0 - time * 0.7) - 0.5) - 0.46);
    float a = amount * (0.25 + 0.5 * n) * (0.7 + 0.6 * band);
    gl_FragColor = vec4(vec3(n * 0.8 + 0.2), a);
  }
`

/** A sheet of TV static glued in front of the camera (failed) */
function Static() {
  const time = useShowTime()
  const camera = useThree((s) => s.camera)
  const ref = useRef<THREE.Mesh>(null)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, amount: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: staticFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const t = time.current
    m.position.copy(camera.position)
    m.quaternion.copy(camera.quaternion)
    m.translateZ(-1)
    material.uniforms.time.value = t
    const burst = t > ICE.silent ? Math.max(0.12, 0.6 * Math.exp(-(t - ICE.silent) * 1.1)) : 0
    material.uniforms.amount.value = burst * (Math.sin(t * 13) > -0.6 ? 1 : 0.4)
  })
  return (
    <mesh ref={ref} material={material} renderOrder={50} frustumCulled={false}>
      <planeGeometry args={[2, 1.3]} />
    </mesh>
  )
}

function Rig() {
  const time = useShowTime()
  const camera = useThree((s) => s.camera)
  const target = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const t = time.current
    // a slow descent toward the pole, drifting sideways
    const k = easeOutCubic(seg(t, 0, 12))
    camera.position.copy(POLE).add(new THREE.Vector3(-0.8 + 1.4 * k, -4.6 + 1.0 * k, 4.9 - 1.3 * k))
    target.copy(POLE).add(new THREE.Vector3(0.1, 0, 0.9 - 0.4 * k))
    camera.up.set(0, -1, 0)
    camera.lookAt(target)
  })
  return null
}

export function IceMapScene({ outcome }: { outcome: Outcome }) {
  const time = useShowTime()
  const spin = useRef<THREE.Group>(null)
  useFrame(() => {
    if (spin.current) spin.current.rotation.y = 0.3 + time.current * 0.035
  })
  return (
    <>
      <color attach="background" args={['#020306']} />
      <Rig />
      <Safe>
        <Starfield brightness={0.8} />
      </Safe>
      <Sun intensity={2.6} fill={0.06} />
      <ambientLight intensity={0.05} />
      <group ref={spin}>
        <Safe
          fallback={
            <mesh>
              <sphereGeometry args={[R, 96, 48]} />
              <meshStandardMaterial color="#6d6a66" roughness={1} />
            </mesh>
          }
        >
          <Moon radius={R} segments={160} />
        </Safe>
        <group rotation={[0, Math.PI, 0]}>
          <Safe>
            <IceSweep outcome={outcome} />
          </Safe>
        </group>
      </group>
      <Orbiter outcome={outcome} />
      {outcome === 'failed' && <Static />}
    </>
  )
}
