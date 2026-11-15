import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useDragStore, type DragPayload, type DropSlotSpec } from '../../ui/interaction/dragStore'
import { liveSpec } from '../../ui/interaction/drag'
import { registerSlot } from '../../ui/interaction/dragStore'

type Vec3 = [number, number, number]

const PAPER = new THREE.Color('#ede6d6')
const KAPTON = new THREE.Color('#e8a33d')
const NOGO = new THREE.Color('#d0533f')

export interface DropSlotProps {
  id: string
  /** Design fields this slot takes */
  accepts: ReadonlyArray<string>
  position: Vec3
  /** Box size in metres (the slot volume) */
  size: Vec3
  rotation?: Vec3
  refuse?: (p: DragPayload) => string | null
  onDrop?: (p: DragPayload) => void
  preview?: boolean
  /** Show the faint paper outline when nothing is held (default false: slots appear when a part is lifted) */
  idleVisible?: boolean
}

/**
 * A 3D drop target: a hairline box at an anchor. Dashed paper when idle, dashed Kapton when a part
 * it takes is held, solid Kapton under the pointer, solid nogo when it would refuse the part. No
 * glow halos. Hovering previews the part (`setPreviewPatch`); a drop calls `updateDesign` and plays
 * the snap. The invisible box only catches the pointer while something is held, so it never steals
 * clicks from the craft.
 */
export function DropSlot({ id, accepts, position, size, rotation = [0, 0, 0], refuse, onDrop, preview, idleVisible = false }: DropSlotProps) {
  const specRef = useRef<DropSlotSpec>({ id, accepts, refuse, onDrop, preview })
  specRef.current = { id, accepts, refuse, onDrop, preview }
  useEffect(() => registerSlot(liveSpec(id, specRef)), [id])

  const held = useDragStore((s) => s.held)
  const over = useDragStore((s) => (s.over?.slotId === id ? s.over : null))
  const enter = useDragStore((s) => s.enter)
  const leave = useDragStore((s) => s.leave)
  const compatible = !!held && accepts.includes(held.field as string)

  const edges = useMemo(() => {
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(size[0], size[1], size[2]))
    return g
  }, [size[0], size[1], size[2]]) // eslint-disable-line react-hooks/exhaustive-deps
  const line = useRef<THREE.LineSegments>(null)
  const dashed = useMemo(() => new THREE.LineDashedMaterial({ color: PAPER, dashSize: 0.012, gapSize: 0.008, transparent: true, opacity: 0.35, depthWrite: false }), [])
  const solid = useMemo(() => new THREE.LineBasicMaterial({ color: KAPTON, transparent: true, opacity: 1, depthWrite: false }), [])
  useEffect(() => {
    line.current?.computeLineDistances()
  }, [edges])
  useEffect(
    () => () => {
      edges.dispose()
      dashed.dispose()
      solid.dispose()
    },
    [edges, dashed, solid],
  )

  const visible = compatible || (idleVisible && !held)
  useFrame((st) => {
    const l = line.current
    if (!l) return
    if (over) {
      l.material = solid
      solid.color.copy(over.ok ? KAPTON : NOGO)
    } else {
      l.material = dashed
      dashed.color.copy(compatible ? KAPTON : PAPER)
      dashed.opacity = compatible ? 0.6 + 0.25 * Math.sin(st.clock.elapsedTime * 4) : 0.25
    }
  })

  return (
    <group position={position} rotation={rotation}>
      <lineSegments ref={line} geometry={edges} material={dashed} visible={visible} renderOrder={5} />
      <mesh
        visible={false}
        raycast={held ? THREE.Mesh.prototype.raycast : () => null}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          enter(id)
        }}
        onPointerOut={() => leave(id)}
      >
        <boxGeometry args={[size[0] * 1.15, size[1] * 1.15, size[2] * 1.15]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  )
}
