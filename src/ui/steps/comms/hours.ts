import type { GroundStation } from '../../../data/ground'
import type { Design } from '../../../sim/types'

/** The hours a day booked after switching to a station (the step's own rule, kept from before) */
export function hoursAfterSwitch(design: Design, station: GroundStation): number {
  return Math.min(design.contactHours ?? station.defaultHours, station.contactHoursPerDay)
}
