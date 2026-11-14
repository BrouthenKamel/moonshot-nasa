import { useGameStore } from '../../state/gameStore'
import { lunarOrbits, type LunarOrbit } from '../../data/orbits'

function OrbitCard({
  orbit,
  selected,
  onSelect,
}: {
  orbit: LunarOrbit
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-lg p-4 text-left transition-colors ${
        selected
          ? 'bg-orange-900 ring-2 ring-orange-500'
          : 'bg-slate-800 hover:bg-slate-700'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-slate-100">{orbit.name}</div>
          <div className="mt-1 text-sm text-slate-400">{orbit.description}</div>
        </div>
        <div
          className={`h-5 w-5 rounded-full border-2 ${
            selected ? 'border-orange-500 bg-orange-500' : 'border-slate-600'
          }`}
        />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Altitude</div>
          <div className="font-bold text-slate-300">{orbit.altitude} km</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Coverage</div>
          <div className="font-bold text-slate-300">{orbit.coveragePerTurn}%/turn</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Resolution</div>
          <div className="font-bold text-slate-300">{orbit.resolutionFactor}x</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">SK delta-v</div>
          <div className="font-bold text-slate-300">{orbit.stationKeepingDeltaV} m/s</div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
        <span>Eclipse: {Math.round(orbit.eclipseFraction * 100)}%</span>
        <span>Contact: {orbit.contactWindowMinutes} min/orbit</span>
        <span>Period: {orbit.orbitPeriodMinutes} min</span>
      </div>
    </button>
  )
}

export function OrbitScreen() {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const getBudgets = useGameStore((s) => s.getBudgets)

  const budgets = getBudgets()
  const selectedOrbit = lunarOrbits.find((o) => o.id === design.orbit)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-lg bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-orange-400">4. Orbit Selection</h1>
        <p className="mt-2 text-slate-400">
          Choose your lunar science orbit. Lower orbits give better resolution but cost more fuel to maintain.
          All orbits are polar to pass over the south pole.
        </p>
      </div>

      <div className="rounded-lg bg-orange-950 p-4 text-sm">
        <div className="font-medium text-orange-300">Orbit Impact</div>
        <div className="mt-2 grid grid-cols-2 gap-4 text-orange-200">
          <div>
            Eclipse duration: <span className="text-orange-400">{budgets.eclipseDurationMinutes.toFixed(0)} min</span>
          </div>
          <div>
            Battery margin: <span className={budgets.batteryMarginMinutes >= 0 ? 'text-green-400' : 'text-red-400'}>
              {budgets.batteryMarginMinutes.toFixed(0)} min
            </span>
          </div>
          <div>
            Station-keeping: <span className="text-orange-400">{budgets.deltaVStationKeeping} m/s/turn</span>
          </div>
          <div>
            12-month SK total: <span className="text-orange-400">{budgets.deltaVStationKeeping * 12} m/s</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {lunarOrbits.map((orbit) => (
          <OrbitCard
            key={orbit.id}
            orbit={orbit}
            selected={design.orbit === orbit.id}
            onSelect={() => updateDesign({ orbit: orbit.id })}
          />
        ))}
      </div>

      {selectedOrbit && (
        <div className="rounded-lg bg-slate-900 p-4 text-sm">
          <div className="font-medium text-slate-300">Why this orbit matters</div>
          <ul className="mt-2 space-y-1 text-slate-400">
            <li>
              At <span className="text-white">{selectedOrbit.altitude} km</span>, you get{' '}
              <span className="text-white">{selectedOrbit.coveragePerTurn}%</span> polar coverage per turn.
            </li>
            <li>
              Resolution is <span className="text-white">{selectedOrbit.resolutionFactor}x</span> -
              {selectedOrbit.resolutionFactor >= 1.5 ? ' great for detailed mapping.' : ' adequate for regional surveys.'}
            </li>
            <li>
              Station-keeping needs <span className="text-white">{selectedOrbit.stationKeepingDeltaV} m/s</span> per month
              due to lunar mascons.
            </li>
          </ul>
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={() => setDesignStep('spacecraft')}
          className="rounded-lg bg-slate-700 px-6 py-2 font-medium text-slate-300 hover:bg-slate-600"
        >
          ← Back
        </button>
        <button
          onClick={() => setDesignStep('ride')}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500"
        >
          Choose Ride →
        </button>
      </div>
    </div>
  )
}
