import { create } from 'zustand'

/** Remembered in localStorage: whether tips are off, and which beats were already shown */
export const NARRATOR_STORAGE_KEY = 'moonshot-narrator'

interface Saved {
  tipsOff: boolean
  seen: string[]
}

function load(): Saved {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(NARRATOR_STORAGE_KEY) : null
    if (raw) {
      const v = JSON.parse(raw) as Partial<Saved>
      return { tipsOff: v.tipsOff === true, seen: Array.isArray(v.seen) ? v.seen.filter((s) => typeof s === 'string') : [] }
    }
  } catch {
    // blocked site data or a broken value: start fresh
  }
  return { tipsOff: false, seen: [] }
}

function save(v: Saved) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(NARRATOR_STORAGE_KEY, JSON.stringify(v))
  } catch {
    // private window or full storage: the choice holds for this visit only
  }
}

interface NarratorPrefs extends Saved {
  markSeen: (key: string) => void
  setTipsOff: (off: boolean) => void
}

export const useNarratorPrefs = create<NarratorPrefs>()((set, get) => ({
  ...load(),
  markSeen: (key) => {
    const { seen, tipsOff } = get()
    if (seen.includes(key)) return
    // Keep the list short: run beats carry a seed, so old flights would pile up
    const next = [...seen, key].slice(-200)
    set({ seen: next })
    save({ tipsOff, seen: next })
  },
  setTipsOff: (off) => {
    set({ tipsOff: off })
    save({ tipsOff: off, seen: get().seen })
  },
}))
