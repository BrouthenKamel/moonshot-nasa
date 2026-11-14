import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToString } from 'react-dom/server'

// Server rendering reads a store's initial snapshot; make it read the live state instead.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const live = <T,>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot()
  return { ...actual, default: { ...actual, useSyncExternalStore: live }, useSyncExternalStore: live }
})

const mute = vi.fn()
vi.mock('howler', () => {
  class Howl {
    play = vi.fn()
    stop = vi.fn()
    fade = vi.fn()
    once = vi.fn()
    volume = vi.fn(() => 1)
  }
  return { Howl, Howler: { mute: (m: boolean) => mute(m) } }
})

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

async function freshAudio() {
  vi.resetModules()
  return import('../assets/audio')
}

afterEach(() => {
  vi.unstubAllGlobals()
  mute.mockReset()
})

describe('mute', () => {
  it('is remembered in localStorage and applied to Howler on the next load', async () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)

    const first = await freshAudio()
    expect(first.useAudioSettings.getState().muted).toBe(false)
    first.useAudioSettings.getState().setMuted(true)
    expect(mute).toHaveBeenLastCalledWith(true)
    expect(JSON.parse(storage.data.get('moonshot-audio')!).state.muted).toBe(true)

    mute.mockReset()
    const second = await freshAudio()
    expect(second.useAudioSettings.getState().muted).toBe(true)
    expect(mute).toHaveBeenLastCalledWith(true)
  })

  it('still toggles when localStorage throws on every access', async () => {
    const boom = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom })
    const { useAudioSettings } = await freshAudio()
    expect(() => useAudioSettings.getState().setMuted(true)).not.toThrow()
    expect(useAudioSettings.getState().muted).toBe(true)
  })

  it('still toggles when Howler throws', async () => {
    vi.stubGlobal('localStorage', memoryStorage())
    mute.mockImplementation(() => {
      throw new Error('no audio context')
    })
    const { useAudioSettings } = await freshAudio()
    expect(() => useAudioSettings.getState().setMuted(true)).not.toThrow()
    expect(useAudioSettings.getState().muted).toBe(true)
  })

  it('the button is labelled for what a click does', async () => {
    vi.stubGlobal('localStorage', memoryStorage())
    const { useAudioSettings } = await freshAudio()
    const { MuteButton } = await import('../ui/MuteButton')
    expect(renderToString(<MuteButton />)).toContain('aria-label="Mute sound"')
    useAudioSettings.getState().setMuted(true)
    expect(renderToString(<MuteButton />)).toContain('aria-label="Unmute sound"')
  })
})
