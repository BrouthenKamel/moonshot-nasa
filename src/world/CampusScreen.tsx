import { Suspense } from 'react'
import { useCampusStore } from '../state/campusStore'
import { useGameStore } from '../state/gameStore'
import { WorldRoot } from './WorldRoot'
import { ROOMS, nextRoom } from './rooms/registry'

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
      <WorldRoot />
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
