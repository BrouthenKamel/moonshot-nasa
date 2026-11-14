import { Component, type ReactNode } from 'react'
import type { DesignStep } from '../sim/types'
import { useGameStore } from '../state/gameStore'
import { CubeSatDiagram, type CraftHighlight } from './CubeSatDiagram'
import { MissionStrip } from './MissionStrip'
import { computeDesignDelta, formatDelta } from './designDelta'

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
  const previousBudgets = useGameStore((s) => s.previousBudgets)
  const getBudgets = useGameStore((s) => s.getBudgets)
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
  const deltas = previousBudgets ? computeDesignDelta(previousBudgets, getBudgets()) : []

  return (
    <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
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
      {deltas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-800 pt-2 text-xs">
          <span className="text-slate-500">What this choice changed:</span>
          {deltas.map((line) => {
            const good = line.betterWhenHigher ? line.diff > 0 : line.diff < 0
            return (
              <span key={line.key} className={good ? 'text-green-400' : 'text-orange-400'}>
                {formatDelta(line)}
              </span>
            )
          })}
        </div>
      )}
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
