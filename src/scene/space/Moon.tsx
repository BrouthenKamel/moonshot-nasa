import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSpaceTexture } from './textures'

/** Colatitude radius of the south-polar ice map, in degrees (see moonIce in scripts/assets/fetch-nasa.ts) */
const ICE_CAP_DEG = 12
/** Mapping passes drawn as this many strips around the pole */
const STRIPS = 40

const iceVertex = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const iceFragment = /* glsl */ `
  uniform sampler2D iceMap;
  uniform float coverage;
  uniform float capAngle;
  uniform float strips;
  uniform float time;
  varying vec3 vPos;
  void main() {
    vec3 p = normalize(vPos);
    float r = acos(clamp(-p.y, -1.0, 1.0)) / capAngle;
    if (r > 1.0) discard;
    vec2 dir = normalize(p.xz + vec2(1e-6));
    // Same azimuthal projection the map was baked with; images load flipped in v
    float ice = texture2D(iceMap, vec2(0.5 + 0.5 * r * dir.x, 0.5 - 0.5 * r * dir.y)).r;
    // A strip is mapped once the coverage passes its place in the (shuffled) order
    float id = floor((atan(p.z, p.x) / 6.2831853 + 0.5) * strips);
    float order = fract(sin(id * 12.9898) * 43758.5453);
    float mapped = step(order + 0.0005, coverage);
    float edge = smoothstep(1.0, 0.8, r);
    float pulse = 0.85 + 0.15 * sin(time * 1.7 + id * 2.1);
    vec3 color = vec3(0.05, 0.95, 1.0) * ice * mapped * 3.2 * pulse;
    color += vec3(0.05, 0.5, 0.7) * mapped * 0.07;
    gl_FragColor = vec4(color * edge, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function IceCap({ radius, coverage }: { radius: number; coverage: number }) {
  const ice = useSpaceTexture('texture.moon-ice', { data: true })
  const cap = THREE.MathUtils.degToRad(ICE_CAP_DEG)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { iceMap: { value: ice }, coverage: { value: 0 }, capAngle: { value: cap }, strips: { value: STRIPS }, time: { value: 0 } },
        vertexShader: iceVertex,
        fragmentShader: iceFragment,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [ice, cap],
  )
  const shown = useRef(0)
  useFrame((state, delta) => {
    // Ease toward the real value so new strips fade in turn by turn
    shown.current += (coverage - shown.current) * Math.min(1, delta * 1.5)
    material.uniforms.coverage.value = shown.current
    material.uniforms.time.value = state.clock.elapsedTime
  })
  return (
    <mesh material={material}>
      <sphereGeometry args={[radius * 1.003, 96, 24, 0, Math.PI * 2, Math.PI - cap, cap]} />
    </mesh>
  )
}

interface MoonProps {
  radius?: number
  segments?: number
  /** Ice mapped so far, 0..1 (the core's coverage / 100). Leave out to draw no ice. */
  iceCoverage?: number
}

/**
 * The Moon from NASA data: LRO camera colour and a normal map derived from LOLA elevation.
 * South pole is -Y. The near side (longitude 0) faces -X, toward where the scenes put Earth.
 * With `iceCoverage`, mapped strips around the south pole show their crater-floor ice in cyan.
 */
export function Moon({ radius = 1, segments = 96, iceCoverage }: MoonProps) {
  const color = useSpaceTexture('texture.moon-color')
  const normal = useSpaceTexture('texture.moon-normal', { data: true })
  return (
    <group rotation={[0, Math.PI, 0]}>
      <mesh>
        <sphereGeometry args={[radius, segments * 2, segments]} />
        <meshStandardMaterial map={color} normalMap={normal} normalScale={[1.6, 1.6]} roughness={1} metalness={0} />
      </mesh>
      {iceCoverage !== undefined && <IceCap radius={radius} coverage={iceCoverage} />}
    </group>
  )
}
