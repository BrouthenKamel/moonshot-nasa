import { useGameStore } from '../../state/gameStore'
import { rides, type Ride } from '../../data/rides'
import { transfers, type Transfer, isTransferCompatible } from '../../data/transfers'
import { getPartById, type PropulsionPart } from '../../data/parts'

function RideCard({
  ride,
  selected,
  onSelect,
}: {
  ride: Ride
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
          <div className="font-semibold text-slate-100">{ride.name}</div>
          <div className="mt-1 text-sm text-slate-400">{ride.description}</div>
        </div>
        <div
          className={`h-5 w-5 rounded-full border-2 ${
            selected ? 'border-orange-500 bg-orange-500' : 'border-slate-600'
          }`}
        />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Departs</div>
          <div className="font-bold text-slate-300">Turn {ride.departureTurn}</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Cost</div>
          <div className="font-bold text-slate-300">${ride.cost}M</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Mass Limit</div>
          <div className="font-bold text-slate-300">{ride.massLimit} kg</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Delta-v needed</div>
          <div className="font-bold text-slate-300">{ride.requiredDeltaV} m/s</div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
        <span>Drop-off: {ride.dropOffOrbit}</span>
        {ride.electricCompatible && <span className="text-blue-400">Electric OK</span>}
        {ride.chemicalCompatible && <span className="text-orange-400">Chemical OK</span>}
      </div>
    </button>
  )
}

function TransferCard({
  transfer,
  selected,
  compatible,
  onSelect,
}: {
  transfer: Transfer
  selected: boolean
  compatible: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      disabled={!compatible}
      className={`w-full rounded-lg p-4 text-left transition-colors ${
        !compatible
          ? 'cursor-not-allowed bg-slate-900 opacity-50'
          : selected
            ? 'bg-blue-900 ring-2 ring-blue-500'
            : 'bg-slate-800 hover:bg-slate-700'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-slate-100">{transfer.name}</div>
          <div className="mt-1 text-sm text-slate-400">{transfer.description}</div>
        </div>
        <div
          className={`h-5 w-5 rounded-full border-2 ${
            selected ? 'border-blue-500 bg-blue-500' : 'border-slate-600'
          }`}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Duration</div>
          <div className="font-bold text-slate-300">{transfer.durationTurns} turn(s)</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Delta-v factor</div>
          <div className="font-bold text-slate-300">{transfer.deltaVMultiplier}x</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Risk</div>
          <div className="font-bold text-slate-300">{transfer.riskFactor}x</div>
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500">
        Requires: {transfer.propulsionType === 'any' ? 'any propulsion' : `${transfer.propulsionType} propulsion`}
        {!compatible && <span className="ml-2 text-red-400">(incompatible with your propulsion)</span>}
      </div>
    </button>
  )
}

export function RideScreen() {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const getBudgets = useGameStore((s) => s.getBudgets)

  const budgets = getBudgets()
  const propulsion = getPartById(design.propulsion) as PropulsionPart | undefined
  const propType = propulsion?.type ?? 'chemical'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-lg bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-orange-400">5. Ride & Transfer</h1>
        <p className="mt-2 text-slate-400">
          Choose your rideshare launch and transfer trajectory. The ride drops you off; you navigate the rest.
        </p>
      </div>

      <div className="rounded-lg bg-orange-950 p-4 text-sm">
        <div className="font-medium text-orange-300">Delta-v Budget</div>
        <div className="mt-2 grid grid-cols-2 gap-4 text-orange-200">
          <div>
            Available: <span className="text-orange-400">{budgets.deltaVAvailable.toFixed(0)} m/s</span>
          </div>
          <div>
            Required: <span className={budgets.deltaVMargin >= 0 ? 'text-green-400' : 'text-red-400'}>
              {budgets.deltaVTotal.toFixed(0)} m/s
            </span>
          </div>
          <div>
            Transfer: <span className="text-orange-400">{budgets.deltaVTransfer.toFixed(0)} m/s</span>
          </div>
          <div>
            Capture: <span className="text-orange-400">{budgets.deltaVCapture.toFixed(0)} m/s</span>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-4 font-semibold text-slate-200">Rideshare Options</h2>
        <div className="space-y-4">
          {rides.map((ride) => (
            <RideCard
              key={ride.id}
              ride={ride}
              selected={design.ride === ride.id}
              onSelect={() => updateDesign({ ride: ride.id })}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-4 font-semibold text-slate-200">Transfer Trajectory</h2>
        <p className="mb-4 text-sm text-slate-400">
          Your propulsion type ({propType}) limits your transfer options.
        </p>
        <div className="space-y-4">
          {transfers.map((transfer) => (
            <TransferCard
              key={transfer.id}
              transfer={transfer}
              selected={design.transfer === transfer.id}
              compatible={isTransferCompatible(transfer, propType)}
              onSelect={() => updateDesign({ transfer: transfer.id })}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setDesignStep('orbit')}
          className="rounded-lg bg-slate-700 px-6 py-2 font-medium text-slate-300 hover:bg-slate-600"
        >
          ← Back
        </button>
        <button
          onClick={() => setDesignStep('comms')}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500"
        >
          Setup Communications →
        </button>
      </div>
    </div>
  )
}
