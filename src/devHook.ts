import { useGameStore } from './state/gameStore'
import { useUiStore } from './state/uiStore'
import { useDragStore } from './ui/interaction/dragStore'
import { useInsideStore } from './ui/interaction/insideStore'

/**
 * Dev builds only: the stores on `window.__moonshot`, so the Playwright checks in `scripts/e2e`
 * can jump straight to a step and read the design after a drag. Never shipped in production.
 */
export function installDevHook() {
  ;(window as unknown as { __moonshot: unknown }).__moonshot = { game: useGameStore, ui: useUiStore, drag: useDragStore, inside: useInsideStore }
}
