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
          <div className="text-slate-500">From the Moon</div>
          <div className={`font-bold ${radio.reachesMoon ? 'text-green-400' : 'text-red-400'}`}>
            {radio.reachesMoon ? `gain x${radio.gain}` : 'does not reach'}
          </div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Power</div>
          <div className="font-bold text-slate-300">
            {radio.listenPower} / {radio.transmitPower} W
          </div>
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
        <span>Listening / transmitting power</span>
        <span>{radio.volume} U</span>
        {radio.deployable && <span className="text-yellow-500">Deployable dish</span>}
        {radio.needsPrecisePointing && <span className="text-yellow-500">Needs precise pointing</span>}
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
          <div className="text-slate-500">Rate</div>
          <div className="font-bold text-slate-300">{station.rateKbps} kbps</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Up to</div>
          <div className="font-bold text-slate-300">{station.contactHoursPerDay} h/day</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Price</div>
          <div className="font-bold text-slate-300">${station.pricePerHour}M per h/day</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Outage odds</div>
          <div className="font-bold text-slate-300">{Math.round(station.outageChance * 100)}% a month</div>
        </div>
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
  const station = groundStations.find((g) => g.id === design.groundStation)
  const maxHours = station?.contactHoursPerDay ?? 1

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-lg bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-blue-400">6. Communications</h1>
        <p className="mt-2 text-slate-400">
          Only data that reaches the ground counts. The Moon is a thousand times farther than low Earth orbit, so the
          radio and the ground station decide how much gets home.
        </p>
      </div>

      <div className="rounded-lg bg-blue-950 p-4 text-sm">
        <div className="font-medium text-blue-300">Data Link Budget</div>
        <div className="mt-2 grid grid-cols-2 gap-4 text-blue-200">
          <div>
            Instruments make: <span className="text-blue-400">{budgets.dataPerTurn.toFixed(0)} MB/month</span>
          </div>
          <div>
            Link carries: <span className={budgets.dataMarginPerTurn >= 0 ? 'text-green-400' : 'text-red-400'}>
              {budgets.downlinkPerTurn.toFixed(0)} MB/month
            </span>{' '}
            <span className="text-blue-200/60">({budgets.linkKbps} kbps)</span>
          </div>
          <div>
            Storage on board: <span className="text-blue-400">{budgets.storageCapacity} MB</span>
          </div>
          <div>
            Ground time: <span className="text-blue-400">${budgets.groundCostPerTurn.toFixed(2)}M a month</span>
          </div>
        </div>
        {budgets.dataMarginPerTurn < 0 && (
          <div className="mt-2 text-red-300">
            More data is made than sent. It waits in storage until that is full; after that it is lost, and the ice
            coverage it held is lost with it.
          </div>
        )}
        {budgets.transmitShare < 1 && (
          <div className="mt-2 text-yellow-300">
            Power only lets the radio transmit {Math.round(budgets.transmitShare * 100)}% of the contact time.
          </div>
        )}
      </div>

      <div className="rounded-lg bg-slate-900 p-6">
        <h2 className="mb-2 font-semibold text-slate-200">Contact time</h2>
        <p className="mb-4 text-sm text-slate-400">
          Hours a day booked on the ground station. More hours carry more data but cost money every month.
        </p>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0.25}
            max={maxHours}
            step={0.25}
            value={budgets.contactHours}
            onChange={(e) => updateDesign({ contactHours: Number(e.target.value) })}
            className="flex-1"
          />
          <span className="w-28 text-right text-lg font-bold text-blue-400">{budgets.contactHours} h/day</span>
        </div>
        <div className="mt-2 text-xs text-slate-500">This station gives up to {maxHours} h a day.</div>
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
              onSelect={() =>
                updateDesign({
                  groundStation: station.id,
                  contactHours: Math.min(design.contactHours ?? station.defaultHours, station.contactHoursPerDay),
                })
              }
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
