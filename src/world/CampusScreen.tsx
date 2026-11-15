import { Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { Vector3 } from 'three'
import { useCampusStore } from '../state/campusStore'
import { useGameStore } from '../state/gameStore'
import { WorldRoot } from './WorldRoot'
import { ROOMS, nextRoom, type RoomId } from './rooms/registry'
import { Astronaut, type AstronautHandle } from './player/Astronaut'
import { CartFollower } from './player/CartFollower'
import { AstronautSetup } from './player/AstronautSetup'
import { usePlayerStore } from './player/playerStore'
import { campusNavGrid } from './campus/campusNav'
import { SPAWN, doorPoint } from './campus/layout'
import { ResourceStrip } from './hud/ResourceStrip'

/** The door the astronaut last walked through: they come back out there, not at spawn */
let lastDoor: RoomId | null = null

function CampusWorld() {
  const grid = useMemo(() => campusNavGrid(), [])
  const astro = useRef<AstronautHandle>(null)
  const [clickTarget, setClickTarget] = useState<Vector3 | null>(null)
  const setupDone = usePlayerStore((s) => s.setupDone)
  const start = useMemo(() => {
    const [x, z] = lastDoor ? doorPoint(lastDoor) : SPAWN
    return { x, z }
  }, [])
  const fallback = useMemo(() => new Vector3(start.x, 0, start.z), [start])
  const followTarget = useCallback(() => astro.current?.getPosition() ?? fallback, [fallback])
  const onGroundClick = useCallback((p: Vector3) => setClickTarget(p.clone()), [])

  return (
    <>
      <WorldRoot followTarget={followTarget} onGroundClick={onGroundClick}>
        <Astronaut ref={astro} navGrid={grid} clickTarget={clickTarget} start={start} controlsEnabled={setupDone} />
        <CartFollower leader={astro} />
      </WorldRoot>
      <AstronautSetup />
    </>
  )
}

/**
 * The Ice Hunters campus: a 3D miniature (WorldRoot) with one objective line, or the active room.
 */
export function CampusScreen() {
  const currentRoom = useCampusStore((s) => s.currentRoom)
  const completed = useCampusStore((s) => s.completedRooms)
  const leaveRoom = useCampusStore((s) => s.leaveRoom)
  const completeRoom = useCampusStore((s) => s.completeRoom)
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)

  if (currentRoom) {
    lastDoor = currentRoom
    const room = ROOMS[currentRoom]
    const Room = room.component
    return (
      <div className="h-screen bg-ink-0" data-room={room.id}>
        <Suspense fallback={<div className="fp-label p-6">Opening the door…</div>}>
          <Room
            design={design}
            difficulty={difficulty}
            replay={completed.includes(room.id)}
            onExit={leaveRoom}
            onComplete={(r) => {
              completeRoom(room.id, r)
              // Mission Control hands over to the existing flight until WP-3A lands
              if (room.id === 'mission-control') useGameStore.getState().reviseAt('go-nogo')
            }}
          />
        </Suspense>
      </div>
    )
  }

  const suggested = nextRoom(completed)
  return (
    <div className="relative h-screen overflow-hidden bg-ink-0" data-testid="campus">
      <CampusWorld />
      <ResourceStrip />
      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
        <div
          data-testid="objective"
          className="rounded-full bg-ink-0/75 px-4 py-1.5 text-sm text-paper shadow"
        >
          {suggested
            ? `${ROOMS[suggested].title}: ${ROOMS[suggested].tagline}`
            : 'Every room is done. Walk back to Mission Control.'}
        </div>
      </div>
    </div>
  )
}
