import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A Howler with an audio context, so voice lines try to load their file
vi.mock('howler', () => {
  class Howl {
    play = vi.fn()
    stop = vi.fn()
    fade = vi.fn()
    once = vi.fn()
    volume = vi.fn(() => 1)
  }
  return { Howl, Howler: { mute: vi.fn(), ctx: { currentTime: 0 } } }
})

const { audio, useAudioSettings, MAX_CAPTION_MS } = await import('./audio')

// Integration review, 15 Nov: "Liftoff. Lunar Ice Mapper is on its way." stayed up 12 to 18 months
describe('voice-loop captions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    // The voice file never arrives (or the audio context is suspended): playback never ends
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    useAudioSettings.setState({ caption: null })
  })
  afterEach(() => {
    audio.hush()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('takes a caption down after its maximum lifetime even when the line never finishes playing', async () => {
    audio.say('voice.liftoff')
    await vi.advanceTimersByTimeAsync(10)
    expect(useAudioSettings.getState().caption).toBe('Liftoff. Lunar Ice Mapper is on its way.')
    await vi.advanceTimersByTimeAsync(MAX_CAPTION_MS)
    expect(useAudioSettings.getState().caption).toBeNull()
  })

  it('hush (a new flight phase or screen) clears the caption at once', async () => {
    audio.say('voice.liftoff')
    await vi.advanceTimersByTimeAsync(10)
    expect(useAudioSettings.getState().caption).not.toBeNull()
    audio.hush()
    expect(useAudioSettings.getState().caption).toBeNull()
  })

  it('caps a caption-only note too, however long its text', async () => {
    audio.note('Go with a caution on Science. '.repeat(10))
    await vi.advanceTimersByTimeAsync(10)
    expect(useAudioSettings.getState().caption).toMatch(/^Go with a caution/)
    await vi.advanceTimersByTimeAsync(MAX_CAPTION_MS)
    expect(useAudioSettings.getState().caption).toBeNull()
  })

  it('keeps every caption short-lived: no line is longer than the cap', () => {
    expect(MAX_CAPTION_MS).toBeGreaterThanOrEqual(6000)
    expect(MAX_CAPTION_MS).toBeLessThanOrEqual(10000)
  })
})
