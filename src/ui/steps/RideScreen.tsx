import { Component, lazy, Suspense, useMemo, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { canUseWebGL } from '../../scene/webgl'
import { getRideById } from '../../data/rides'
import { getTransferById } from '../../data/transfers'

const RideView = lazy(() => import('../../scene/ride/RideView').then((m) => ({ default: m.RideView })))

class ViewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
import { rides, type Ride } from '../../data/rides'
import { transfers, type Transfer, isTransferCompatible } from '../../data/transfers'
import { getPartById, type PropulsionPart } from '../../data/parts'
import { computeBudgets } from '../../sim/budgets'

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
          <div className="text-slate-500">Capture burn</div>
          <div className="font-bold text-slate-300">
            {ride.extraDeltaV > 0 ? `+${ride.extraDeltaV} m/s` : ride.insertionFactor < 1 ? `x${ride.insertionFactor}` : 'full'}
          </div>
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
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  // What this transfer would mean for the current design
  const trial = computeBudgets({ ...design, transfer: transfer.id }, difficulty)
  const duration =
    trial.transferTurns === null ? 'not possible' : trial.transferTurns === 0 ? 'about 5 days' : `${trial.transferTurns} turns`
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
          <div className="text-slate-500">Takes</div>
          <div className="font-bold text-slate-300">{duration}</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">To capture</div>
          <div className="font-bold text-slate-300">
            {trial.captureDeltaV === null ? '-' : `${trial.captureDeltaV.toFixed(0)} m/s`}
          </div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Left after capture</div>
          <div className={`font-bold ${trial.captureDeltaV !== null && trial.deltaVAfterCapture >= 0 ? 'text-slate-300' : 'text-red-400'}`}>
            {trial.captureDeltaV === null ? '-' : `${trial.deltaVAfterCapture.toFixed(0)} m/s`}
          </div>
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

  const webgl = useMemo(() => canUseWebGL(), [])
  const ride = getRideById(design.ride)
  const transfer = getTransferById(design.transfer)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {webgl && (
        <div className="relative -mx-4 h-[46vh] min-h-[340px] overflow-hidden rounded-2xl border border-white/10 bg-black sm:mx-0">
          <ViewBoundary>
            <Suspense fallback={null}>
              <RideView rideId={design.ride} transferId={design.transfer} />
            </Suspense>
          </ViewBoundary>
          <div className="pointer-events-none absolute left-4 top-3 font-mono text-[11px] tracking-[0.2em] text-orange-400">
            LAUNCH SITE · LUNAR ICE MAPPER · RIDE &amp; TRANSFER
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-black/70 px-3 py-1 text-orange-200">
              <span className="mr-1.5 inline-block h-0.5 w-4 bg-orange-400 align-middle" />
              {ride?.name ?? 'Ride'} · leaves turn {budgets.rideTurn}
            </span>
            <span className="rounded-full bg-black/70 px-3 py-1 text-slate-200">
              <span className="mr-1.5 inline-block h-0.5 w-4 border-t-2 border-dashed border-slate-200 align-middle" />
              {transfer?.name ?? 'Transfer'}
              {budgets.transferTurns !== null ? ` · ${budgets.transferTurns} turn${budgets.transferTurns === 1 ? '' : 's'}` : ''}
              {budgets.deltaVTransfer > 0 ? ` · climb ${budgets.deltaVTransfer.toFixed(0)} m/s` : ''}
            </span>
            <span className={`rounded-full bg-black/70 px-3 py-1 ${budgets.captureDeltaV !== null && budgets.deltaVMargin >= 0 ? 'text-amber-200' : 'text-rose-300'}`}>
              ◎ Capture burn {budgets.captureDeltaV === null ? 'not possible with this engine' : `${budgets.captureDeltaV.toFixed(0)} m/s · carrying ${budgets.deltaVAvailable.toFixed(0)} m/s`}
            </span>
          </div>
        </div>
      )}
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
            On board: <span className="text-orange-400">{budgets.deltaVAvailable.toFixed(0)} m/s</span>
            <span className="text-orange-200/60"> ({budgets.propellantMass} kg propellant)</span>
          </div>
          <div>
            Capture + 12 turns of upkeep:{' '}
            <span className={budgets.captureDeltaV !== null && budgets.deltaVMargin >= 0 ? 'text-green-400' : 'text-red-400'}>
              {budgets.captureDeltaV === null ? 'not possible' : `${budgets.deltaVTotal.toFixed(0)} m/s`}
            </span>
          </div>
          <div>
            Climbing out from the drop-off: <span className="text-orange-400">{budgets.deltaVTransfer.toFixed(0)} m/s</span>
          </div>
          <div>
            Arrival:{' '}
            <span className="text-orange-400">
              {budgets.arrivalTurn === null ? '-' : `turn ${budgets.arrivalTurn}`}
            </span>
            {budgets.transferTurns !== null && budgets.transferTurns > 0 && (
              <span className="text-orange-200/60"> ({budgets.transferTurns} turns of running the team in transit)</span>
            )}
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
