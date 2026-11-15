import { useLayoutEffect, useMemo, useRef } from 'react'
import { Html } from '@react-three/drei'
import { Object3D, type InstancedMesh, type Vector3 } from 'three'
import { useCampusStore } from '../../state/campusStore'
import { ROOM_IDS, type RoomId } from '../rooms/ids'
import { ROOMS, isUnlocked, nextRoom } from '../rooms/registry'
import { BuildingModel } from './Buildings'
import { Door, type DoorState } from './Door'
import { Headquarters } from './HqBoard'
import { BUILDINGS, HQ, PLAZA_RADIUS } from './layout'

/** Deterministic pseudo random so the trees never jump between renders */
function rand(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function Trees() {
  const canopy = useRef<InstancedMesh>(null)
  const trunk = useRef<InstancedMesh>(null)
  const spots = useMemo(() => {
    const out: { x: number; z: number; s: number }[] = []
    for (let i = 0; out.length < 46 && i < 400; i++) {
      const a = rand(i) * Math.PI * 2
      const r = 20 + rand(i + 900) * 12
      const x = Math.sin(a) * r
      const z = Math.cos(a) * r
      if (Math.abs(x - HQ.pos[0]) < 6 && Math.abs(z - HQ.pos[1]) < 5) continue
      out.push({ x, z, s: 0.8 + rand(i + 50) * 0.7 })
    }
    return out
  }, [])
  useLayoutEffect(() => {
    const o = new Object3D()
    spots.forEach((t, i) => {
      o.position.set(t.x, 1.5 * t.s + 0.6, t.z)
      o.scale.setScalar(t.s)
      o.updateMatrix()
      canopy.current?.setMatrixAt(i, o.matrix)
      o.position.set(t.x, 0.35 * t.s, t.z)
      o.scale.set(t.s, t.s, t.s)
      o.updateMatrix()
      trunk.current?.setMatrixAt(i, o.matrix)
    })
    if (canopy.current) canopy.current.instanceMatrix.needsUpdate = true
    if (trunk.current) trunk.current.instanceMatrix.needsUpdate = true
  }, [spots])
  return (
    <group>
      <instancedMesh ref={canopy} args={[undefined, undefined, spots.length]} castShadow>
        <coneGeometry args={[1.1, 3, 7]} />
        <meshStandardMaterial color="#5f8f55" roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={trunk} args={[undefined, undefined, spots.length]}>
        <cylinderGeometry args={[0.16, 0.2, 0.9, 6]} />
        <meshStandardMaterial color="#6b4e37" />
      </instancedMesh>
    </group>
  )
}

function Paths() {
  return (
    <group>
      {ROOM_IDS.map((id) => {
        const [dx, dz] = BUILDINGS[id].door
        const len = Math.hypot(dx, dz) - PLAZA_RADIUS + 0.5
        const mid = PLAZA_RADIUS - 0.5 + len / 2
        const ux = dx / Math.hypot(dx, dz)
        const uz = dz / Math.hypot(dx, dz)
        return (
          <mesh
            key={id}
            position={[ux * mid, 0.025, uz * mid]}
            rotation={[0, Math.atan2(ux, uz), 0]}
            receiveShadow
          >
            <boxGeometry args={[1.6, 0.05, len]} />
            <meshStandardMaterial color="#d8cdb4" roughness={1} />
          </mesh>
        )
      })}
      {/* HQ path */}
      <mesh position={[0, 0.025, (HQ.pos[1] + HQ.size[1] / 2 + PLAZA_RADIUS) / 2 + 1]} receiveShadow>
        <boxGeometry args={[2, 0.05, PLAZA_RADIUS + Math.abs(HQ.pos[1]) - HQ.size[1] / 2 - 3.5]} />
        <meshStandardMaterial color="#d8cdb4" roughness={1} />
      </mesh>
    </group>
  )
}

interface CampusProps {
  getTarget: () => Vector3
  /** Walk toward a room's door */
  onWalk: (id: RoomId) => void
}

/** The miniature campus: ground, plaza, paths, HQ, eight buildings and their door portals */
export function Campus({ getTarget, onWalk }: CampusProps) {
  const completed = useCampusStore((s) => s.completedRooms)
  const enterRoom = useCampusStore((s) => s.enterRoom)
  const suggested = nextRoom(completed)

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[40, 64]} />
        <meshStandardMaterial color="#9bc08a" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
        <circleGeometry args={[PLAZA_RADIUS, 48]} />
        <meshStandardMaterial color="#d9d3c4" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[PLAZA_RADIUS - 0.3, PLAZA_RADIUS - 0.15, 48]} />
        <meshStandardMaterial color="#b8ad94" />
      </mesh>
      {/* drei Html drops the first instance mounted under StrictMode (its unmount lands mid-render); this one is the sacrifice */}
      <Html style={{ display: "none" }}>
        <span />
      </Html>
      <Paths />
      <Trees />
      <Headquarters />

      {ROOM_IDS.map((id) => {
        const b = BUILDINGS[id]
        const open = isUnlocked(id, completed)
        const state: DoorState = !open ? 'locked' : id === suggested ? 'next' : 'open'
        return (
          <group key={id}>
            <group position={[b.pos[0], 0, b.pos[1]]} rotation={[0, b.yaw, 0]}>
              <BuildingModel id={id} size={b.size} />
            </group>
            <Html
              position={[b.pos[0], 4.6, b.pos[1]]}
              center
              zIndexRange={[10, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <button
                type="button"
                data-testid={`door-${id}`}
                data-state={state}
                disabled={!open}
                onClick={() => onWalk(id)}
                className={`pointer-events-auto whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide shadow ${
                  state === 'locked'
                    ? 'cursor-default bg-ink-0/60 text-paper-faint'
                    : state === 'next'
                      ? 'cursor-pointer bg-kapton text-kapton-ink'
                      : 'cursor-pointer bg-ink-0/80 text-paper'
                }`}
              >
                {ROOMS[id].title}
                {completed.includes(id) ? ' ✓' : ''}
              </button>
            </Html>
            <Door
              id={id}
              state={state}
              done={completed.includes(id)}
              getTarget={getTarget}
              onWalk={onWalk}
              onEnter={enterRoom}
            />
          </group>
        )
      })}
    </group>
  )
}
