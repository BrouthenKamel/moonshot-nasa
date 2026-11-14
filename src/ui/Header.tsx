import { AudioControls } from './kit/AudioControls'
import { useGameStore } from '../state/gameStore'
import { lunarIceMapperBrief, difficultyPresets } from '../data/brief'
import type { DesignStep, Role } from '../sim/types'
import { ROLE_INFO } from '../viz/gonogo/stations'

/** The role that owns each step, from the board (Go / No-Go belongs to everyone) */
const STEP_ROLE: Partial<Record<DesignStep, Role>> = {
  brief: 'ground',
  planning: 'ground',
  comms: 'ground',
  instruments: 'science',
  spacecraft: 'space',
  orbit: 'launch',
  ride: 'launch',
}

export function Header() {
  const screen = useGameStore((s) => s.screen)
  const difficulty = useGameStore((s) => s.difficulty)
  const simState = useGameStore((s) => s.simState)
  const newGame = useGameStore((s) => s.newGame)
  const setScreen = useGameStore((s) => s.setScreen)

  const preset = difficultyPresets[difficulty]

  // Team mode: who owns this step's decisions (the role of the building it is in)
  const designStep = useGameStore((s) => s.designStep)
  const mode = useGameStore((s) => s.mode)
  const players = useGameStore((s) => s.players)
  const role = STEP_ROLE[designStep]
  const owner = mode === 'team' && role ? players.find((p) => p.role === role) : undefined
  const turnOwner = owner && role ? { name: owner.name, title: ROLE_INFO[role].title, color: ROLE_INFO[role].color } : null

  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-lg font-bold uppercase tracking-[0.15em] text-white">Moonshot</h1>
        {screen !== 'title' && (
          <span className="text-sm text-slate-400">
            {lunarIceMapperBrief.name}
          </span>
        )}
        {screen === 'design' && turnOwner && (
          <span
            className="rounded-full px-3 py-0.5 text-xs font-semibold"
            style={{ background: `${turnOwner.color}26`, color: turnOwner.color, border: `1px solid ${turnOwner.color}66` }}
            title="In team mode each role owns its building's decisions"
          >
            🎮 {turnOwner.name}&apos;s call · {turnOwner.title}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {screen === 'simulation' && simState && (
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded bg-slate-800 px-2 py-1">
              Turn {simState.currentTurn}
            </span>
            <span className="text-slate-400">
              Phase: <span className="text-slate-200 capitalize">{simState.phase}</span>
            </span>
          </div>
        )}

        {screen !== 'title' && (
          <>
            <span
              className={`rounded px-2 py-1 text-xs font-medium ${
                difficulty === 'cadet'
                  ? 'bg-green-900 text-green-300'
                  : difficulty === 'engineer'
                    ? 'bg-yellow-900 text-yellow-300'
                    : 'bg-red-900 text-red-300'
              }`}
            >
              {preset.name}
            </span>
            <button
              onClick={() => setScreen('base')}
              className="rounded bg-orange-600 px-3 py-1 text-sm font-medium text-white hover:bg-orange-500"
            >
              ← Agency base
            </button>
            <button
              onClick={newGame}
              className="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600"
            >
              New Game
            </button>
            <AudioControls />
          </>
        )}
      </div>
    </header>
  )
}
