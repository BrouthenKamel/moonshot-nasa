import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { canUseWebGL } from '../../scene/webgl'
import { buildBayView, type BayView } from '../../viz/spacecraft/bayView'
import { trayGroups, type TrayKey } from '../../viz/spacecraft/trayOptions'
import { PartsTray, FactStrip, type ActiveOption } from './spacecraft/PartsTray'
import { BoardText } from './spacecraft/BoardText'

const AssemblyBay = lazy(() => import('../../scene/factory/AssemblyBay').then((m) => ({ default: m.AssemblyBay })))

/** Falls back to the plain board if the 3D bay throws. */
class BayBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** Live bay view, recomputed when the design or difficulty changes. */
function useBayView(): { view: BayView; budgets: ReturnType<ReturnType<typeof useGameStore.getState>['getBudgets']> } {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const getBudgets = useGameStore((s) => s.getBudgets)
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)
  return useMemo(() => {
    const budgets = getBudgets()
    return { view: buildBayView(design, budgets, getGoNoGo().checks), budgets }
    // getBudgets / getGoNoGo read design and difficulty from the store
  }, [design, difficulty, getBudgets, getGoNoGo])
}

/**
 * Step 3 in the Factory: an assembly bay. The craft stands open on a turntable
 * and every part choice changes it; the wall board shows the Go / No-Go bars.
 */
export function SpacecraftScreen() {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const { view, budgets } = useBayView()
  const groups = useMemo(() => trayGroups(budgets), [budgets])
  const [room, setRoom] = useState(canUseWebGL)
  const [hover, setHover] = useState<ActiveOption | null>(null)
  const [last, setLast] = useState<ActiveOption | null>(null)

  const selected: Record<TrayKey, string> = {
    solar: design.solar,
    battery: design.battery,
    computer: design.computer,
    attitude: design.attitude,
    propulsion: design.propulsion,
  }
  const pick = (key: TrayKey, id: string) => {
    setLast({ key, id })
    if (selected[key] === id) return
    updateDesign({ [key]: id })
  }
  const active = hover ?? last
  const activeGroup = active ? groups.find((g) => g.key === active.key) : undefined
  const activeOption = activeGroup?.options.find((o) => o.id === active?.id) ?? null

  return (
    <div className="flex h-full min-h-[560px] w-full flex-col bg-[#03050a]">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {room ? (
          <BayBoundary onError={() => setRoom(false)}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">Opening the assembly bay…</div>}>
              <AssemblyBay view={view} />
            </Suspense>
          </BayBoundary>
        ) : (
          <div className="h-full overflow-auto">
            <BoardText view={view} />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <button
            onClick={() => setDesignStep('instruments')}
            className="rounded-lg bg-slate-700/90 px-6 py-2 font-medium text-slate-200 backdrop-blur hover:bg-slate-600"
          >
            ← Back
          </button>
        </div>
        <div className="absolute top-3 right-3">
          <button
            onClick={() => setDesignStep('orbit')}
            className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white shadow-lg shadow-blue-900/50 hover:bg-blue-500"
          >
            Select Orbit →
          </button>
        </div>
      </div>
      <div className="space-y-1.5 border-t border-purple-900/40 bg-[#05070d] px-3 pt-2 pb-3">
        <FactStrip option={activeOption} title={activeGroup?.title} />
        <PartsTray groups={groups} selected={selected} onPick={pick} onActive={setHover} />
      </div>
    </div>
  )
}
