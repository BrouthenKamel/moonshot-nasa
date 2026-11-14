import { audio } from '../assets/audio'
import type { AudioId } from '../assets/manifest'
import type { SimState } from '../sim/types'

/**
 * Game sound: listens to the game store and plays music and cues. No game code
 * calls it directly, so screens and the flight code stay free of audio.
 *
 * - The theme plays on the agency base, starting only after the first click or
 *   key press (browsers block sound before a user gesture), and fades out on
 *   other screens.
 * - A cue plays when the flight reaches a key moment (see `soundsFor`).
 *
 * Every audio call is guarded: if a file fails to load or Howler throws, the
 * game carries on silently.
 */

export type GameSound = 'launch' | 'event' | 'capture' | 'success' | 'failed'

const BASE_MUSIC: AudioId = 'music.theme'

/**
 * File for each cue. Empty until sound effects are added to the asset manifest
 * (it ships only the theme today); a cue with no file stays silent.
 */
export const SOUND_FILES: Partial<Record<GameSound, AudioId>> = {}

/** The sounds to play when the flight goes from `prev` to `next`. */
export function soundsFor(prev: SimState | null, next: SimState | null): GameSound[] {
  // A new flight (or none) is not a moment to mark
  if (!prev || !next || prev === next || prev.seed !== next.seed) return []
  if (next.phase === 'failed' && prev.phase !== 'failed') return ['failed']
  if (next.phase === 'complete' && prev.phase !== 'complete') return ['success']

  const out: GameSound[] = []
  if (next.flight.launchedTurn != null && prev.flight.launchedTurn == null) out.push('launch')
  if (next.capturedIntoOrbit && !prev.capturedIntoOrbit) out.push('capture')
  const card = next.pendingDecision
  const before = prev.pendingDecision
  if (card && (!before || before.key !== card.key || before.turn !== card.turn)) out.push('event')
  return out
}

export interface SoundPlayer {
  playMusic: (id: AudioId) => void
  stopMusic: () => void
  play: (id: AudioId) => void
}

interface SoundState {
  screen: string
  simState: SimState | null
}

interface SoundStore {
  getState: () => SoundState
  subscribe: (listener: (state: SoundState, prev: SoundState) => void) => () => void
}

function safely(fn: () => void) {
  try {
    fn()
  } catch {
    // Sound is decoration: never let it break the game
  }
}

/** Start the game sound; returns a function that stops listening. */
export function startGameSounds({
  store,
  player = audio,
  target = typeof window === 'undefined' ? undefined : window,
  files = SOUND_FILES,
}: {
  store: SoundStore
  player?: SoundPlayer
  target?: EventTarget
  files?: Partial<Record<GameSound, AudioId>>
}): () => void {
  let unlocked = false
  let musicOn = false

  const syncMusic = (screen: string) => {
    const want = unlocked && screen === 'base'
    if (want === musicOn) return
    musicOn = want
    safely(() => (want ? player.playMusic(BASE_MUSIC) : player.stopMusic()))
  }

  const unlock = () => {
    if (unlocked) return
    unlocked = true
    removeUnlock()
    syncMusic(store.getState().screen)
  }
  const gestures = ['pointerdown', 'keydown'] as const
  const removeUnlock = () => gestures.forEach((g) => target?.removeEventListener(g, unlock))
  gestures.forEach((g) => target?.addEventListener(g, unlock))

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.screen !== prev.screen) syncMusic(state.screen)
    if (state.simState !== prev.simState) {
      for (const sound of soundsFor(prev.simState, state.simState)) {
        const id = files[sound]
        if (id) safely(() => player.play(id))
      }
    }
  })

  return () => {
    removeUnlock()
    unsubscribe()
  }
}
