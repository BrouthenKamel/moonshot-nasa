import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('howler', () => {
  class Howl {
    play = vi.fn()
    stop = vi.fn()
    fade = vi.fn()
    once = vi.fn()
    volume = vi.fn(() => 1)
  }
  return { Howl, Howler: { mute: vi.fn() } }
})

import { createStore } from 'zustand/vanilla'
import { soundsFor, startGameSounds, type SoundPlayer, type GameSound } from './gameSounds'
import { initSim } from '../sim/simulate'
import { flashlightDesign } from '../sim/fixtures'
import type { SimState, Decision } from '../sim/types'

function sim(patch: Partial<SimState> = {}, flight: Partial<SimState['flight']> = {}): SimState {
  const base = initSim(flashlightDesign, 'engineer', 1)
  return { ...base, ...patch, flight: { ...base.flight, ...flight } }
}

const decision = (turn: number): Decision => ({
  key: 'no-signal',
  title: 'No signal',
  text: '',
  options: [{ id: 'recover', label: 'Recover' }],
  turn,
})

describe('soundsFor: the sound for each flight change', () => {
  it('plays nothing when a new flight starts or nothing changed', () => {
    const s = sim()
    expect(soundsFor(null, s)).toEqual([])
    expect(soundsFor(s, s)).toEqual([])
    expect(soundsFor(s, null)).toEqual([])
  })

  it('launch: the craft leaves the pad', () => {
    expect(soundsFor(sim({ phase: 'wait' }), sim({ phase: 'transfer' }, { launchedTurn: 5 }))).toEqual(['launch'])
  })

  it('event: an event card appears', () => {
    const before = sim()
    expect(soundsFor(before, { ...before, pendingDecision: decision(3) })).toEqual(['event'])
    // the same card still waiting is not a new card
    const waiting = { ...before, pendingDecision: decision(3) }
    expect(soundsFor(waiting, { ...waiting })).toEqual([])
  })

  it('capture: the craft is captured into lunar orbit', () => {
    expect(soundsFor(sim({ phase: 'transfer' }), sim({ phase: 'capture', capturedIntoOrbit: true }))).toEqual(['capture'])
  })

  it('launch and capture in one turn play both', () => {
    expect(soundsFor(sim({ phase: 'wait' }), sim({ phase: 'capture', capturedIntoOrbit: true }, { launchedTurn: 4 }))).toEqual([
      'launch',
      'capture',
    ])
  })

  it('success: the mission ends complete', () => {
    expect(soundsFor(sim({ phase: 'orbit', capturedIntoOrbit: true }), sim({ phase: 'complete', capturedIntoOrbit: true }))).toEqual([
      'success',
    ])
  })

  it('failed: the mission is lost, and only that plays', () => {
    expect(soundsFor(sim({ phase: 'wait' }), sim({ phase: 'failed', contactLost: true }, { launchedTurn: 4 }))).toEqual(['failed'])
  })

  it('a different run (new seed) never replays the last run’s end', () => {
    const ended = sim({ phase: 'complete' })
    expect(soundsFor(sim(), { ...ended, seed: 99 })).toEqual([])
  })
})

interface FakeState {
  screen: string
  simState: SimState | null
}

function setup(players: Partial<SoundPlayer> = {}, files: Partial<Record<GameSound, string>> = { launch: 'sfx.launch' }) {
  const store = createStore<FakeState>(() => ({ screen: 'base', simState: null }))
  const player: SoundPlayer = { playMusic: vi.fn(), stopMusic: vi.fn(), play: vi.fn(), ...players }
  const target = new EventTarget()
  const stop = startGameSounds({ store, player, target, files: files as never })
  return { store, player, target, stop }
}

describe('startGameSounds', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not start the music before the first click, then starts it on the base', () => {
    const { player, target } = setup()
    expect(player.playMusic).not.toHaveBeenCalled()
    target.dispatchEvent(new Event('pointerdown'))
    expect(player.playMusic).toHaveBeenCalledWith('music.theme')
    target.dispatchEvent(new Event('pointerdown'))
    expect(player.playMusic).toHaveBeenCalledTimes(1)
  })

  it('fades the music out off the base and back in on return', () => {
    const { player, target, store } = setup()
    target.dispatchEvent(new Event('pointerdown'))
    store.setState({ screen: 'design' })
    expect(player.stopMusic).toHaveBeenCalledTimes(1)
    store.setState({ screen: 'base' })
    expect(player.playMusic).toHaveBeenCalledTimes(2)
  })

  it('waits for the click even when the first screen is not the base', () => {
    const { player, target, store } = setup()
    store.setState({ screen: 'design' })
    target.dispatchEvent(new Event('pointerdown'))
    expect(player.playMusic).not.toHaveBeenCalled()
    store.setState({ screen: 'base' })
    expect(player.playMusic).toHaveBeenCalledTimes(1)
  })

  it('plays the mapped file when the flight changes and skips sounds with no file', () => {
    const { player, store } = setup()
    store.setState({ simState: sim({ phase: 'wait' }) })
    store.setState({ simState: sim({ phase: 'transfer' }, { launchedTurn: 5 }) })
    expect(player.play).toHaveBeenCalledWith('sfx.launch')
    store.setState({ simState: sim({ phase: 'capture', capturedIntoOrbit: true }, { launchedTurn: 5 }) })
    expect(player.play).toHaveBeenCalledTimes(1)
  })

  it('carries on silently when the player throws', () => {
    const boom = () => {
      throw new Error('no audio')
    }
    const { store, target } = setup({ playMusic: boom, play: boom, stopMusic: boom })
    expect(() => target.dispatchEvent(new Event('pointerdown'))).not.toThrow()
    store.setState({ simState: sim({ phase: 'wait' }) })
    expect(() => store.setState({ simState: sim({ phase: 'transfer' }, { launchedTurn: 5 }) })).not.toThrow()
    expect(() => store.setState({ screen: 'design' })).not.toThrow()
  })

  it('stops listening when stopped', () => {
    const { player, target, stop } = setup()
    stop()
    target.dispatchEvent(new Event('pointerdown'))
    expect(player.playMusic).not.toHaveBeenCalled()
  })
})
