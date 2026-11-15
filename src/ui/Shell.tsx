import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../state/gameStore'
import { useUiStore } from '../state/uiStore'
import { buildingForStep } from '../viz/missionMap'
import type { BuildingId } from '../data/agency'
import type { DesignStep } from '../sim/types'
import { Header } from './Header'
import { StepRail } from './StepRail'
import { Dashboard } from './Dashboard'
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
  const [showSideRail, setShowSideRail] = useState(false)
  const [showObjectives, setShowObjectives] = useState(false)

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
        {/* Toggleable Mission Sequence Rail */}
        {showDesignUI && showSideRail && (
          <aside className="absolute inset-y-0 left-0 z-50 flex shadow-2xl transition-all duration-300">
            <StepRail />
            <button
              type="button"
              onClick={() => setShowSideRail(false)}
              className="bg-ink-1/90 border-r border-y border-rule px-2 py-4 text-xs font-mono text-paper-dim hover:text-paper"
              title="Close Mission Sequence"
            >
              ◀
            </button>
          </aside>
        )}

        {/* Floating Toggle Rail Button on the left */}
        {showDesignUI && !showSideRail && (
          <button
            type="button"
            onClick={() => setShowSideRail(true)}
            className="absolute top-4 left-4 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink-1/90 border border-rule/80 backdrop-blur-md text-[11px] font-mono text-paper-dim hover:text-paper hover:bg-ink-2 shadow-lg transition-all"
            title="Open Mission Sequence Rail"
          >
            <span>☰</span>
            <span>Sequence</span>
          </button>
        )}

        {/* Main Stage: Full-bleed living viewport */}
        <main
          ref={mainRef}
          className="relative flex-1 overflow-auto bg-ink-0 scrollbar-thin scrollbar-thumb-rule"
        >
          {children}
        </main>

        {/* Full-Fidelity Mission Vitality HUD Dialog (toggled via HUD button or 'H') */}
        {showDesignUI && <MissionVitalityCluster />}

        {/* Toggleable Objectives / Quest Log Drawer */}
        {showDesignUI && showObjectives && (
          <aside className="absolute inset-y-0 right-0 z-50 flex shadow-2xl transition-all duration-300">
            <button
              type="button"
              onClick={() => setShowObjectives(false)}
              className="bg-ink-1/90 border-l border-y border-rule px-2 py-4 text-xs font-mono text-paper-dim hover:text-paper"
              title="Close Objectives"
            >
              ▶
            </button>
            <Dashboard />
          </aside>
        )}
      </div>
    </div>
  )
}
