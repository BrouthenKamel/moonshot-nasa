import { useMemo } from 'react'
import * as THREE from 'three'
import { SUN_DIR, useSpaceTexture } from './textures'

/** The real night sky (NASA Deep Star Maps) on a sphere far behind everything. */
export function Starfield({ brightness = 1 }: { brightness?: number }) {
  const stars = useSpaceTexture('texture.stars')
  return (
    <mesh rotation={[1.1, 0.4, 0.3]} renderOrder={-10}>
      <sphereGeometry args={[400, 48, 24]} />
      <meshBasicMaterial map={stars} side={THREE.BackSide} depthWrite={false} color={new THREE.Color(brightness, brightness, brightness)} fog={false} />
    </mesh>
  )
}

function makeGlow(inner: string, outer: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  if (g) {
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    grad.addColorStop(0, inner)
    grad.addColorStop(0.08, inner)
    grad.addColorStop(0.25, outer)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * The Sun: the scene's key light, plus a glare far away in the same direction.
 * `fill` is a faint light from the opposite side so the night side keeps a little shape.
 */
export function Sun({ intensity = 3.2, fill = 0.05, glare = true }: { intensity?: number; fill?: number; glare?: boolean }) {
  const glow = useMemo(() => makeGlow('rgba(255,255,255,1)', 'rgba(255,220,170,0.35)'), [])
  const far = useMemo(() => SUN_DIR.clone().multiplyScalar(380), [])
  return (
    <>
      <directionalLight position={SUN_DIR.clone().multiplyScalar(50)} intensity={intensity} color="#fff4e6" />
      <directionalLight position={SUN_DIR.clone().multiplyScalar(-50)} intensity={fill} color="#7fa8ff" />
      <ambientLight intensity={0.02} />
      {glare && (
        <sprite position={far} scale={[130, 130, 1]} renderOrder={-5}>
          <spriteMaterial map={glow} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} color={new THREE.Color(3, 2.8, 2.4)} fog={false} />
        </sprite>
      )}
    </>
  )
}
