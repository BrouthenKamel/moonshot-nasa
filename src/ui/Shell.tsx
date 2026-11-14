import { useGameStore } from '../state/gameStore'
import { Header } from './Header'
import { StepRail } from './StepRail'
import { Dashboard } from './Dashboard'

interface ShellProps {
  children: React.ReactNode
}

export function Shell({ children }: ShellProps) {
  const screen = useGameStore((s) => s.screen)
  const designStep = useGameStore((s) => s.designStep)

  // Only show full shell during design phase
  const showDesignUI = screen === 'design'
  // Steps that fill the main column edge to edge and show their own numbers (no dashboard)
  const fullBleed = showDesignUI && designStep === 'planning'

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {showDesignUI && <StepRail />}
        <main className={fullBleed ? 'flex-1 overflow-hidden' : 'flex-1 overflow-auto p-4'}>
          {children}
        </main>
        {showDesignUI && !fullBleed && <Dashboard />}
      </div>
    </div>
  )
}
