import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Mesh, MeshBasicMaterial, Vector3 } from 'three'
import type { RoomId } from '../rooms/ids'
import { ROOMS } from '../rooms/registry'
import { DOOR_ARRIVE_RADIUS, doorPoint } from './layout'

/** How close the astronaut must be before a locked door shows why */
const REASON_RADIUS = 5

export type DoorState = 'locked' | 'open' | 'next'

const COLOR: Record<DoorState, string> = {
  locked: '#6b7280',
  open: '#6ee7c8',
  next: '#ffc24d',
}

interface DoorProps {
  id: RoomId
  state: DoorState
  done: boolean
  /** Current position of whoever is walking the campus */
  getTarget: () => Vector3
  /** Walk toward the door; arriving opens it */
  onWalk: (id: RoomId) => void
  onEnter: (id: RoomId) => void
}

/** Glowing floor ring in front of a building, plus its floating label */
export function Door({ id, state, done, getTarget, onWalk, onEnter }: DoorProps) {
  const [x, z] = doorPoint(id)
  const ring = useRef<Mesh>(null)
  const disc = useRef<Mesh>(null)
  const inside = useRef<boolean | null>(null)
  const room = ROOMS[id]
  const locked = state === 'locked'
  // Quiet screen: a locked door explains itself only when the astronaut walks up to it
  const [nearby, setNearby] = useState(false)
  const nearbyRef = useRef(false)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const pulse = state === 'next' ? 0.5 + 0.5 * Math.sin(t * 3.2) : 0
    const ringMat = ring.current?.material as MeshBasicMaterial | undefined
    const discMat = disc.current?.material as MeshBasicMaterial | undefined
    if (ringMat) ringMat.opacity = locked ? 0.35 : state === 'next' ? 0.7 + 0.3 * pulse : 0.85
    if (discMat) discMat.opacity = locked ? 0.04 : state === 'next' ? 0.14 + 0.2 * pulse : 0.12
    if (ring.current) ring.current.scale.setScalar(state === 'next' ? 1 + 0.08 * pulse : 1)

    // Arrival: only fires on walking in, never because the walker already stood here
    const p = getTarget()
    const near = Math.hypot(p.x - x, p.z - z) < DOOR_ARRIVE_RADIUS
    const close = Math.hypot(p.x - x, p.z - z) < REASON_RADIUS
    if (close !== nearbyRef.current) {
      nearbyRef.current = close
      setNearby(close)
    }
    if (inside.current === null) inside.current = near
    else if (near && !inside.current && !locked) onEnter(id)
    inside.current = near
  })

  const color = COLOR[state]
  return (
    <group position={[x, 0.06, z]}>
      <mesh
        ref={disc}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          if (locked) return
          e.stopPropagation()
          onWalk(id)
        }}
        onPointerOver={() => !locked && (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <circleGeometry args={[DOOR_ARRIVE_RADIUS, 32]} />
        <meshBasicMaterial color={color} transparent depthWrite={false} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[DOOR_ARRIVE_RADIUS * 0.82, 0.07, 8, 40]} />
        <meshBasicMaterial color={color} transparent toneMapped={false} />
      </mesh>
      {locked && nearby && (
        <Html position={[0, 1.3, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="w-36 rounded bg-ink-0/80 px-2 py-1 text-center text-[10px] leading-tight text-paper-dim" data-testid={`locked-${id}`}>
            {room.lockedReason}
          </div>
        </Html>
      )}
      {done && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[DOOR_ARRIVE_RADIUS * 0.4, DOOR_ARRIVE_RADIUS * 0.5, 24]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  )
}
