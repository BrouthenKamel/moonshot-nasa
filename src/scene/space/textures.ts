import { useTexture } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import { assetUrl, type TextureId } from '../../assets'

/**
 * A NASA map as a three.js texture. `data: true` is for maps that hold numbers
 * (normals, heights, masks) and must not be colour-corrected.
 */
export function useSpaceTexture(id: TextureId, { data = false }: { data?: boolean } = {}): THREE.Texture {
  const source = useTexture(assetUrl(id))
  return useMemo(() => {
    const t = source.clone()
    t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace
    t.anisotropy = 8
    t.wrapS = THREE.RepeatWrapping
    t.needsUpdate = true
    return t
  }, [source, data])
}

/** Unit vector from the scene toward the Sun. Almost in the equatorial plane, so the lunar south pole gets grazing light and long shadows. */
export const SUN_DIR = new THREE.Vector3(0.62, -0.09, 0.78).normalize()
