/**
 * The Comms console's two controls, as plain functions: the contact-hours track and the dish
 * aim rail. Both work by pointer and by keyboard; these give the value for either.
 */

export const MIN_CONTACT_HOURS = 0.25

/** Snap pointer X inside the track to a 0.25 h booking in [0.25, maxHours] */
export function hoursFromTrackX(clientX: number, rectLeft: number, rectWidth: number, maxHours: number): number {
  const min = MIN_CONTACT_HOURS
  const span = Math.max(0.25, maxHours - min)
  const t = Math.min(1, Math.max(0, (clientX - rectLeft) / Math.max(1, rectWidth)))
  const raw = min + t * span
  const snapped = Math.round(raw * 4) / 4
  return Math.min(maxHours, Math.max(min, snapped))
}

/**
 * The dish aim handle by keyboard: arrows step one station, Home / End jump to the ends.
 * Returns the new index, or null for a key the handle does not use.
 */
export function aimIndexForKey(key: string, current: number, count: number): number | null {
  if (count <= 0) return null
  const last = count - 1
  if (key === 'ArrowRight' || key === 'ArrowUp') return Math.min(last, current + 1)
  if (key === 'ArrowLeft' || key === 'ArrowDown') return Math.max(0, current - 1)
  if (key === 'Home') return 0
  if (key === 'End') return last
  return null
}

/** What a dish size gives and what it limits, in the player's words: "64 kbps · up to 2 h a day" */
export function dishTradeoff(station: { rateKbps: number; contactHoursPerDay: number }): string {
  const hours = station.contactHoursPerDay <= 1 ? '1 hour a day at most' : `up to ${station.contactHoursPerDay} h a day`
  return `${station.rateKbps} kbps · ${hours}`
}

/** The dish's running cost: "$0.03M a month" */
export function dishPriceLine(costPerMonth: number): string {
  return `$${costPerMonth.toFixed(2)}M a month`
}
