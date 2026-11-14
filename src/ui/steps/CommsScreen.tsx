import { useGameStore } from '../../state/gameStore'
import { radios, type RadioPart } from '../../data/parts'
import { groundStations, type GroundStation } from '../../data/ground'

function RadioCard({
  radio,
  selected,
  onSelect,
}: {
  radio: RadioPart
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-lg p-4 text-left transition-colors ${
        selected
          ? 'bg-blue-900 ring-2 ring-blue-500'
          : 'bg-slate-800 hover:bg-slate-700'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-slate-100">{radio.name}</div>
          <div className="mt-1 text-sm text-slate-400">{radio.description}</div>
        </div>
        <div
          className={`h-5 w-5 rounded-full border-2 ${
            selected ? 'border-blue-500 bg-blue-500' : 'border-slate-600'
          }`}
        />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Data Rate</div>
          <div className="font-bold text-slate-300">{radio.dataRate} kbps</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Power</div>
          <div className="font-bold text-slate-300">{Math.abs(radio.power)} W</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Mass</div>
          <div className="font-bold text-slate-300">{radio.mass} kg</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Cost</div>
          <div className="font-bold text-slate-300">${radio.cost}M</div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
        <span>Gain: {radio.gain} dBi</span>
        {radio.deployable && <span className="text-yellow-500">Deployable antenna</span>}
      </div>
    </button>
  )
}

function GroundStationCard({
  station,
  selected,
  onSelect,
}: {
  station: GroundStation
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-lg p-4 text-left transition-colors ${
        selected
          ? 'bg-blue-900 ring-2 ring-blue-500'
          : 'bg-slate-800 hover:bg-slate-700'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-slate-100">{station.name}</div>
          <div className="mt-1 text-sm text-slate-400">{station.description}</div>
        </div>
        <div
          className={`h-5 w-5 rounded-full border-2 ${
            selected ? 'border-blue-500 bg-blue-500' : 'border-slate-600'
          }`}
        />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Contact</div>
          <div className="font-bold text-slate-300">{station.contactHoursPerDay}h/day</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Rate Mult</div>
          <div className="font-bold text-slate-300">{station.dataRateMultiplier}x</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Setup</div>
          <div className="font-bold text-slate-300">${station.setupCost}M</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Per Turn</div>
          <div className="font-bold text-slate-300">${station.costPerTurn}M</div>
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500">
        Reliability: {Math.round(station.reliability * 100)}%
      </div>
    </button>
  )
}

export function CommsScreen() {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const getBudgets = useGameStore((s) => s.getBudgets)

  const budgets = getBudgets()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-lg bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-blue-400">6. Communications</h1>
        <p className="mt-2 text-slate-400">
          Set up your data link. Balance radio capability with ground station coverage to get your science data home.
        </p>
      </div>

      <div className="rounded-lg bg-blue-950 p-4 text-sm">
        <div className="font-medium text-blue-300">Data Link Budget</div>
        <div className="mt-2 grid grid-cols-2 gap-4 text-blue-200">
          <div>
            Generated: <span className="text-blue-400">{budgets.dataPerTurn.toFixed(1)} GB/turn</span>
          </div>
          <div>
            Downlink: <span className={budgets.dataMarginPerTurn >= 0 ? 'text-green-400' : 'text-red-400'}>
              {budgets.downlinkPerTurn.toFixed(1)} GB/turn
            </span>
          </div>
          <div>
            Storage: <span className="text-blue-400">{budgets.storageCapacity} GB</span>
          </div>
          <div>
            Margin: <span className={budgets.dataMarginPerTurn >= 0 ? 'text-green-400' : 'text-red-400'}>
              {budgets.dataMarginPerTurn >= 0 ? '+' : ''}{budgets.dataMarginPerTurn.toFixed(1)} GB/turn
            </span>
          </div>
        </div>
        {budgets.dataMarginPerTurn < 0 && (
          <div className="mt-2 text-red-300">
            Warning: Data will be lost each turn. Improve your radio or ground station.
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-4 font-semibold text-slate-200">Spacecraft Radio</h2>
        <div className="space-y-4">
          {radios.map((radio) => (
            <RadioCard
              key={radio.id}
              radio={radio}
              selected={design.radio === radio.id}
              onSelect={() => updateDesign({ radio: radio.id })}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-4 font-semibold text-slate-200">Ground Station</h2>
        <div className="space-y-4">
          {groundStations.map((station) => (
            <GroundStationCard
              key={station.id}
              station={station}
              selected={design.groundStation === station.id}
              onSelect={() => updateDesign({ groundStation: station.id })}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setDesignStep('ride')}
          className="rounded-lg bg-slate-700 px-6 py-2 font-medium text-slate-300 hover:bg-slate-600"
        >
          ← Back
        </button>
        <button
          onClick={() => setDesignStep('go-nogo')}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500"
        >
          Go/No-Go Review →
        </button>
      </div>
    </div>
  )
}
