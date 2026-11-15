import { create } from 'zustand'

/**
 * The launch ascent's DOM-side state: whether it plays, when it started, and how many times the
 * player has watched it to the end (Skip is offered from the second viewing on). The camera and the
 * picture are in Ascent.tsx; the timing is in ascentShots.ts.
 */

const WATCHED_KEY = 'moonshot.ascent.watched'

function readWatched(): number {
  try {
    return Number(window.localStorage.getItem(WATCHED_KEY)) || 0
  } catch {
    return 0
  }
}

function writeWatched(n: number) {
  try {
    window.localStorage.setItem(WATCHED_KEY, String(n))
  } catch {
    // Private windows: the ascent is simply unskippable again next time
  }
}

export interface AscentPlay {
  /** Called once when the ascent ends: at the cut to the flight view, or on Skip */
  onEnd?: (skipped: boolean) => void
}

interface AscentState {
  playing: boolean
  /** performance.now() when the sequence started (T-10) */
  startedAt: number
  timesWatched: number
  onEnd: ((skipped: boolean) => void) | undefined
  play: (opts?: AscentPlay) => void
  end: (skipped?: boolean) => void
}

export const useAscentStore = create<AscentState>()((set, get) => ({
  playing: false,
  startedAt: 0,
  timesWatched: typeof window === 'undefined' ? 0 : readWatched(),
  onEnd: undefined,
  play: (opts) => set({ playing: true, startedAt: performance.now(), onEnd: opts?.onEnd }),
  end: (skipped = false) => {
    const { playing, onEnd, timesWatched } = get()
    if (!playing) return
    const watched = skipped ? timesWatched : timesWatched + 1
    if (!skipped) writeWatched(watched)
    set({ playing: false, onEnd: undefined, timesWatched: watched })
    onEnd?.(skipped)
  },
}))

/**
 * Start the ascent (the public entry point). The flight calls this at the moment the simulation
 * reports liftoff; `onEnd` hands over to the flight view.
 */
export function playAscent(opts?: AscentPlay) {
  useAscentStore.getState().play(opts)
}
