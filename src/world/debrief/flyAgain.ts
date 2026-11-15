import { useCampusStore } from '../../state/campusStore'
import { useGameStore } from '../../state/gameStore'
import type { RoomId } from '../rooms/ids'

/**
 * "Fly again": back to the campus with the craft intact (design, finished rooms and
 * insights all kept), straight into the one room the player wants to redesign.
 * The next launch from Mission Control starts a fresh flight from this design.
 */
export function flyAgain(room: RoomId | null) {
  useGameStore.getState().setScreen('base')
  if (room) useCampusStore.getState().enterRoom(room)
}
