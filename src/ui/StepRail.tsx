import { useGameStore } from '../state/gameStore'
import type { DesignStep, Role } from '../sim/types'

const steps: { id: DesignStep; name: string; role: Role }[] = [
  { id: 'brief', name: 'Brief', role: 'ground' },
  { id: 'planning', name: '1. Planning', role: 'ground' },
  { id: 'instruments', name: '2. Instruments', role: 'science' },
  { id: 'spacecraft', name: '3. Spacecraft', role: 'space' },
  { id: 'orbit', name: '4. Orbit', role: 'launch' },
  { id: 'ride', name: '5. Ride & Transfer', role: 'launch' },
  { id: 'comms', name: '6. Communications', role: 'ground' },
  { id: 'go-nogo', name: '7. Go/No-Go', role: 'ground' },
]

const roleColors: Record<Role, string> = {
  ground: 'bg-blue-500',
  science: 'bg-green-500',
  space: 'bg-purple-500',
  launch: 'bg-orange-500',
}


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
                ${isPast ? 'text-slate-400 hover:bg-slate-800' : ''}
                ${isFuture ? 'text-slate-500 hover:bg-slate-800' : ''}
              `}
            >
              <span
                className={`h-2 w-2 rounded-full ${roleColors[step.role]} ${
                  isFuture ? 'opacity-40' : ''
                }`}
              />
              <span className={isPast ? 'line-through opacity-60' : ''}>
                {step.name}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 border-t border-slate-800 pt-4">
        <div className="text-xs text-slate-500">Roles</div>
        <div className="mt-2 space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${roleColors.ground}`} />
            <span className="text-slate-400">Ground</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${roleColors.science}`} />
            <span className="text-slate-400">Science</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${roleColors.space}`} />
            <span className="text-slate-400">Space</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${roleColors.launch}`} />
            <span className="text-slate-400">Launch</span>
          </div>
        </div>
      </div>
    </nav>
  )
}
