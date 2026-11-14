import { useGameStore } from '../state/gameStore'
import { lunarIceMapperBrief, difficultyPresets } from '../data/brief'

export function Header() {
  const screen = useGameStore((s) => s.screen)
  const difficulty = useGameStore((s) => s.difficulty)
  const simState = useGameStore((s) => s.simState)
  const newGame = useGameStore((s) => s.newGame)

  const preset = difficultyPresets[difficulty]

  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-blue-400">Moonshot</h1>
        {screen !== 'title' && (
          <span className="text-sm text-slate-400">
            {lunarIceMapperBrief.name}
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
              onClick={newGame}
              className="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600"
            >
              New Game
            </button>
          </>
        )}
      </div>
    </header>
  )
}
