import { Suspense } from 'react'
import { useCampusStore } from '../state/campusStore'
import { useGameStore } from '../state/gameStore'
import { ROOMS, ROOM_IDS, isUnlocked, nextRoom } from './rooms/registry'

/**
 * The Ice Hunters campus. Wave 0: a plain door list so the whole flow works end to end.
 * WP-1A replaces the door list with the 3D miniature campus (WorldRoot); WP-1B adds the astronaut.
 */
export function CampusScreen() {
  const currentRoom = useCampusStore((s) => s.currentRoom)
  const completed = useCampusStore((s) => s.completedRooms)
  const enterRoom = useCampusStore((s) => s.enterRoom)
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
    <div className="h-screen overflow-auto bg-ink-0 p-8 text-paper" data-testid="campus">
      <h1 className="fp-display text-2xl">Campus</h1>
      <div className="mt-6 grid max-w-3xl grid-cols-2 gap-3">
        {ROOM_IDS.map((id) => {
          const room = ROOMS[id]
          const open = isUnlocked(id, completed)
          return (
            <button
              key={id}
              type="button"
              disabled={!open}
              data-testid={`door-${id}`}
              onClick={() => enterRoom(id)}
              className={`rounded-lg border p-4 text-left ${id === suggested ? 'border-kapton' : 'border-rule'} disabled:opacity-40`}
            >
              <div className="fp-display">
                {room.title} {completed.includes(id) ? '✓' : ''}
              </div>
              <div className="text-sm text-paper-dim">{open ? room.tagline : room.lockedReason}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
