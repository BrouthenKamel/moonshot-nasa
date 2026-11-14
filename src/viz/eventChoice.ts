import type { TurnEvent } from '../sim/types'

/**
 * What came of the player's answer to an event card, as the replay shows it after the choice.
 * Choosing to accept a loss is a decision, not a try that failed.
 */
export function choiceResultText(ev: TurnEvent): string | null {
  if (ev.choiceSucceeded === undefined) return null
  if (ev.eventId === 'no-signal' && ev.choiceId === 'give-up') return ' (you chose to stop; the craft was lost)'
  if (ev.eventId === 'thruster' && ev.choiceId === 'accept') return ' (you chose to fly on with the weak engine)'
  return ev.choiceSucceeded ? ' - succeeded' : ' - failed'
}
