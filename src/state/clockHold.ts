/**
 * When the agency clock holds although its speed says it runs: the player is reading.
 *
 * - An event card waits for an answer.
 * - The launch animation plays on the island.
 * - A modal is open over the base (New mission, Headquarters, the result, the vitality dial…).
 *
 * Building interiors need no rule here: they replace the base screen, and the clock only runs
 * while the base screen is open (useAgencyClock).
 */
export interface ClockHoldInput {
  decisionWaiting: boolean
  launching: boolean
  modalOpen: boolean
}

export function clockHeld({ decisionWaiting, launching, modalOpen }: ClockHoldInput): boolean {
  return decisionWaiting || launching || modalOpen
}

/**
 * Every modal in the game marks itself `aria-modal="true"` (the kit Modal, the result dialog,
 * the HUD dial), so one look at the page covers them all without each dialog reporting in.
 * No page (tests, server render): nothing is open.
 */
export function modalOpenOnPage(): boolean {
  if (typeof document === 'undefined') return false
  return document.querySelector('[aria-modal="true"]') !== null
}

/*
 * Auto-pause: the clock never runs for nobody. A hidden tab, or a long stretch with no input,
 * sets the speed to paused (not just a hold), so it resumes only when the player presses Play.
 * Without this an unattended tab once flew a whole mission to its end in about 25 minutes.
 */

/** No pointer, key or wheel input for this long pauses the clock (5 minutes) */
export const IDLE_PAUSE_MS = 5 * 60_000

export type AutoPauseReason = 'hidden' | 'idle'

export function autoPauseReason({ hidden, idleMs }: { hidden: boolean; idleMs: number }): AutoPauseReason | null {
  if (hidden) return 'hidden'
  if (idleMs >= IDLE_PAUSE_MS) return 'idle'
  return null
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
let lastInputAt = now()

/** The player did something (called by the page listeners below; tests call it directly) */
export function noteInput(at = now()) {
  lastInputAt = at
}

export function idleFor(at = now()): number {
  return Math.max(0, at - lastInputAt)
}

export function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden === true
}

if (typeof window !== 'undefined') {
  for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const) {
    window.addEventListener(type, () => noteInput(), { passive: true, capture: true })
  }
}
