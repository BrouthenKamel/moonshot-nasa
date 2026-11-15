import { getGroundStationById, type GroundStation } from '../../../data/ground'
import type { Design } from '../../../sim/types'

/** The hours a day the player set on each station, kept for the session so switching back restores them */
const remembered = new Map<string, number>()

/** Remember the hours booked on the station the design has now (call before switching away from it) */
export function rememberHours(design: Design): void {
  const station = getGroundStationById(design.groundStation)
  if (station) remembered.set(station.id, design.contactHours ?? station.defaultHours)
}

/** For tests: forget every remembered booking */
export function forgetRememberedHours(): void {
  remembered.clear()
}

/**
 * The hours a day booked after switching to a station: what the player had set there last time, else
 * the step's own rule (keep the hours as far as the station allows). Never more than the station offers.
 */
export function hoursAfterSwitch(design: Design, station: GroundStation): number {
  const before = remembered.get(station.id)
  return Math.min(before ?? design.contactHours ?? station.defaultHours, station.contactHoursPerDay)
}
