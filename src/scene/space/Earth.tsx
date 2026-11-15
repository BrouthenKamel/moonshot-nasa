import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SUN_DIR, useSpaceTexture } from './textures'

const surfaceVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const surfaceFragment = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewW);
    float ndl = dot(n, sunDir);
    float day = smoothstep(-0.12, 0.3, ndl);
    vec3 dayColor = texture2D(dayMap, vUv).rgb;
    vec3 nightColor = texture2D(nightMap, vUv).rgb;
    // City lights only: the night map also holds dim land and sea
    float lights = smoothstep(0.04, 0.35, nightColor.r - nightColor.b);
    vec3 color = dayColor * max(ndl, 0.0) * 2.2;
    color += vec3(1.0, 0.82, 0.55) * lights * 1.6 * (1.0 - day);
    // Ocean glint toward the Sun
    float ocean = smoothstep(0.02, 0.0, dayColor.r - dayColor.b * 0.6) ;
    vec3 h = normalize(v + sunDir);
    color += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, h), 0.0), 240.0) * ocean * 1.2 * day;
    // Air scattering at the limb
    float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.6);
    color += vec3(0.28, 0.55, 1.0) * fresnel * (0.12 + 1.1 * day);
    gl_FragColor = vec4(color, 1.0);
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
    float rim = pow(clamp(0.72 + dot(n, v), 0.0, 1.0), 3.0);
    float lit = smoothstep(-0.35, 0.5, dot(n, sunDir));
    gl_FragColor = vec4(vec3(0.3, 0.58, 1.0) * rim * (0.15 + lit) * 1.4, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * Earth from NASA Blue Marble, with night lights on the dark side and a thin glowing atmosphere.
 * `spin` turns it at a steady rate (radians a second). A scene with its own clock passes
 * `angle` instead (radians, read every frame) and, if its Sun moves, `sunDir`.
 */
export function Earth({
  radius = 1,
  spin = 0.01,
  angle,
  sunDir = SUN_DIR,
}: {
  radius?: number
  spin?: number
  angle?: { current: number }
  sunDir?: THREE.Vector3
}) {
  const day = useSpaceTexture('texture.earth-day')
  const night = useSpaceTexture('texture.earth-night')
  const globe = useRef<THREE.Mesh>(null)
  const surface = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { dayMap: { value: day }, nightMap: { value: night }, sunDir: { value: sunDir } },
        vertexShader: surfaceVertex,
        fragmentShader: surfaceFragment,
      }),
    [day, night, sunDir],
  )
  const air = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { sunDir: { value: sunDir } },
        vertexShader: surfaceVertex,
        fragmentShader: airFragment,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    [sunDir],
  )
  useFrame((_, dt) => {
    if (!globe.current) return
    if (angle) globe.current.rotation.y = angle.current
    else globe.current.rotation.y += dt * spin
  })
  return (
    <group rotation={[0.41, 0, 0]}>
      <mesh ref={globe} material={surface}>
        <sphereGeometry args={[radius, 96, 48]} />
      </mesh>
      <mesh material={air} scale={1.07}>
        <sphereGeometry args={[radius, 64, 32]} />
      </mesh>
    </group>
  )
}
