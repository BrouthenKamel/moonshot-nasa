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
