import { useGameStore } from '../state/gameStore'
import type { DesignStep } from '../sim/types'

const steps: { id: DesignStep; name: string }[] = [
  { id: 'brief', name: 'Brief' },
  { id: 'planning', name: '1. Planning' },
  { id: 'instruments', name: '2. Instruments' },
  { id: 'rocket', name: '3. Rocket' },
  { id: 'spacecraft', name: '4. Spacecraft' },
  { id: 'orbit', name: '5. Orbit' },
  { id: 'ride', name: '6. Ride & Transfer' },
  { id: 'comms', name: '7. Communications' },
  { id: 'go-nogo', name: '8. Go/No-Go' },
]

export function StepRail() {
  const designStep = useGameStore((s) => s.designStep)
  const setDesignStep = useGameStore((s) => s.setDesignStep)

  const currentIndex = steps.findIndex((s) => s.id === designStep)

  return (
    <nav className="w-48 border-r border-slate-800 bg-slate-900 p-2">
      <div className="space-y-1">
        {steps.map((step, index) => {
          const isCurrent = step.id === designStep
          const isPast = index < currentIndex
          const isFuture = index > currentIndex

          return (
            <button
              key={step.id}
              onClick={() => setDesignStep(step.id)}
              className={`
                flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors
                ${isCurrent ? 'bg-slate-700 text-white' : ''}
                ${isPast ? 'text-slate-200 hover:bg-slate-800' : ''}
                ${isFuture ? 'text-slate-500 hover:bg-slate-800' : ''}
              `}
            >
              <span
                className={`h-2 w-2 rounded-full ${isCurrent ? 'bg-blue-400' : isPast ? 'bg-emerald-500' : 'bg-slate-600'}`}
              />
              <span>{step.name}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
