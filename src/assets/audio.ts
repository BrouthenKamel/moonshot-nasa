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

/* ---------------- voice: a queue through a radio filter ---------------- */

const voiceBuffers = new Map<AudioId, Promise<AudioBuffer | null>>()
/** Lines waiting to be spoken, with when they were asked for: a line that waited too long is stale */
/** A queued line: a recorded voice clip, or a caption-only line (`text`) when no clip says the right thing */
const voiceQueue: ({ id: AudioId; at: number } | { text: string; at: number })[] = []
const STALE_MS = 7000
/**
 * Longest a caption may stay up, whatever happens to the sound (Integration review, 15 Nov: "Liftoff.
 * Lunar Ice Mapper is on its way." was still on screen 12 to 18 months later). The longest line runs
 * about five seconds; a suspended audio context or a voice file that never loads used to keep the
 * caption up for good, because only the end of playback took it down.
 */
export const MAX_CAPTION_MS = 8000
let speaking = false
/** Most lines a burst of turns may queue; older ones are dropped */
const MAX_QUEUE = 4

function audioContext(): AudioContext | null {
  return (Howler.ctx as AudioContext | undefined) ?? null
}

function loadVoice(id: AudioId): Promise<AudioBuffer | null> {
  let p = voiceBuffers.get(id)
  if (!p) {
    const ctx = audioContext()
    p = ctx
      ? fetch(assetUrl(id))
          .then((r) => r.arrayBuffer())
          .then((b) => ctx.decodeAudioData(b))
          .catch(() => null)
      : Promise.resolve(null)
    voiceBuffers.set(id, p)
  }
  return p
}

/**
 * The Apollo "Quindar" tone: the short 2525 Hz beep that opened every capsule
 * transmission. Synthesised, so it costs nothing to generate.
 */
function quindar(ctx: AudioContext, out: AudioNode, at: number) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.frequency.value = 2525
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(0.12, at + 0.01)
  g.gain.setValueAtTime(0.12, at + 0.24)
  g.gain.linearRampToValueAtTime(0, at + 0.25)
  osc.connect(g).connect(out)
  osc.start(at)
  osc.stop(at + 0.26)
}

/** Band-limited and lightly overdriven, like a voice loop in mission control */
function radioChain(ctx: AudioContext, gain: number): { input: AudioNode; output: AudioNode } {
  const high = ctx.createBiquadFilter()
  high.type = 'highpass'
  high.frequency.value = 320
  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 3400
  const drive = ctx.createWaveShaper()
  const curve = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * 2 - 1
    curve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8)
  }
  drive.curve = curve
  const level = ctx.createGain()
  level.gain.value = gain
  high.connect(low).connect(drive).connect(level)
  // Howler's master gain carries the global mute
  level.connect((Howler as unknown as { masterGain: AudioNode }).masterGain ?? ctx.destination)
  return { input: high, output: level }
}

async function speakNext() {
  if (speaking) return
  let next = voiceQueue.shift()
  while (next && performance.now() - next.at > STALE_MS) next = voiceQueue.shift()
  if (!next) return
  speaking = true
  let caption: string | null = null
  let finished = false
  const done = () => {
    if (finished) return
    finished = true
    window.clearTimeout(watchdog)
    speaking = false
    // Only take down our own caption: hush() may already have cleared it, and a newer line put up its own
    if (useAudioSettings.getState().caption === caption) useAudioSettings.setState({ caption: null })
    void speakNext()
  }
  // Every caption, spoken or caption-only, comes down after MAX_CAPTION_MS whatever the sound does
  const watchdog = window.setTimeout(done, MAX_CAPTION_MS)
  if ('text' in next) {
    // Caption only: up for about as long as a spoken line of that length would take
    caption = next.text
    useAudioSettings.setState({ caption })
    window.setTimeout(done, Math.max(1800, next.text.length * 70))
    return
  }
  const id = next.id
  const a = getAsset(id) as AudioAsset
  caption = a.caption ?? a.prompt ?? null
  useAudioSettings.setState({ caption })
  const ctx = audioContext()
  const buffer = await loadVoice(id)
  if (!ctx || !buffer || useAudioSettings.getState().muted) {
    // No sound: keep the caption up for about as long as the line would take
    window.setTimeout(done, buffer ? buffer.duration * 1000 + 300 : 2200)
    return
  }
  const chain = radioChain(ctx, gainFor(a) * 1.2)
  const start = ctx.currentTime + 0.05
  quindar(ctx, chain.output, start)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(chain.input)
  src.onended = () => window.setTimeout(done, 250)
  src.start(start + 0.32)
}

export const audio = {
  /** Start a music track, crossfading from the current one. No-op if it is already playing. */
  playMusic(id: AudioId, fadeMs = 1500, then?: AudioId) {
    if (currentMusic?.id === id) return
    const prev = currentMusic
    const h = howlFor(id)
    const target = gainFor(getAsset(id) as AudioAsset)
    h.volume(0)
    h.play()
    h.fade(0, target, fadeMs)
    currentMusic = { id, howl: h }
    if (then) {
      // A one-off cue (a launch, a stinger) hands over to the next track when it ends
      h.once('end', () => {
        if (currentMusic?.howl === h) {
          currentMusic = null
          audio.playMusic(then, 2500)
        }
      })
    }
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

  /** Temporarily duck or restore the active music volume without changing user settings */
  duckMusic(ducked: boolean, fadeMs = 450) {
    const cur = currentMusic
    if (!cur) return
    const base = gainFor(getAsset(cur.id) as AudioAsset)
    const target = ducked ? base * 0.25 : base
    safely(() => cur.howl.fade(cur.howl.volume(), target, fadeMs))
  },

  /** Fire-and-forget sound effect */
  play(id: AudioId) {
    const h = howlFor(id)
    h.volume(gainFor(getAsset(id) as AudioAsset))
    h.play()
  },

  /** Queue a voice line: radio filter, Quindar tone, caption while it plays */
  say(id: AudioId) {
    voiceQueue.push({ id, at: performance.now() })
    while (voiceQueue.length > MAX_QUEUE) voiceQueue.shift()
    void loadVoice(id)
    void speakNext()
  },

  /**
   * Queue a caption-only line in the voice loop, in turn with the spoken lines (no clip, no Quindar tone).
   * For a moment no recorded clip fits, e.g. "Go with a caution on Science" (no such clip was recorded).
   */
  note(text: string) {
    voiceQueue.push({ text, at: performance.now() })
    while (voiceQueue.length > MAX_QUEUE) voiceQueue.shift()
    void speakNext()
  },

  /** Drop lines not yet spoken and take the caption down (e.g. when the flight phase changes) */
  hush() {
    voiceQueue.length = 0
    useAudioSettings.setState({ caption: null })
  },

  /** Download a set of sounds ahead of time (e.g. at the title screen) */
  preload(ids: AudioId[]) {
    ids.forEach(howlFor)
  },
}
