/**
 * Demo switch, 15 Nov: Jakob compares the Plan screen before and after the Details control on one
 * server. `?plan=old` shows Plan as it was (schedule wall, reserve box and the full big screen always
 * visible, the long wall header); without it, the new screen. Remove this file and its three uses
 * (PlanningScreen, ControlRoom, the painter's `header` option) once he has decided.
 */
export function wantsOldPlan(search = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  return new URLSearchParams(search).get('plan') === 'old'
}

export const OLD_PLAN_HEADER = 'COMMS CENTER  ·  LUNAR ICE MAPPER  ·  MISSION PLANNING'
