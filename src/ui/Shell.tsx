import { useEffect, useRef } from 'react'
import { useGameStore } from '../state/gameStore'
import { useUiStore } from '../state/uiStore'
import { buildingForStep } from '../viz/missionMap'
import type { BuildingId } from '../data/agency'
import type { DesignStep } from '../sim/types'
import { Header } from './Header'
import { MissionVitalityCluster } from './hud/MissionVitalityCluster'

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

interface ShellProps {
  children: React.ReactNode
}

export function Shell({ children }: ShellProps) {
  const screen = useGameStore((s) => s.screen)
  const designStep = useGameStore((s) => s.designStep)
  const setPreviewPatch = useUiStore((s) => s.setPreviewPatch)

  // Only show full shell during design phase
  const showDesignUI = screen === 'design'
  const role: BuildingRole = showDesignUI ? roleForStep(designStep) : 'ground'

  // Each step opens at its top and clears any stale hover preview
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
    setPreviewPatch(null)
  }, [designStep, screen, setPreviewPatch])

  return (
    <div data-role={role} className="dark-steps relative flex h-screen flex-col bg-ink-0 text-paper overflow-hidden select-none">
      <Header />

      <div className="relative flex flex-1 overflow-hidden">
        {/* Main Stage: Full-bleed living viewport */}
        <main
          ref={mainRef}
          className="relative flex-1 overflow-auto bg-ink-0 scrollbar-thin scrollbar-thumb-rule"
        >
          {children}
        </main>

        {/* Full-Fidelity Mission Vitality HUD Dialog (toggled via HUD button or 'H') */}
        {showDesignUI && <MissionVitalityCluster />}
      </div>
    </div>
  )
}
