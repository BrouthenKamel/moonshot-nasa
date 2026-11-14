import { useGameStore } from '../state/gameStore'
import { lunarIceMapperBrief } from '../data/brief'

export function Header() {
  const screen = useGameStore((s) => s.screen)
  const simState = useGameStore((s) => s.simState)
  const newGame = useGameStore((s) => s.newGame)
  const setScreen = useGameStore((s) => s.setScreen)

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
          </>
        )}
      </div>
    </header>
  )
}
