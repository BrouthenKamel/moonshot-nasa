import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Object3D, type InstancedMesh } from 'three'

/**
 * A forest around the island, so the base sits in a clearing instead of on an empty
 * plain. Cheap on purpose: three instanced meshes (trunks, round crowns, pines),
 * placed once, no shadows, no animation.
 */

function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface TreeSpot {
  x: number
  z: number
  s: number
  pine: boolean
  shade: number
}

/** Trees on a jittered grid between the island's edge and `outer`, thinning out far away */
function spots(half: number, outer: number): TreeSpot[] {
  const r = rng(29)
  const out: TreeSpot[] = []
  const step = 0.85
  for (let gx = -outer; gx <= outer; gx += step) {
    for (let gz = -outer; gz <= outer; gz += step) {
      const x = gx + (r() - 0.5) * step * 0.9
      const z = gz + (r() - 0.5) * step * 0.9
      const edge = Math.max(Math.abs(x), Math.abs(z))
      if (edge < half + 0.6) continue // the island and its cliff
      const far = (edge - half) / (outer - half)
      if (r() < far * 0.35) continue // a few clearings further out
      out.push({ x, z, s: 0.75 + r() * 0.65, pine: r() < 0.35, shade: r() })
    }
  }
  return out
}

/** How far the forest reaches beyond the island edge, in tiles; the base camera stays inside it */
export const FOREST_REACH = 20

const TRUNK = new Color('#6e4a2c')
const LEAF_A = new Color('#3d8b37')
const LEAF_B = new Color('#2f6f2e')
const PINE_A = new Color('#2c6b3a')
const PINE_B = new Color('#245a31')

export function Forest({ half, ground }: { half: number; ground: number }) {
  const trees = useMemo(() => spots(half, half + FOREST_REACH), [half])
  const round = useMemo(() => trees.filter((t) => !t.pine), [trees])
  const pines = useMemo(() => trees.filter((t) => t.pine), [trees])
  const trunkRef = useRef<InstancedMesh>(null)
  const roundRef = useRef<InstancedMesh>(null)
  const pineRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const d = new Object3D()
    const c = new Color()
    const trunks = trunkRef.current
    if (trunks) {
      trees.forEach((t, i) => {
        d.position.set(t.x, ground + 0.25 * t.s, t.z)
        d.scale.setScalar(t.s)
        d.rotation.set(0, 0, 0)
        d.updateMatrix()
        trunks.setMatrixAt(i, d.matrix)
        trunks.setColorAt(i, TRUNK)
      })
      trunks.instanceMatrix.needsUpdate = true
      if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true
    }
    const place = (mesh: InstancedMesh | null, list: TreeSpot[], y: number, a: Color, b: Color) => {
      if (!mesh) return
      list.forEach((t, i) => {
        d.position.set(t.x, ground + y * t.s, t.z)
        d.scale.set(t.s, t.s * (0.9 + t.shade * 0.3), t.s)
        d.rotation.set(0, t.shade * Math.PI * 2, 0)
        d.updateMatrix()
        mesh.setMatrixAt(i, d.matrix)
        mesh.setColorAt(i, c.copy(a).lerp(b, t.shade))
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    place(roundRef.current, round, 0.8, LEAF_A, LEAF_B)
    place(pineRef.current, pines, 0.95, PINE_A, PINE_B)
  }, [trees, round, pines, ground])

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, trees.length]}>
        <cylinderGeometry args={[0.07, 0.1, 0.5, 5]} />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh ref={roundRef} args={[undefined, undefined, round.length]}>
        <icosahedronGeometry args={[0.45, 0]} />
        <meshLambertMaterial flatShading />
      </instancedMesh>
      <instancedMesh ref={pineRef} args={[undefined, undefined, pines.length]}>
        <coneGeometry args={[0.38, 1.1, 6]} />
        <meshLambertMaterial flatShading />
      </instancedMesh>
    </group>
  )
}
