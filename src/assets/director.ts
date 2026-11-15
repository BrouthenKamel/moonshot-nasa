import { useEffect } from 'react'
import { difficultyPresets } from '../data/brief'
import { computeBudgets } from '../sim/budgets'
import { goNoGo } from '../sim/checks'
import { isSimComplete } from '../sim/simulate'
import { useCampusStore } from '../state/campusStore'
import { useGameStore } from '../state/gameStore'
import { isClassicMode } from '../world/mode'
import { audio } from './audio'
import { cuesFor, trackForLocation, type Cue, type Snapshot } from './cues'
import { getAsset, type AudioAsset } from './manifest'

type GameState = ReturnType<typeof useGameStore.getState>

let lastGoKey = ''
let lastGo = false

function snapshot(s: GameState, prevLogCount: number): Snapshot {
  const design: Record<string, string> = {}
  for (const [k, v] of Object.entries(s.design)) if (typeof v === 'string') design[k] = v
  design.instruments = s.design.instruments.join(',')

  // Go / No-Go only matters while designing; recompute only when the design changes
  if (s.screen === 'design') {
    const key = JSON.stringify(s.design) + s.difficulty
    if (key !== lastGoKey) {
      lastGoKey = key
      lastGo = goNoGo(s.design, computeBudgets(s.design, s.difficulty)).canGo
    }
  }

  const sim = s.simState
  const f = sim?.flight
  return {
    screen: s.screen,
    designStep: s.designStep,
    design,
    canGo: lastGo,
    outcome: s.currentReport?.outcome ?? null,
    flight:
      sim && f
        ? {
            logCount: sim.turnLogs.length,
            newLogs: sim.turnLogs.slice(Math.min(prevLogCount, sim.turnLogs.length)),
            pendingKey: sim.pendingDecision?.key ?? null,
            pendingTurn: sim.pendingDecision?.turn ?? null,
            launched: f.launchedTurn !== null,
            captured: f.captured,
            coverage: f.coverage,
            data: f.data,
            dataTarget: difficultyPresets[sim.difficulty]?.dataTarget ?? 300,
            main: f.main,
            ended: isSimComplete(sim),
            end: f.end,
          }
        : null,
  }
}

/** The campus (base screen, not ?classic=1) scores each location; classic keeps the old tracks */
const campusActive = () => !isClassicMode() && useGameStore.getState().screen === 'base'

function play(cue: Cue) {
  if (cue.kind === 'music' && !isClassicMode()) {
    if (cue.id === 'music.theme' && campusActive()) cue = { ...cue, id: trackForLocation(useCampusStore.getState().currentRoom) }
    else if (cue.id === 'music.departure') cue = { ...cue, id: 'music.ih-launch' }
  }
  if (cue.kind === 'sfx') audio.play(cue.id)
  else if (cue.kind === 'voice') audio.say(cue.id)
  else {
    // A track that does not loop hands over to the theme when it ends, unless the cue says otherwise
    const loops = (getAsset(cue.id) as AudioAsset).loop
    audio.playMusic(cue.id, 1800, cue.then ?? (loops ? undefined : 'music.theme'))
  }
}

/**
 * The game's sound: watches the store and plays what each change calls for (see cues.ts).
 * Mount once, at the top of the app. Browsers keep sound off until the first click; the
 * opening curtain's "Begin" is that click.
 */
export function useAudioDirector() {
  useEffect(() => {
    let prev = snapshot(useGameStore.getState(), useGameStore.getState().simState?.turnLogs.length ?? 0)
    // Start the music of the current moment once sound is allowed
    play({ kind: 'music', id: 'music.theme' })
    // Inside the campus the music follows the room, crossfading over 1.5 s
    let room = useCampusStore.getState().currentRoom
    const unsubCampus = useCampusStore.subscribe((c) => {
      if (c.currentRoom === room) return
      room = c.currentRoom
      if (campusActive()) audio.playMusic(trackForLocation(room), 1500)
    })
    const unsubGame = useGameStore.subscribe((state) => {
      const next = snapshot(state, prev.flight?.logCount ?? 0)
      // A new flight starts from zero logs
      if (state.simState && !prev.flight) next.flight!.newLogs = state.simState.turnLogs
      if ((!state.simState && prev.flight) || state.screen !== prev.screen) audio.hush()
      for (const cue of cuesFor(prev, next)) play(cue)
      prev = next
    })
    return () => {
      unsubCampus()
      unsubGame()
    }
  }, [])
}
