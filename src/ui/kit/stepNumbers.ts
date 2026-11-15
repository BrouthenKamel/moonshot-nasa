import type { DesignStep } from '../../sim/types'

/** The one numbering of the mission sequence. Brief is 0; every heading and the rail read from here. */
export const STEP_ORDER: DesignStep[] = [
  'brief',
  'planning',
  'instruments',
  'rocket',
  'spacecraft',
  'orbit',
  'ride',
  'comms',
  'go-nogo',
]

export function stepNumber(step: DesignStep): number {
  return STEP_ORDER.indexOf(step)
}

/** The one question each step answers, in plain words */
export const STEP_QUESTION: Record<DesignStep, string> = {
  brief: 'What are we flying, and what counts as success?',
  planning: 'How much time to test, and how much money to hold back?',
  instruments: 'What can see into the dark?',
  rocket: 'What carries us off the pad?',
  spacecraft: 'Does it all fit, and does it make enough power?',
  orbit: 'How do we circle the pole?',
  ride: 'How do we get to the Moon?',
  comms: 'How does the data get home?',
  'go-nogo': 'Is every station go?',
}
