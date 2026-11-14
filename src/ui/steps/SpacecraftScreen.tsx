import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { canUseWebGL } from '../../scene/webgl'
import { getPartById, type PropulsionPart } from '../../data/parts'
import { useDesignPreview } from '../useDesignPreview'
import { DesignDeltaLine, SynergyStrip } from '../../viz/DesignDeltaLine'
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

function PowerBudgetSplitBar() {
  const design = useGameStore((s) => s.design)
  const { budgets, previewBudgets, previewPatch } = useDesignPreview()
  const active = previewBudgets ?? budgets
  const propId = previewPatch?.propulsion ?? design.propulsion
  const prop = getPartById(propId) as PropulsionPart | undefined
  const ionMin = prop && !prop.impulsive ? prop.minThrustPower : 0
  const bus = active.busPower
  const inst = active.instrumentPower
  const tx = active.transmitExtraPower
  const generated = active.powerGenerated
  const scale = Math.max(generated, bus + inst + tx + ionMin, 1)
  const pct = (w: number) => `${Math.min(100, (w / scale) * 100)}%`
  const deficit = bus + inst > generated

  return (
    <div className="hud-panel flex flex-wrap items-center gap-3 px-3 py-1.5 font-mono text-[11px] tabular-nums">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-400">Power Split</span>
        <span className={deficit ? 'font-semibold text-rose-300' : 'font-semibold text-cyan-300'}>
          {bus + inst}W load / {generated}W solar
        </span>
      </div>
      <div className="relative h-3 min-w-[160px] flex-1 overflow-hidden rounded border border-slate-700/70 bg-slate-950">
        <div className="flex h-full">
          <div style={{ width: pct(bus) }} className="bg-sky-500/85" title={`Bus: ${bus} W`} />
          <div style={{ width: pct(inst) }} className="bg-emerald-400/85" title={`Instruments: ${inst} W`} />
          <div style={{ width: pct(tx) }} className="bg-amber-400/85" title={`Radio TX extra: ${tx} W`} />
          {ionMin > 0 && (
            <div
              style={{ width: pct(ionMin) }}
              className="border-l border-slate-950 bg-purple-400/80"
              title={`Ion thrust minimum: ${ionMin} W`}
            />
          )}
        </div>
        <div className="hud-bar-segments pointer-events-none absolute inset-0" />
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-cyan-300 shadow-[0_0_8px_#22d3ee]"
          style={{ left: pct(generated) }}
          title={`Solar generated: ${generated} W`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2.5 text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-xs bg-sky-500" />
          Bus {bus}W
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-xs bg-emerald-400" />
          Inst {inst}W
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-xs bg-amber-400" />
          TX +{tx}W
        </span>
        {ionMin > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-xs bg-purple-400" />
            Ion ≥{ionMin}W
          </span>
        )}
      </div>
    </div>
  )
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
        <div className="pointer-events-none absolute top-3 left-1/2 hidden -translate-x-1/2 md:block">
          <div className="hud-panel px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--role-accent)]">
            FACTORY · LUNAR ICE MAPPER · SPACECRAFT
          </div>
        </div>
        <div className="absolute top-3 left-3">
          <button
            type="button"
            onClick={() => setDesignStep('rocket')}
            className="tactical-btn-back"
          >
            ← Back
          </button>
        </div>
        <div className="absolute top-3 right-3">
          <button
            type="button"
            onClick={() => setDesignStep('orbit')}
            className="tactical-btn-next"
          >
            Select Orbit →
          </button>
        </div>
      </div>
      <div className="space-y-1.5 border-t border-[var(--role-border)] bg-[#05070d] px-3 pt-2 pb-3">
        <PowerBudgetSplitBar />
        <SynergyStrip step="spacecraft" compact />
        <DesignDeltaLine />
        <FactStrip option={activeOption} title={activeGroup?.title} group={activeGroup?.key} expanded={hover !== null} />
        <PartsTray groups={groups} selected={selected} onPick={pick} onActive={setHover} />
      </div>
    </div>
  )
}
