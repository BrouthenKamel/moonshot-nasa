import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Astronaut, useClickToMove, type AstronautHandle } from './Astronaut'
import { CartFollower } from './CartFollower'
import { AstronautSetup } from './AstronautSetup'
import { blockRect, createNavGrid } from './controller'

const BOXES: [number, number, number, number][] = [
  // x, z, width, depth
  [0, -1, 1.2, 4],
  [-4, 3, 2, 1.2],
  [4, 2, 1.5, 1.5],
]

/** Standalone sandbox for the astronaut, cart and click-to-move: open `/?player-demo=1`. */
export function PlayerDemo() {
  const grid = useMemo(() => {
    const g = createNavGrid(-8, -8, 8, 8, 0.4)
    for (const [x, z, w, d] of BOXES) blockRect(g, x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0.3)
    return g
  }, [])
  const click = useClickToMove()
  const astro = useRef<AstronautHandle>(null)

  useEffect(() => {
    // Test hook for the Playwright check
    const w = window as unknown as { __playerDemo?: { pos: () => number[] } }
    w.__playerDemo = {
      pos: () => {
        const p = astro.current?.getPosition()
        return p ? [p.x, p.z] : [NaN, NaN]
      },
    }
    return () => void delete w.__playerDemo
  }, [])

  return (
    <div className="relative h-screen bg-ink-0" data-testid="player-demo">
      <Canvas shadows camera={{ position: [7, 8, 10], fov: 35 }} onCreated={({ camera }) => camera.lookAt(0, 0, 0)}>
        <color attach="background" args={['#1b2230']} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[5, 9, 4]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
        <mesh rotation-x={-Math.PI / 2} receiveShadow onPointerDown={click.onPointerDown}>
          <planeGeometry args={[16, 16]} />
          <meshStandardMaterial color="#6d6a66" roughness={1} />
        </mesh>
        {BOXES.map(([x, z, w, d], i) => (
          <mesh key={i} position={[x, 0.6, z]} castShadow>
            <boxGeometry args={[w, 1.2, d]} />
            <meshStandardMaterial color="#8a5a44" />
          </mesh>
        ))}
        <Suspense fallback={null}>
          <Astronaut ref={astro} navGrid={grid} clickTarget={click.target} start={{ x: -5, z: 5 }} />
          <CartFollower leader={astro} />
        </Suspense>
      </Canvas>
      <AstronautSetup />
    </div>
  )
}
