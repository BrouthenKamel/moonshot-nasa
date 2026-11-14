import { useGameStore } from '../../state/gameStore'
import { turnConstants } from '../../data/brief'

export function PlanningScreen() {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const getBudgets = useGameStore((s) => s.getBudgets)

  const budgets = getBudgets()

  const handleTestTurnsChange = (value: number) => {
    updateDesign({
      planning: { ...design.planning, testTurns: value },
    })
  }

  const handleReserveChange = (value: number) => {
    updateDesign({
      planning: { ...design.planning, reservePercent: value },
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-lg bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-blue-400">1. Mission Planning</h1>
        <p className="mt-2 text-slate-400">
          Plan your mission timeline and budget allocation. Balance build time, testing, and reserves.
        </p>
      </div>

      <div className="rounded-lg bg-slate-900 p-6">
        <h2 className="mb-4 font-semibold text-slate-200">Build Time</h2>
        <p className="mb-4 text-sm text-slate-400">
          Set by what you build: every part takes build effort, and the team handles 10 points a turn. Simpler parts
          build faster.
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Build effort of your design: {budgets.buildEffort} points</span>
          <span className="w-24 text-right text-lg font-bold text-blue-400">{budgets.buildTurns} turns</span>
        </div>
      </div>

      <div className="rounded-lg bg-slate-900 p-6">
        <h2 className="mb-4 font-semibold text-slate-200">Test Time</h2>
        <p className="mb-4 text-sm text-slate-400">
          Turns of testing before launch. Testing costs time and money, but everything that can go wrong in flight
          becomes less likely.
        </p>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={turnConstants.minTestTurns}
            max={turnConstants.maxTestTurns}
            value={design.planning.testTurns}
            onChange={(e) => handleTestTurnsChange(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-24 text-right text-lg font-bold text-blue-400">
            {design.planning.testTurns} turns
          </span>
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>0.4 M per test turn</span>
          <span>Failure odds in flight: x{budgets.testFactor}</span>
        </div>
      </div>

      <div className="rounded-lg bg-slate-900 p-6">
        <h2 className="mb-4 font-semibold text-slate-200">Budget Reserve</h2>
        <p className="mb-4 text-sm text-slate-400">
          Share of the budget held back for surprises. It pays for fixes in flight, and covers running costs once the
          main budget is spent. Overdraw it and the mission fails the budget requirement.
        </p>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={20}
            step={5}
            value={design.planning.reservePercent}
            onChange={(e) => handleReserveChange(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-24 text-right text-lg font-bold text-blue-400">
            {design.planning.reservePercent}%
          </span>
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>Recommended: {turnConstants.recommendedReservePercent}%</span>
          <span>Reserve: ${budgets.reserveAmount.toFixed(1)}M</span>
        </div>
      </div>

      <div className="rounded-lg bg-yellow-950 p-4 text-sm">
        <div className="font-medium text-yellow-300">Timeline Summary</div>
        <div className="mt-2 text-yellow-200">
          Ready on turn {budgets.readyTurn} (design 1 + build {budgets.buildTurns} + test {design.planning.testTurns} +
          fitting 1). Ride leaves turn {budgets.rideTurn}.
          {budgets.timeMarginTurns >= 0 ? (
            <span className="text-green-400"> {budgets.timeMarginTurns} turn(s) margin.</span>
          ) : (
            <span className="text-red-400"> Will miss the ride by {-budgets.timeMarginTurns} turn(s)!</span>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setDesignStep('brief')}
          className="rounded-lg bg-slate-700 px-6 py-2 font-medium text-slate-300 hover:bg-slate-600"
        >
          ← Back
        </button>
        <button
          onClick={() => setDesignStep('instruments')}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500"
        >
          Select Instruments →
        </button>
      </div>
    </div>
  )
}
