import { useGameStore } from '../../state/gameStore'
import { lunarOrbits, type LunarOrbit } from '../../data/orbits'
import { computeBudgets } from '../../sim/budgets'
import { getPartById, type InstrumentPart } from '../../data/parts'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-slate-900 p-2 text-center">
      <div className="text-slate-500">{label}</div>
      <div className="font-bold text-slate-300">{value}</div>
    </div>
  )
}

function OrbitCard({
  orbit,
  selected,
  onSelect,
}: {
  orbit: LunarOrbit
  selected: boolean
  onSelect: () => void
}) {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  // What this orbit would do for the current design
  const trial = computeBudgets({ ...design, orbit: orbit.id }, difficulty)
  const iceRates = design.instruments
    .map((id) => getPartById(id) as InstrumentPart | undefined)
    .filter((i): i is InstrumentPart => !!i && i.seesShadow)
    .map((i) => trial.coverageRate[i.id] ?? 0)
  const bestRate = iceRates.length ? Math.max(...iceRates) : 0

  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-lg p-4 text-left transition-colors ${
        selected ? 'bg-orange-900 ring-2 ring-orange-500' : 'bg-slate-800 hover:bg-slate-700'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-slate-100">{orbit.name}</div>
          <div className="mt-1 text-sm text-slate-400">{orbit.description}</div>
        </div>
        <div
          className={`h-5 w-5 shrink-0 rounded-full border-2 ${
            selected ? 'border-orange-500 bg-orange-500' : 'border-slate-600'
          }`}
        />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
        <Stat label="Over the pole" value={`${orbit.altitude} km`} />
        <Stat label="Passes a turn" value={`${orbit.passesPerTurn}`} />
        <Stat label="Upkeep" value={`${orbit.stationKeepingDeltaV} m/s/turn`} />
        <Stat label="Earth in view" value={`${Math.round(orbit.earthVisible * 100)}%`} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>Sunlit {Math.round(orbit.sunlitShare * 100)}%</span>
        <span>Eclipse {orbit.eclipseHours} h</span>
        <span>
          To capture:{' '}
          <span className={trial.captureDeltaV === null ? 'text-red-400' : 'text-slate-200'}>
            {trial.captureDeltaV === null ? 'not possible with your engine' : `${trial.captureDeltaV.toFixed(0)} m/s`}
          </span>
        </span>
        <span>
          Your ice instruments map:{' '}
          <span className={bestRate > 0.09 ? 'text-green-400' : 'text-orange-400'}>
            {iceRates.length ? `${(bestRate * 100).toFixed(1)}% of what is left, per turn` : 'nothing (none sees into shadow)'}
          </span>
        </span>
      </div>
      <div className="mt-1 text-xs text-slate-500">Flown by: {orbit.flownBy}</div>
    </button>
  )
}

export function OrbitScreen() {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const getBudgets = useGameStore((s) => s.getBudgets)

  const budgets = getBudgets()
  const instruments = design.instruments
    .map((id) => getPartById(id) as InstrumentPart | undefined)
    .filter((i): i is InstrumentPart => !!i)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-lg bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-orange-400">4. Orbit Selection</h1>
        <p className="mt-2 text-slate-400">
          Only a polar orbit passes over the south pole. More and lower passes map faster, but the orbit costs more to
          reach and to hold. The ice instruments only work close to the surface.
        </p>
      </div>

      <div className="rounded-lg bg-orange-950 p-4 text-sm">
        <div className="font-medium text-orange-300">This orbit with your design</div>
        <div className="mt-2 grid grid-cols-2 gap-4 text-orange-200">
          <div>
            Projected ice coverage in 12 clean turns:{' '}
            <span className={budgets.projectedCoverage >= 70 ? 'text-green-400' : 'text-red-400'}>
              {budgets.projectedCoverage.toFixed(0)}%
            </span>{' '}
            (need 70%)
          </div>
          <div>
            Instruments can run:{' '}
            <span className={budgets.scienceDuty >= 1 ? 'text-green-400' : 'text-orange-400'}>
              {Math.round(budgets.scienceDuty * 100)}% of the time
            </span>
          </div>
          <div>
            Eclipse needs <span className="text-orange-400">{budgets.batteryNeedWh.toFixed(0)} Wh</span>; battery gives{' '}
            <span className={budgets.batteryOk ? 'text-green-400' : 'text-red-400'}>
              {budgets.batteryUsableWh.toFixed(0)} Wh
            </span>
          </div>
          <div>
            Holding the orbit: <span className="text-orange-400">{budgets.deltaVStationKeeping} m/s a turn</span>
            {budgets.captureDeltaV !== null && <>, {budgets.upkeepTurns} turns of upkeep after capture</>}
          </div>
        </div>
        {instruments.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-orange-200/80">
            {instruments.map((i) => (
              <li key={i.id}>
                {i.name}: works at {Math.round((budgets.quality[i.id] ?? 0) * 100)}% quality here
                {!i.seesShadow && ' (cannot see into shadow: does not count as ice coverage)'}
              </li>
            ))}
          </ul>
        )}
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
