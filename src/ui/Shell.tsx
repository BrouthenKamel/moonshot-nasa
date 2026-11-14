import { useEffect, useRef } from 'react'
import { useGameStore } from '../state/gameStore'
import { Header } from './Header'
import { StepRail } from './StepRail'
import { Dashboard } from './Dashboard'
import type { DesignStep } from '../sim/types'

/** Steps that fill the main column edge to edge and show their own numbers (no dashboard). */
const FULL_BLEED_STEPS: DesignStep[] = ['planning', 'rocket', 'spacecraft', 'orbit', 'ride']

interface ShellProps {
  children: React.ReactNode
}

export function Shell({ children }: ShellProps) {
  const screen = useGameStore((s) => s.screen)
  const designStep = useGameStore((s) => s.designStep)

  // Only show full shell during design phase
  const showDesignUI = screen === 'design'
  const fullBleed = showDesignUI && FULL_BLEED_STEPS.includes(designStep)

  // Each step opens at its top, not at the scroll position the previous step was left at
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [designStep, screen])

  return (
    <div className="dark-steps flex h-screen flex-col bg-slate-950 text-slate-100">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {showDesignUI && <StepRail />}
        <main ref={mainRef} className={fullBleed ? 'flex-1 overflow-hidden' : 'flex-1 overflow-auto p-4'}>
          {children}
        </main>
        {showDesignUI && !fullBleed && <Dashboard />}
      </div>
    </div>
  )
}
