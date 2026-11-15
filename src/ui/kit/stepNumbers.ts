import type { DesignStep } from '../../sim/types'

/**
 * The one numbering and naming of the mission sequence, in play order. Brief is 0; the dock tabs,
 * every heading, the next buttons and the map's "Next:" tag all read from here.
 *
 * 'rocket' is no longer a step of its own: the rocket is explained inside the Craft step. The id
 * stays in DesignStep only so old saves still load (they open the Craft step).
 */
export const STEP_ORDER: DesignStep[] = ['brief', 'planning', 'instruments', 'spacecraft', 'orbit', 'ride', 'comms', 'go-nogo']

/** The steps that get a tab in the dock: every step but the brief */
export const TAB_STEPS: DesignStep[] = STEP_ORDER.filter((s) => s !== 'brief')

export function stepNumber(step: DesignStep): number {
  return STEP_ORDER.indexOf(step === 'rocket' ? 'spacecraft' : step)
}

/** The short name players read on the tab, the heading and the next button */
export const STEP_NAMES: Record<DesignStep, string> = {
  brief: 'Brief',
  planning: 'Plan',
  instruments: 'Science',
  rocket: 'Craft',
  spacecraft: 'Craft',
  orbit: 'Orbit',
  ride: 'Ride',
  comms: 'Comms',
  'go-nogo': 'Launch',
}

/** What follows the name in a step's heading, e.g. "Ride: getting to the Moon" */
const STEP_SUBTITLE: Record<DesignStep, string> = {
  brief: 'the mission',
  planning: 'time and money',
  instruments: 'seeing into the dark',
  rocket: 'build the CubeSat',
  spacecraft: 'build the CubeSat',
  orbit: 'circling the pole',
  ride: 'getting to the Moon',
  comms: 'getting the data home',
  'go-nogo': 'the Go/No-Go poll',
}

/** A step's heading: its name first, then what it is about */
export function stepTitle(step: DesignStep): string {
  return `${STEP_NAMES[step]}: ${STEP_SUBTITLE[step]}`
}

/** The step after this one in play order, or null after the last */
export function nextStep(step: DesignStep): DesignStep | null {
  const i = stepNumber(step)
  return i >= 0 && i < STEP_ORDER.length - 1 ? STEP_ORDER[i + 1] : null
}

/** The label of a step's next button, e.g. "Next: Ride →" */
export function nextLabel(step: DesignStep): string {
  const next = nextStep(step)
  return next ? `Next: ${STEP_NAMES[next]} →` : ''
}

/** The one question each step answers, in plain words */
export const STEP_QUESTION: Record<DesignStep, string> = {
  brief: 'What are we flying, and what counts as success?',
  planning: 'How much time to test, and how much money to hold back?',
  instruments: 'What can see into the dark?',
  rocket: 'Does it all fit, and does it make enough power?',
  spacecraft: 'Does it all fit, and does it make enough power?',
  orbit: 'How do we circle the pole?',
  ride: 'How do we get to the Moon?',
  comms: 'How does the data get home?',
  'go-nogo': 'Is every station go?',
}
