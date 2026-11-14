import { Howl, Howler } from 'howler'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeStorage } from '../state/safeStorage'
import { getAsset, type AudioAsset, type AudioId } from './manifest'
import { assetUrl } from './url'

/**
 * Audio manager. Three groups (music, sfx, voice) with their own volume, one
 * master mute, music crossfades, and captions for voice lines.
 *
 * Browsers block sound until the first user gesture; Howler unlocks the audio
 * context on the first click and plays anything queued before it.
 */

type Group = 'music' | 'sfx' | 'voice'

interface AudioSettings {
  muted: boolean
  volume: Record<Group, number>
  /** Line currently spoken, for subtitles */
  caption: string | null
  setMuted: (muted: boolean) => void
  setVolume: (group: Group, v: number) => void
}

const memoryStorage = new Map<string, string>()
const fallbackStorage = {
  getItem: (k: string) => memoryStorage.get(k) ?? null,
  setItem: (k: string, v: string) => void memoryStorage.set(k, v),
  removeItem: (k: string) => void memoryStorage.delete(k),
}

export const useAudioSettings = create<AudioSettings>()(
  persist(
    (set) => ({
      muted: false,
      volume: { music: 0.5, sfx: 0.8, voice: 1 },
      caption: null,
      setMuted: (muted) => set({ muted }),
      setVolume: (group, v) => set((s) => ({ volume: { ...s.volume, [group]: Math.min(1, Math.max(0, v)) } })),
    }),
    {
      name: 'moonshot-audio',
      storage: createJSONStorage(() =>
        createSafeStorage(typeof localStorage === 'undefined' ? fallbackStorage : localStorage),
      ),
      partialize: (s) => ({ muted: s.muted, volume: s.volume }),
    },
  ),
)

const howls = new Map<AudioId, Howl>()
let currentMusic: { id: AudioId; howl: Howl } | null = null

function groupOf(a: AudioAsset): Group {
  return a.kind
}

function gainFor(a: AudioAsset): number {
  return useAudioSettings.getState().volume[groupOf(a)] * (a.volume ?? 1)
}

function howlFor(id: AudioId): Howl {
  let h = howls.get(id)
  if (!h) {
    const a = getAsset(id) as AudioAsset
    h = new Howl({ src: [assetUrl(id)], loop: a.loop ?? false, volume: gainFor(a), preload: true })
    howls.set(id, h)
  }
  return h
}

/** Sound is decoration: a failing audio backend must never break the game */
function safely(fn: () => void) {
  try {
    fn()
  } catch {
    // carry on silently
  }
}

// Keep live sounds in step with the settings
useAudioSettings.subscribe((s, prev) => {
  if (s.muted !== prev.muted) safely(() => Howler.mute(s.muted))
  if (s.volume !== prev.volume) {
    safely(() => {
      for (const [id, h] of howls) h.volume(gainFor(getAsset(id) as AudioAsset))
    })
  }
})
safely(() => Howler.mute(useAudioSettings.getState().muted))

export const audio = {
  /** Start a music track, crossfading from the current one. No-op if it is already playing. */
  playMusic(id: AudioId, fadeMs = 1500) {
    if (currentMusic?.id === id) return
    const prev = currentMusic
    const h = howlFor(id)
    const target = gainFor(getAsset(id) as AudioAsset)
    h.volume(0)
    h.play()
    h.fade(0, target, fadeMs)
    currentMusic = { id, howl: h }
    if (prev) {
      prev.howl.fade(prev.howl.volume(), 0, fadeMs)
      prev.howl.once('fade', () => prev.howl.stop())
    }
  },

  stopMusic(fadeMs = 1500) {
    const prev = currentMusic
    if (!prev) return
    currentMusic = null
    prev.howl.fade(prev.howl.volume(), 0, fadeMs)
    prev.howl.once('fade', () => prev.howl.stop())
  },

  /** Fire-and-forget sound effect */
  play(id: AudioId) {
    const h = howlFor(id)
    h.volume(gainFor(getAsset(id) as AudioAsset))
    h.play()
  },

  /** Voice line with a caption; resolves when it ends */
  say(id: AudioId): Promise<void> {
    const a = getAsset(id) as AudioAsset
    const h = howlFor(id)
    h.volume(gainFor(a))
    useAudioSettings.setState({ caption: a.caption ?? a.prompt ?? null })
    return new Promise((resolve) => {
      const done = () => {
        useAudioSettings.setState({ caption: null })
        resolve()
      }
      h.once('end', done)
      h.once('playerror', done)
      h.play()
    })
  },

  /** Download a set of sounds ahead of time (e.g. at the title screen) */
  preload(ids: AudioId[]) {
    ids.forEach(howlFor)
  },
}
