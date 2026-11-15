import type { CheckResult } from '../../sim/types'

/**
 * One short line per Go/No-Go card (screen budget, Jakob 15 Nov): the card shows this and its Fix link;
 * the full reason, with its numbers, waits behind Details. A check that sets its own headline wins;
 * otherwise the reason's first clause, if it reads without numbers; otherwise a fixed line per row.
 */
const FALLBACK: Record<string, { red: string; yellow: string }> = {
  Mass: { red: 'Too heavy for the ride', yellow: 'Little mass to spare' },
  Volume: { red: 'The parts do not fit', yellow: 'Little room to spare' },
  Time: { red: 'Not ready when the ride leaves', yellow: 'No time to spare before the ride' },
  'Delta-v': { red: 'Not enough delta-v', yellow: 'Little delta-v to spare' },
  Power: { red: 'Not enough power', yellow: 'Power is tight' },
  Comms: { red: 'No link home', yellow: 'The radio is short of power' },
  'Data Link': { red: 'The data cannot get home', yellow: 'Not all the data gets home' },
  Budget: { red: 'Over budget', yellow: 'Little money to spare' },
  Science: { red: 'The science falls short', yellow: 'Unlikely to fully succeed' },
}

const MAX_WORDS = 12

export function checkHeadline(check: CheckResult): string {
  if (check.headline) return check.headline
  const first = check.reason.split(/(?<=[.:])\s/)[0].replace(/[.:]$/, '')
  if (!/\d/.test(first) && first.split(/\s+/).length <= MAX_WORDS) return first
  const tone = check.status === 'red' ? 'red' : 'yellow'
  return FALLBACK[check.resource]?.[tone] ?? `${check.resource}: ${tone === 'red' ? 'no-go' : 'caution'}`
}
