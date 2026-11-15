import { useGameStore } from './state/gameStore'
import { useUiStore } from './state/uiStore'
import { useDragStore } from './ui/interaction/dragStore'
import { useInsideStore } from './ui/interaction/insideStore'
import { useCampusStore } from './state/campusStore'
import type { RoomId } from './world/rooms/ids'
import type { Design } from './sim/types'

/**
 * Dev builds only: the stores on `window.__moonshot`, so the Playwright checks in `scripts/e2e`
 * can jump straight to a step and read the design after a drag. Never shipped in production.
 */
export function installDevHook() {
  ;(window as unknown as { __moonshot: unknown }).__moonshot = { game: useGameStore, ui: useUiStore, drag: useDragStore, inside: useInsideStore }
}

/** Ice Hunters e2e: `window.__game.completeRoom(id, patch)` finishes a room without playing it */
export function installCampusDevHook() {
  ;(window as unknown as { __game: unknown }).__game = {
    campus: useCampusStore,
    completeRoom: (id: RoomId, patch: Partial<Design> = {}) =>
      useCampusStore.getState().completeRoom(id, { patch, insights: [], durationS: 0 }),
  }
}
