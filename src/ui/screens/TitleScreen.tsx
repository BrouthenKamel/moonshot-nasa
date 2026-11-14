import { useGameStore } from '../../state/gameStore'
import { difficultyPresets, type Difficulty } from '../../data/brief'

export function TitleScreen() {
  const setScreen = useGameStore((s) => s.setScreen)
  const difficulty = useGameStore((s) => s.difficulty)
  const setDifficulty = useGameStore((s) => s.setDifficulty)
  const runHistory = useGameStore((s) => s.runHistory)

  const difficulties: Difficulty[] = ['cadet', 'engineer', 'flight-director']

  const startGame = () => {
    setScreen('base')
  }

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-4xl font-bold text-blue-400">Moonshot</h1>
        <p className="mb-8 text-lg text-slate-400">Space Mission Design Game</p>

        <div className="mb-8 rounded-lg bg-slate-900 p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-300">Select Difficulty</h2>
          <div className="space-y-2">
            {difficulties.map((d) => {
              const preset = difficultyPresets[d]
              return (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`w-full rounded-lg p-3 text-left transition-colors ${
                    difficulty === d
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <div className="font-medium">{preset.name}</div>
                  <div className="text-sm opacity-75">{preset.description}</div>
                  <div className="mt-1 text-xs opacity-50">
                    Budget: ${preset.budgetCap}M | Target: {preset.dataTarget} GB
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <button
          onClick={startGame}
          className="w-full rounded-lg bg-green-600 py-3 font-semibold text-white transition-colors hover:bg-green-500"
        >
          Open Agency Base
        </button>

        {runHistory.length > 0 && (
          <button
            onClick={() => setScreen('report')}
            className="mt-4 w-full rounded-lg bg-slate-800 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700"
          >
            View Run History ({runHistory.length})
          </button>
        )}

        <div className="mt-8 text-xs text-slate-600">
          <p>NASA Space Apps 2026 Challenge: Space Mission Design Game</p>
          <p className="mt-1">Design a 6U CubeSat mission to map lunar ice</p>
        </div>
      </div>
    </div>
  )
}
