import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Once a player has flown the first mapping pass, later flights let them skip it. Saved. */
export const useIcePassStore = create<{ played: boolean; markPlayed: () => void }>()(
  persist((set) => ({ played: false, markPlayed: () => set({ played: true }) }), { name: 'moonshot-ice-pass' }),
)

/**
 * Is the first mapping pass due? On arrival in the science orbit, before the first science month,
 * and only once a flight (its result is saved in the flight as `firstPass`). A flight that has
 * already flown a science month keeps the autopilot's month 1, so there is one pass, in month 1 only.
 */
export function passDue(sim: { phase: string; firstPass?: unknown; flight: { captured: boolean; scienceTurns: number } }): boolean {
  return sim.phase === 'orbit' && sim.flight.captured && sim.flight.scienceTurns === 0 && sim.firstPass === undefined
}
