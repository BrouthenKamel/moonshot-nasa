import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CubeSat, Earth, Effects, Moon, Starfield, Sun, prefersReducedMotion, useGraphics } from '../space'
import { createDefaultDesign } from '../../sim/budgets'

/**
 * The opening picture: low over the Moon's south pole, Earth rising over the limb,
 * the Lunar Ice Mapper drifting past. Moon radius 1 at the origin, Earth on -X.
 */

const EARTH_POS = new THREE.Vector3(-34, 0, 0)
const TO_EARTH = new THREE.Vector3(-1, 0, 0)
const ALTITUDE = 1.2
const RISE_SECONDS = 16

function OrbitCamera({ craft, reduced }: { craft: React.RefObject<THREE.Group | null>; reduced: boolean }) {
  const { camera } = useThree()
  const v = useMemo(
    () => ({
      dir: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      right: new THREE.Vector3(),
      look: new THREE.Vector3(),
      x: new THREE.Vector3(),
      y: new THREE.Vector3(),
      z: new THREE.Vector3(),
      m: new THREE.Matrix4(),
    }),
    [],
  )
  useFrame((state) => {
    const t = state.clock.elapsedTime
    // Fly from the far side toward Earth: Earth comes up over the limb, then keeps climbing slowly
    const k = reduced ? 1 : 1 - Math.exp(-t / (RISE_SECONDS * 0.45))
    const x = 0.66 - 0.2 * k - (reduced ? 0 : 0.012 * Math.sin(t * 0.07))
    v.dir.set(x, -0.78, 0.36).normalize()
    camera.position.copy(v.dir).multiplyScalar(ALTITUDE)
    camera.up.copy(v.dir)
    // Look along the ground toward Earth, tilted down to keep the limb in the lower third
    v.fwd.copy(TO_EARTH).addScaledVector(v.dir, -TO_EARTH.dot(v.dir)).normalize()
    v.look.copy(camera.position).addScaledVector(v.fwd, 1).addScaledVector(v.dir, -0.52)
    camera.lookAt(v.look)

    const c = craft.current
    if (c) {
      v.right.crossVectors(v.fwd, v.dir).normalize()
      const drift = reduced ? 0 : Math.sin(t * 0.11) * 0.02
      c.position
        .copy(camera.position)
        .addScaledVector(v.fwd, 0.36)
        .addScaledVector(v.right, 0.1 + drift)
        .addScaledVector(v.dir, -0.2)
      // Nose along the flight path, wings tipped toward the camera so the solar cells show
      const roll = reduced ? 0 : Math.sin(t * 0.09) * 0.12
      v.z.copy(v.fwd).addScaledVector(v.right, -0.55).normalize()
      v.y.copy(v.dir).multiplyScalar(0.75).addScaledVector(v.fwd, -0.6).addScaledVector(v.right, -0.25 + roll)
      v.y.addScaledVector(v.z, -v.y.dot(v.z)).normalize()
      v.x.crossVectors(v.y, v.z)
      v.m.makeBasis(v.x, v.y, v.z)
      c.quaternion.setFromRotationMatrix(v.m)
    }
  })
  return null
}

export function OpeningScene() {
  const craft = useRef<THREE.Group>(null)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const design = useMemo(() => createDefaultDesign(), [])
  const quality = useGraphics((s) => s.quality)
  return (
    <Canvas
      className="!absolute inset-0"
      dpr={quality === 'high' ? [1, 2] : [1, 1.25]}
      camera={{ fov: 42, near: 0.01, far: 900 }}
      gl={{ antialias: true }}
      aria-hidden
    >
      <color attach="background" args={['#000000']} />
      <Suspense fallback={null}>
        <Starfield brightness={0.9} />
        <Sun intensity={3.4} fill={0.04} />
        <Moon iceCoverage={0.5} />
        <group position={EARTH_POS}>
          <Earth radius={3.67} spin={0.004} />
        </group>
        <group ref={craft}>
          <CubeSat design={design} scale={0.2} />
        </group>
        <OrbitCamera craft={craft} reduced={reduced} />
        <Effects bloom={1} vignette={0.8} />
      </Suspense>
    </Canvas>
  )
}
