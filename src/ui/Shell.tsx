import { useEffect, useRef } from 'react'
import { useGameStore } from '../state/gameStore'
import { useUiStore } from '../state/uiStore'
import { buildingForStep } from '../viz/missionMap'
import type { BuildingId } from '../data/agency'
import type { DesignStep } from '../sim/types'
import { Header } from './Header'
import { StepRail } from './StepRail'
import { Dashboard } from './Dashboard'

export type BuildingRole = 'ground' | 'science' | 'space' | 'launch'

const BUILDING_TO_ROLE: Record<BuildingId, BuildingRole> = {
  'comms-center': 'ground',
  'research-lab': 'science',
  factory: 'space',
  'launch-site': 'launch',
}

/** Map a design step to its building's HUD role token (`[data-role]`). */
export function roleForStep(step: DesignStep): BuildingRole {
  return BUILDING_TO_ROLE[buildingForStep(step)]
}

/** Steps that fill the main column edge to edge and show their own numbers (no quest log). */
const FULL_BLEED_STEPS: DesignStep[] = ['planning', 'rocket', 'spacecraft', 'orbit', 'ride']

interface ShellProps {
  children: React.ReactNode
}

export function Shell({ children }: ShellProps) {
  const screen = useGameStore((s) => s.screen)
  const designStep = useGameStore((s) => s.designStep)
  const setPreviewPatch = useUiStore((s) => s.setPreviewPatch)

  // Only show full shell during design phase
  const showDesignUI = screen === 'design'
  const fullBleed = showDesignUI && FULL_BLEED_STEPS.includes(designStep)
  const role: BuildingRole = showDesignUI ? roleForStep(designStep) : 'ground'

  // Each step opens at its top and clears any stale hover preview
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
    setPreviewPatch(null)
  }, [designStep, screen, setPreviewPatch])

  return (
    <div data-role={role} className="dark-steps flex h-screen flex-col bg-ink-0 text-paper">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {showDesignUI && <StepRail />}
        <main
          ref={mainRef}
          className={fullBleed ? 'flex-1 overflow-hidden bg-ink-0' : 'hud-grid-bg flex-1 overflow-auto p-4'}
        >
          {children}
        </main>
        {/* The quest log: mission objectives, margins and the Go/No-Go stamp */}
        {showDesignUI && !fullBleed && <Dashboard />}
      </div>
    </div>
  )
}
