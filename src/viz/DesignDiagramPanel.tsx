import { Component, type ReactNode } from 'react'
import type { DesignStep } from '../sim/types'
import { useGameStore } from '../state/gameStore'
import { CubeSatDiagram, type CraftHighlight } from './CubeSatDiagram'
import { MissionStrip } from './MissionStrip'
import { DesignDeltaLine } from './DesignDeltaLine'

class DiagramBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function PanelBody({ step }: { step: DesignStep }) {
  const design = useGameStore((s) => s.design)
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)

  const failingSteps: DesignStep[] =
    step === 'go-nogo'
      ? getGoNoGo()
          .checks.filter((c) => c.status === 'red' && c.fixStep)
          .map((c) => c.fixStep as DesignStep)
      : []

  const highlight: CraftHighlight =
    step === 'instruments' ? 'instruments' : step === 'spacecraft' ? 'bus' : step === 'go-nogo' ? 'all' : null
  const showCraft = step !== 'brief'

  return (
    <div className="hud-panel mb-4 rounded-2xl p-3">
      <div className="flex h-32 gap-3">
        {showCraft && (
          <div className="h-full w-1/3 min-w-0">
            <CubeSatDiagram
              design={design}
              failing={failingSteps.includes('spacecraft')}
              highlight={highlight}
              failingGroups={{ bus: failingSteps.includes('spacecraft') }}
            />
          </div>
        )}
        <div className="h-full min-w-0 flex-1">
          <MissionStrip step={step} design={design} failingSteps={failingSteps} />
        </div>
      </div>
      <DesignDeltaLine />
    </div>
  )
}

export function DesignDiagramPanel({ step }: { step: DesignStep }) {
  return (
    <DiagramBoundary>
      <PanelBody step={step} />
    </DiagramBoundary>
  )
}
