import { lazy, Suspense } from 'react'
import { useGameStore } from '../../state/gameStore'
import { DesignDiagramPanel } from '../../viz/DesignDiagramPanel'
import { StageBoundary } from '../../scene/instrumentStage/StageBoundary'
import { canUseWebGL } from '../../scene/webgl'
import { toggleInstrument as toggle } from '../../scene/instrumentStage/stageModel'

const InstrumentStage = lazy(() => import('../../scene/instrumentStage/InstrumentStage'))

/** The Research Lab simulator, or the flat diagram where 3D cannot run. */
function Stage() {
  const flat = <DesignDiagramPanel step="instruments" />
  if (!canUseWebGL()) return flat
  return (
    <StageBoundary fallback={flat}>
      <Suspense fallback={<div className="mb-4 h-[66vh] min-h-[460px] rounded-xl bg-slate-900" />}>
        <InstrumentStage />
      </Suspense>
    </StageBoundary>
  )
}
import { instruments, type InstrumentPart } from '../../data/parts'

function InstrumentCard({
  instrument,
  selected,
  onToggle,
}: {
  instrument: InstrumentPart
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full rounded-lg p-4 text-left transition-colors ${
        selected
          ? 'bg-green-900 ring-2 ring-green-500'
          : 'bg-slate-800 hover:bg-slate-700'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-slate-100">{instrument.name}</div>
          <div className="mt-1 text-sm text-slate-400">{instrument.description}</div>
        </div>
        <div
          className={`h-5 w-5 rounded-full border-2 ${
            selected ? 'border-green-500 bg-green-500' : 'border-slate-600'
          }`}
        />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Mass</div>
          <div className="font-bold text-slate-300">{instrument.mass} kg</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Power</div>
          <div className="font-bold text-slate-300">{Math.abs(instrument.power)} W</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Data</div>
          <div className="font-bold text-slate-300">{instrument.dataPerTurn} MB/turn</div>
        </div>
        <div className="rounded bg-slate-900 p-2 text-center">
          <div className="text-slate-500">Cost</div>
          <div className="font-bold text-slate-300">${instrument.cost}M</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {instrument.seesShadow ? (
          <span className="font-medium text-green-400">Sees into shadowed craters</span>
        ) : (
          <span className="font-medium text-orange-400">Needs sunlight: cannot map the ice in shadow</span>
        )}
        <span>Works {instrument.maxAltitudeKm === null ? 'at any altitude' : `below ${instrument.maxAltitudeKm} km`}</span>
        <span>{instrument.volume} U</span>
        <span>Like {instrument.flownOn}</span>
      </div>
    </button>
  )
}

export function InstrumentsScreen() {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)

  const toggleInstrument = (id: string) => updateDesign({ instruments: toggle(design.instruments, id) })

  const totalMass = instruments
    .filter((i) => design.instruments.includes(i.id))
    .reduce((sum, i) => sum + i.mass, 0)

  const totalPower = instruments
    .filter((i) => design.instruments.includes(i.id))
    .reduce((sum, i) => sum + Math.abs(i.power), 0)

  const totalData = instruments
    .filter((i) => design.instruments.includes(i.id))
    .reduce((sum, i) => sum + i.dataPerTurn, 0)

  return (
    <>
    <Stage />
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-lg bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-green-400">2. Instrument Selection</h1>
        <p className="mt-2 text-slate-400">
          The science question decides the instrument: the ice sits in craters that never see the Sun. Pick one or two.
          Each one costs mass, volume, power and money, and makes data that has to get home.
        </p>
      </div>

      <div className="rounded-lg bg-green-950 p-4 text-sm">
        <div className="font-medium text-green-300">Selected Instruments</div>
        <div className="mt-2 grid grid-cols-3 gap-4 text-green-200">
          <div>
            <span className="text-green-400">{design.instruments.length}</span>{' '}
            {design.instruments.length === 1 ? 'instrument' : 'instruments'}
          </div>
          <div>
            <span className="text-green-400">{totalMass.toFixed(1)}</span> kg
          </div>
          <div>
            <span className="text-green-400">{totalPower}</span> W |{' '}
            <span className="text-green-400">{totalData.toFixed(0)}</span> MB/turn
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {instruments.map((inst) => (
          <InstrumentCard
            key={inst.id}
            instrument={inst}
            selected={design.instruments.includes(inst.id)}
            onToggle={() => toggleInstrument(inst.id)}
          />
        ))}
      </div>

      {design.instruments.length === 0 && (
        <div className="rounded-lg bg-red-950 p-4 text-center text-sm text-red-300">
          Select at least one instrument to continue.
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={() => setDesignStep('planning')}
          className="rounded-lg bg-slate-700 px-6 py-2 font-medium text-slate-300 hover:bg-slate-600"
        >
          ← Back
        </button>
        <button
          onClick={() => setDesignStep('spacecraft')}
          disabled={design.instruments.length === 0}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Configure Spacecraft →
        </button>
      </div>
    </div>
    </>
  )
}
