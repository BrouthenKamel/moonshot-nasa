import { beforeEach, describe, expect, it } from 'vitest'

describe('view store', () => {
  beforeEach(() => {
    const mem = new Map<string, string>()
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    }
  })

  it('starts in story view and remembers engineer view', async () => {
    const { useViewStore, VIEW_STORAGE_KEY } = await import('./viewStore')
    expect(useViewStore.getState().engineerView).toBe(false)
    useViewStore.getState().toggleEngineerView()
    expect(useViewStore.getState().engineerView).toBe(true)
    expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe('engineer')
    useViewStore.getState().toggleEngineerView()
    expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe('story')
  })
})
