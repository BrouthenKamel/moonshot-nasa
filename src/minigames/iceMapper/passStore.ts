import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Whether the first mapping pass of a flight is behind the player. Saved, so a reload neither
 * replays a pass already flown nor loses the right to skip it.
 */
interface PassStore {
  /** The player has flown a pass at least once: from then on it can be skipped */
  played: boolean
  /** The flight (sim seed) whose pass is done, flown or skipped */
  doneSeed: number | null
  finish: (seed: number, flown: boolean) => void
  /** Dev builds only (window.__moonshot.icePass): the autopilot flies the pass, for checks and screenshots */
  devAutopilot: boolean
}

export const useIcePassStore = create<PassStore>()(
  persist(
    (set) => ({
      played: false,
      doneSeed: null,
      devAutopilot: false,
      finish: (seed, flown) => set((s) => ({ doneSeed: seed, played: s.played || flown })),
    }),
    { name: 'moonshot-ice-pass', partialize: (s) => ({ played: s.played, doneSeed: s.doneSeed }) },
  ),
)

/** Is the first mapping pass due for this flight? Once the craft is in its science orbit, before the pass is done. */
export function passDue(sim: { seed: number; phase: string; flight: { captured: boolean } }, doneSeed: number | null): boolean {
  return sim.flight.captured && sim.phase === 'orbit' && doneSeed !== sim.seed
}
