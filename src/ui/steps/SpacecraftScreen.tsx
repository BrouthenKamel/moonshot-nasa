import { useGameStore } from '../../state/gameStore'
import {
  solarPanels,
  batteries,
  computers,
  attitudeControls,
  propulsionSystems,
  type SolarPart,
  type BatteryPart,
  type ComputerPart,
  type AttitudePart,
  type PropulsionPart,
} from '../../data/parts'

interface PartSelectorProps<T> {
  label: string
  parts: T[]
  selectedId: string
  onSelect: (id: string) => void
  renderStats: (part: T) => React.ReactNode
}

function PartSelector<T extends { id: string; name: string; mass: number; cost: number; description: string }>({
  label,
  parts,
  selectedId,
  onSelect,
  renderStats,
}: PartSelectorProps<T>) {
  return (
    <div className="rounded-lg bg-slate-900 p-6">
      <h2 className="mb-4 font-semibold text-slate-200">{label}</h2>
      <div className="space-y-2">
        {parts.map((part) => (
          <button
            key={part.id}
            onClick={() => onSelect(part.id)}
            className={`w-full rounded-lg p-3 text-left transition-colors ${
              selectedId === part.id
                ? 'bg-purple-900 ring-2 ring-purple-500'
                : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="font-medium text-slate-100">{part.name}</div>
                <div className="mt-1 text-xs text-slate-400">{part.description}</div>
              </div>
              <div className="ml-4 text-right text-xs">
                <div className="text-slate-400">{part.mass} kg</div>
                <div className="text-slate-400">${part.cost}M</div>
              </div>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-slate-500">
              {renderStats(part)}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export function SpacecraftScreen() {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const getBudgets = useGameStore((s) => s.getBudgets)

  const budgets = getBudgets()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-lg bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-purple-400">3. Spacecraft Configuration</h1>
        <p className="mt-2 text-slate-400">
          Configure your spacecraft systems. Everything must fit in the 6U box and work together.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 rounded-lg bg-purple-950 p-4 text-sm">
        <div className="text-center">
          <div className="text-purple-300">Mass</div>
          <div className={`text-lg font-bold ${budgets.massMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {budgets.totalMass.toFixed(1)} / {budgets.massLimit} kg
          </div>
        </div>
        <div className="text-center">
          <div className="text-purple-300">Power</div>
          <div className={`text-lg font-bold ${budgets.powerMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {budgets.powerConsumed}W / {budgets.powerGenerated}W
          </div>
        </div>
        <div className="text-center">
          <div className="text-purple-300">Volume</div>
          <div className={`text-lg font-bold ${budgets.volumeMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {budgets.totalVolume.toFixed(1)} / {budgets.volumeLimit}U
          </div>
        </div>
      </div>

      <PartSelector<SolarPart>
        label="Solar Panels"
        parts={solarPanels}
        selectedId={design.solar}
        onSelect={(id) => updateDesign({ solar: id })}
        renderStats={(part) => (
          <>
            <span>Generates {part.powerGeneration}W</span>
            {part.deployable && <span className="text-yellow-500">Deployable</span>}
          </>
        )}
      />

      <PartSelector<BatteryPart>
        label="Battery"
        parts={batteries}
        selectedId={design.battery}
        onSelect={(id) => updateDesign({ battery: id })}
        renderStats={(part) => (
          <>
            <span>{part.capacity} Wh capacity</span>
            <span>Eclipse: {Math.round((part.capacity / budgets.eclipsePowerConsumed) * 60)} min</span>
          </>
        )}
      />

      <PartSelector<ComputerPart>
        label="Flight Computer"
        parts={computers}
        selectedId={design.computer}
        onSelect={(id) => updateDesign({ computer: id })}
        renderStats={(part) => (
          <>
            <span>{part.storage} GB storage</span>
            {part.redundant && <span className="text-green-500">Redundant</span>}
          </>
        )}
      />

      <PartSelector<AttitudePart>
        label="Attitude Control"
        parts={attitudeControls}
        selectedId={design.attitude}
        onSelect={(id) => updateDesign({ attitude: id })}
        renderStats={(part) => (
          <>
            <span>Pointing: {part.pointingAccuracy}deg</span>
            {part.hasStarTracker && <span className="text-blue-400">Star tracker</span>}
          </>
        )}
      />

      <PartSelector<PropulsionPart>
        label="Propulsion"
        parts={propulsionSystems}
        selectedId={design.propulsion}
        onSelect={(id) => updateDesign({ propulsion: id })}
        renderStats={(part) => (
          <>
            <span>{part.type}</span>
            <span>Isp: {part.isp}s</span>
            <span>Fuel: {part.propellantMass} kg</span>
            {part.type === 'electric' && <span className="text-yellow-500">{part.thrustPower}W thrust</span>}
          </>
        )}
      />

      <div className="flex justify-between">
        <button
          onClick={() => setDesignStep('instruments')}
          className="rounded-lg bg-slate-700 px-6 py-2 font-medium text-slate-300 hover:bg-slate-600"
        >
          ← Back
        </button>
        <button
          onClick={() => setDesignStep('orbit')}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500"
        >
          Select Orbit →
        </button>
      </div>
    </div>
  )
}
