import { useGameStore } from '../../state/gameStore'
import { lunarIceMapperBrief, difficultyPresets } from '../../data/brief'

export function BriefScreen() {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const difficulty = useGameStore((s) => s.difficulty)
  const preset = difficultyPresets[difficulty]
  const brief = lunarIceMapperBrief

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-lg bg-slate-900 p-6">
        <h1 className="text-2xl font-bold text-blue-400">{brief.name}</h1>
        <p className="mt-2 text-slate-300">{brief.description}</p>
      </div>

      {/* I5a: the starting IR spectrometer cannot see into the shadowed craters; send new players to the lesson first */}
      <div className="rounded-lg border border-green-500/40 bg-green-950/40 p-4" data-testid="brief-first-stop">
        <p className="text-sm text-green-200">
          <span className="font-semibold">Your first stop: the Research Lab.</span> Check whether your instrument can see into the dark craters.
        </p>
      </div>

      <div className="rounded-lg bg-slate-900 p-6">
        <h2 className="mb-4 font-semibold text-slate-200">Mission Objective</h2>
        <p className="text-slate-400">{brief.objective}</p>
      </div>

      <div className="rounded-lg bg-slate-900 p-6">
        <h2 className="mb-4 font-semibold text-slate-200">Requirements</h2>
        <div className="space-y-3">
          {brief.requirements.map((req) => (
            <div key={req.id} className="flex items-start gap-3 rounded bg-slate-800 p-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-blue-600 text-xs font-bold">
                {req.id === 'capture' ? 'C' : req.id === 'coverage' ? '%' : req.id === 'data' ? 'D' : req.id === 'lifetime' ? 'T' : '$'}
              </div>
              <div>
                <div className="font-medium text-slate-200">{req.name}</div>
                <div className="text-sm text-slate-400">{req.description}</div>
                <div className="mt-1 text-xs text-slate-500">
                  Target: {req.id === 'data' ? preset.dataTarget : req.target} {req.unit}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-slate-900 p-6">
        <h2 className="mb-4 font-semibold text-slate-200">Constraints</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="rounded bg-slate-800 p-4">
            <div className="text-2xl font-bold text-blue-400">{brief.constraints.maxVolume}U</div>
            <div className="text-sm text-slate-400">CubeSat Size</div>
          </div>
          <div className="rounded bg-slate-800 p-4">
            <div className="text-2xl font-bold text-blue-400">{brief.constraints.maxMass} kg</div>
            <div className="text-sm text-slate-400">Maximum Mass</div>
          </div>
          <div className="rounded bg-slate-800 p-4">
            <div className="text-2xl font-bold text-blue-400">${preset.budgetCap}M</div>
            <div className="text-sm text-slate-400">Budget Cap</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-slate-900 p-6">
        <h2 className="mb-4 font-semibold text-slate-200">Mission Timeline</h2>
        <div className="flex items-center gap-2 text-sm">
          <div className="rounded bg-blue-900 px-3 py-1 text-blue-300">Build & Test</div>
          <span className="text-slate-600">→</span>
          <div className="rounded bg-orange-900 px-3 py-1 text-orange-300">
            Ride (Month {brief.defaultRideTurn})
          </div>
          <span className="text-slate-600">→</span>
          <div className="rounded bg-green-900 px-3 py-1 text-green-300">
            Lunar Ops ({brief.missionDurationTurns} months)
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          The mission clock counts months from month 0, when the mission starts. Be ready before your ride leaves!
        </p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setDesignStep('planning')}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500"
        >
          Begin Planning →
        </button>
      </div>
    </div>
  )
}
