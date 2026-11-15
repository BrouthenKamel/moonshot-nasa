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

// Golden-hour coastal scrub, a step darker than BaseMap's ground (#8a9a58) so the island's
// clearing and the light buildings still read first: olive and sage crowns, dry khaki tips,
// deep slash-pine greens, and a few sun-burnt sand/ochre trees for variety.
const TRUNK = new Color('#5e4632')
const LEAF_A = new Color('#56643a') // olive
const LEAF_B = new Color('#6f7a4c') // sage
const LEAF_DRY = new Color('#8d8556') // dry khaki
const PINE_A = new Color('#3e4b31')
const PINE_B = new Color('#4d5a3a')
const AUTUMN = [new Color('#8a7246'), new Color('#968259'), new Color('#76673f')]

/** A second, position-based random so the tint varies independently of size and turn */
function hash(x: number, z: number) {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453
  return v - Math.floor(v)
}

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
    const place = (mesh: InstancedMesh | null, list: TreeSpot[], y: number, a: Color, b: Color, dry: Color | null) => {
      if (!mesh) return
      list.forEach((t, i) => {
        d.position.set(t.x, ground + y * t.s, t.z)
        d.scale.set(t.s, t.s * (0.9 + t.shade * 0.3), t.s)
        d.rotation.set(0, t.shade * Math.PI * 2, 0)
        d.updateMatrix()
        mesh.setMatrixAt(i, d.matrix)
        const h = hash(t.x, t.z)
        c.copy(a).lerp(b, t.shade)
        if (dry && h < 0.045) c.copy(AUTUMN[Math.floor(h * 200) % AUTUMN.length])
        else if (dry && h > 0.72) c.lerp(dry, (h - 0.72) * 1.6)
        else if (!dry) c.lerp(PINE_B, h * 0.4)
        mesh.setColorAt(i, c)
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    place(roundRef.current, round, 0.8, LEAF_A, LEAF_B, LEAF_DRY)
    place(pineRef.current, pines, 0.95, PINE_A, PINE_B, null)
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
