import type { StateStorage } from 'zustand/middleware'

type BaseStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Drop `run` from the oldest history entry that still has one. Returns null when none is left. */
function dropOldestRun(value: string): string | null {
  try {
    const parsed = JSON.parse(value)
    const history = parsed?.state?.runHistory
    if (!Array.isArray(history)) return null
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i] && history[i].run !== undefined) {
        delete history[i].run
        return JSON.stringify(parsed)
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Storage that survives quota failures: when a write throws, the oldest stored
 * run data is dropped and the write retried; if nothing can be dropped the
 * error is swallowed so the game keeps working.
 */
export function createSafeStorage(base: BaseStorage): StateStorage {
  return {
    getItem: (name) => {
      try {
        return base.getItem(name)
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      let current: string | null = value
      while (current !== null) {
        try {
          base.setItem(name, current)
          return
        } catch {
          current = dropOldestRun(current)
        }
      }
    },
    removeItem: (name) => {
      try {
        base.removeItem(name)
      } catch {
        // ignore
      }
    },
  }
}
