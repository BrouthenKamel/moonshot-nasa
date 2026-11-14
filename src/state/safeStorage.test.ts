import { describe, it, expect } from 'vitest'
import { createSafeStorage } from './safeStorage'

function makeValue(runs: boolean[]): string {
  return JSON.stringify({
    state: {
      runHistory: runs.map((hasRun, i) => ({
        id: String(i),
        report: { n: i },
        ...(hasRun ? { run: { seed: i, turnLogs: ['x'.repeat(100)], allEvents: [] } } : {}),
      })),
    },
    version: 0,
  })
}

function fakeStorage(limit: number) {
  const store = new Map<string, string>()
  return {
    store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > limit) throw new Error('QuotaExceededError')
      store.set(k, v)
    },
    removeItem: (k: string) => void store.delete(k),
  }
}

describe('createSafeStorage', () => {
  it('writes directly when it fits', () => {
    const base = fakeStorage(100000)
    createSafeStorage(base).setItem('k', makeValue([true, true]))
    expect(JSON.parse(base.store.get('k')!).state.runHistory[1].run).toBeDefined()
  })

  it('drops the oldest run first and keeps the newest', () => {
    const full = makeValue([true, true, true])
    const base = fakeStorage(full.length - 50)
    createSafeStorage(base).setItem('k', full)
    const h = JSON.parse(base.store.get('k')!).state.runHistory
    expect(h[0].run).toBeDefined()
    expect(h[2].run).toBeUndefined()
  })

  it('does not throw when nothing can be dropped', () => {
    const base = fakeStorage(10)
    const s = createSafeStorage(base)
    expect(() => s.setItem('k', makeValue([true, false]))).not.toThrow()
    expect(() => s.setItem('k', 'not json, but too long to fit')).not.toThrow()
    expect(base.store.has('k')).toBe(false)
  })
})
