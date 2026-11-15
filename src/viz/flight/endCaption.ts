import type { SimState } from '../../sim/types'

/**
 * The space view's caption once the flight is over (QC, 15 Nov): the camera shot still follows the flight
 * log, so a craft lost on launch day read "On the way to the Moon · 8% · about 360 days to go" behind
 * the failed card. When the flight has ended, its end decides the caption. Null while it is still flying.
 */
const LOST: Record<string, string> = {
  'lost contact after deployment': 'Lost at deployment · no signal since launch',
  'not enough delta-v left to capture': 'Lost · could not brake into lunar orbit',
  'out of propellant, orbit lost': 'Lost · out of propellant, the orbit decayed',
}

export function endCaption(sim: SimState): string | null {
  if (sim.phase !== 'failed' && sim.phase !== 'complete') return null
  const end = sim.flight.end
  if (LOST[end]) return LOST[end]
  return end ? `Mission over · ${end}` : 'Mission over'
}
