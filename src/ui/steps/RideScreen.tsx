import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { canUseWebGL } from '../../scene/webgl'
import type { RideFocus } from '../../scene/launch/LaunchPad'
import { RideOverlay, RideTimeline } from './RideOverlay'
import { rides, type Ride } from '../../data/rides'
import { transfers, type Transfer, isTransferCompatible } from '../../data/transfers'
import { getPartById, type PropulsionPart } from '../../data/parts'
import { computeBudgets } from '../../sim/budgets'

const LaunchPad = lazy(() => import('../../scene/launch/LaunchPad').then((m) => ({ default: m.LaunchPad })))

/** Falls back to the plain cards if the 3D launch pad throws. */
class PadBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

type FocusProps = { onFocus: (f: RideFocus) => void }

function RideCard({
  ride,
  selected,
  onSelect,
  onFocus,
}: {
  ride: Ride
  selected: boolean
  onSelect: () => void
} & FocusProps) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      onFocus={() => onFocus({ kind: 'ride', id: ride.id })}
      onBlur={() => onFocus(null)}
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
          <div className="font-bold text-slate-300">Month {ride.departureTurn}</div>
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
  onFocus,
}: {
  transfer: Transfer
  selected: boolean
  compatible: boolean
  onSelect: () => void
} & FocusProps) {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  // What this transfer would mean for the current design
  const trial = computeBudgets({ ...design, transfer: transfer.id }, difficulty)
  const duration =
    trial.transferTurns === null ? 'not possible' : trial.transferTurns === 0 ? 'about 5 days' : `${trial.transferTurns} months`
  return (
    <button
      onClick={onSelect}
      disabled={!compatible}
      aria-pressed={selected}
      onFocus={() => onFocus({ kind: 'transfer', id: transfer.id })}
      onBlur={() => onFocus(null)}
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

/**
 * The plain ride and transfer cards. Always rendered: visible when there is no
 * 3D launch pad, and kept for keyboard and screen-reader users (visually hidden)
 * when there is.
 */
function RideControls({ hidden, onFocus }: { hidden: boolean } & FocusProps) {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const getBudgets = useGameStore((s) => s.getBudgets)

  const budgets = getBudgets()
  const propulsion = getPartById(design.propulsion) as PropulsionPart | undefined
  const propType = propulsion?.type ?? 'chemical'

  return (
    <div className={hidden ? 'sr-only' : 'mx-auto max-w-3xl space-y-6'}>
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
            Capture + 12 months of upkeep:{' '}
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
              {budgets.arrivalTurn === null ? '-' : `month ${budgets.arrivalTurn}`}
            </span>
            {budgets.transferTurns !== null && budgets.transferTurns > 0 && (
              <span className="text-orange-200/60"> ({budgets.transferTurns} months of running the team in transit)</span>
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
              onFocus={onFocus}
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
              onFocus={onFocus}
            />
          ))}
        </div>
      </div>

    </div>
  )
}

function StepButtons({ overlay }: { overlay: boolean }) {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const back = (
    <button
      onClick={() => setDesignStep('orbit')}
      className="rounded-lg bg-slate-700/90 px-6 py-2 font-medium text-slate-200 backdrop-blur hover:bg-slate-600"
    >
      ← Back
    </button>
  )
  const next = (
    <button
      onClick={() => setDesignStep('comms')}
      className="rounded-lg bg-orange-600 px-6 py-2 font-medium text-white shadow-lg shadow-orange-900/50 hover:bg-orange-500"
    >
      Setup Communications →
    </button>
  )
  if (overlay)
    return (
      <>
        <div className="absolute top-3 left-3">{back}</div>
        <div className="absolute top-3 right-3">{next}</div>
      </>
    )
  return (
    <div className="mx-auto mt-6 flex max-w-3xl justify-between">
      {back}
      {next}
    </div>
  )
}

export function RideScreen() {
  // The 3D launch pad starts only in a browser with WebGL; server rendering and tests take the plain path
  const [pad, setPad] = useState(canUseWebGL)
  const [focus, setFocus] = useState<RideFocus>(null)

  if (!pad)
    return (
      <div className="h-full overflow-auto p-4">
        <RideControls hidden={false} onFocus={() => {}} />
        <StepButtons overlay={false} />
      </div>
    )

  return (
    <div className="relative h-full min-h-[480px] w-full overflow-hidden bg-[#03050a]">
      <PadBoundary onError={() => setPad(false)}>
        <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">Opening the launch site…</div>}>
          <LaunchPad focus={focus} />
        </Suspense>
      </PadBoundary>
      <RideControls hidden onFocus={setFocus} />
      <RideOverlay />
      <RideTimeline />
      <StepButtons overlay />
    </div>
  )
}
