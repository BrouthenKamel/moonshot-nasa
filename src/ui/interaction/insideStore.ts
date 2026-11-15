import { create } from 'zustand'

/**
 * "Look inside" moments: a short (5-15 s), skippable camera shot that a step earns (look through the
 * instrument, ride inside the fairing, stand at the dish). The DOM side is here: letterbox bars, the
 * one caption, Skip. The camera side is `useInsidePath` in `src/scene/interaction/InsideCam.tsx`.
 */
export interface InsideShot {
  /** Which moment, e.g. 'fairing-ride', 'look-through', 'integrated' */
  id: string
  /** The caption line under the picture */
  caption: string
  /** Seconds; the scene ends it earlier with `end()` when its own sequence finishes */
  durationS: number
  /** Called once when the shot ends, skipped or not */
  onEnd?: (skipped: boolean) => void
  /** Join the shot's own sequence this many seconds in (its earlier beats were shown another way) */
  startAtS?: number
}

interface InsideState {
  shot: InsideShot | null
  /** performance.now() when the shot started */
  startedAt: number
  /** Caption updates while the shot plays (e.g. "Max-Q", "Fairing separation") */
  caption: string
  play: (shot: InsideShot) => void
  setCaption: (caption: string) => void
  end: (skipped?: boolean) => void
}

export const useInsideStore = create<InsideState>()((set, get) => ({
  shot: null,
  startedAt: 0,
  caption: '',
  play: (shot) => set({ shot, caption: shot.caption, startedAt: performance.now() - (shot.startAtS ?? 0) * 1000 }),
  setCaption: (caption) => set({ caption }),
  end: (skipped = false) => {
    const { shot } = get()
    if (!shot) return
    set({ shot: null, caption: '' })
    shot.onEnd?.(skipped)
  },
}))

/** True while any look-inside shot plays (HUDs fade, shake and particles may run) */
export const useInsidePlaying = (id?: string) => useInsideStore((s) => (s.shot ? (id ? s.shot.id === id : true) : false))
