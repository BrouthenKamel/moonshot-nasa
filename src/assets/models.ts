import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Object3D } from 'three'
import type { ModelId } from './manifest'
import { assetUrl } from './url'

/*
 * Models are meshopt-compressed .glb files (see scripts/assets/build-models.ts).
 * Draco is off: drei would fetch its decoder from a CDN at runtime, which fails offline.
 * The meshopt decoder is bundled with the app.
 */
const DRACO = false
const MESHOPT = true

/** Load a model by manifest id. Returns a private clone, safe to mutate (visibility, pivots). */
export function useModel(id: ModelId): Object3D {
  const { scene } = useGLTF(assetUrl(id), DRACO, MESHOPT)
  return useMemo(() => scene.clone(true), [scene])
}

export function preloadModel(id: ModelId) {
  useGLTF.preload(assetUrl(id), DRACO, MESHOPT)
}

/**
 * Show the `part_<id>` nodes listed in `partIds` and hide every other `part_` node.
 * Nodes without the prefix are always shown.
 */
export function showParts(root: Object3D, partIds: Iterable<string>) {
  const wanted = new Set(partIds)
  root.traverse((o) => {
    if (o.name.startsWith('part_')) o.visible = wanted.has(o.name.slice(5))
  })
}

/** Find a `pivot_<name>` node to animate (e.g. solar wing deployment) */
export function getPivot(root: Object3D, name: string): Object3D | undefined {
  return root.getObjectByName(`pivot_${name}`)
}
