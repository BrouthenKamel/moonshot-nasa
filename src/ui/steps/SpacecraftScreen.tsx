import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { canUseWebGL } from '../../scene/webgl'
import { getPartById, type PropulsionPart } from '../../data/parts'
import { buildBayView, type BayView, type BoardRow, type Tone } from '../../viz/spacecraft/bayView'
import { buildCraft, type CraftSlot } from '../../viz/spacecraft/craftBuild'
import { useDesignPreview } from '../useDesignPreview'
import { DesignDeltaLine, SynergyStrip } from '../../viz/DesignDeltaLine'
import { trayGroups, type TrayKey } from '../../viz/spacecraft/trayOptions'
import { TONE_COLORS } from '../../viz/spacecraft/boardPainter'
import type { ViewPreset } from '../../scene/spacecraft/SpacecraftStage'
import { PartsTray, FactStrip, type ActiveOption } from './spacecraft/PartsTray'
import { BoardText } from './spacecraft/BoardText'

const SpacecraftStage = lazy(() => import('../../scene/spacecraft/SpacecraftStage').then((m) => ({ default: m.SpacecraftStage })))

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

const TONE_COLOR: Record<Tone, string> = { green: '#22c55e', yellow: '#f59e0b', red: '#ef4444' }

/** One row of the check panel: the same numbers and reasons as the Go / No-Go bars */
function CheckRow({ row }: { row: BoardRow }) {
  const share = row.limit > 0 ? Math.min(1.25, row.value / row.limit) : 1.25
  return (
    <li title={row.reason}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{row.title}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color: TONE_COLOR[row.tone] }}>
          {row.text}
        </span>
      </div>
      {/* the limit sits at 80% of the width, so an overshoot shows past the mark */}
      <div className="relative mt-1 h-1.5 rounded-full bg-white/10">
        <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, share * 80)}%`, background: TONE_COLOR[row.tone] }} />
        <div className="absolute -top-1 h-3.5 w-0.5 bg-white/60" style={{ left: '80%' }} />
      </div>
    </li>
  )
}

const VIEWS: Array<{ id: ViewPreset; label: string }> = [
  { id: 'closeup', label: 'Close-up' },
  { id: 'overview', label: 'Whole craft' },
  { id: 'avionics', label: 'Avionics' },
  { id: 'propulsion', label: 'Engine' },
  { id: 'payload', label: 'Payload' },
]

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
 * Step 4 in the Factory: the assembly bay. The 6U craft hovers over a turntable, built from real
 * hardware models, and every choice changes it; the panel on the right shows the same Go / No-Go
 * numbers as the rest of the game.
 */
export function SpacecraftScreen() {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const { view, budgets } = useBayView()
  const groups = useMemo(() => trayGroups(budgets), [budgets])
  const craft = useMemo(() => buildCraft(design), [design])
  const [room, setRoom] = useState(canUseWebGL)
  const [hover, setHover] = useState<ActiveOption | null>(null)
  const [last, setLast] = useState<ActiveOption | null>(null)
  const [explode, setExplode] = useState(0)
  const [deployed, setDeployed] = useState(true)
  const [panels, setPanels] = useState(false)
  const [preset, setPreset] = useState<ViewPreset>('closeup')
  const [hoverSlot, setHoverSlot] = useState<CraftSlot | null>(null)
  const [pickedSlot, setPickedSlot] = useState<CraftSlot | null>(null)

  const selected: Record<TrayKey, string> = {
    solar: design.solar,
    battery: design.battery,
    computer: design.computer,
    attitude: design.attitude,
    propulsion: design.propulsion,
  }
  const pick = (key: TrayKey, id: string) => {
    setLast({ key, id })
    setPickedSlot(key)
    if (selected[key] === id) return
    updateDesign({ [key]: id })
  }
  const active = hover ?? last
  const activeGroup = active ? groups.find((g) => g.key === active.key) : undefined
  const activeOption = activeGroup?.options.find((o) => o.id === active?.id) ?? null
  const glowSlot: CraftSlot | null = hover?.key ?? hoverSlot ?? pickedSlot

  const instruments = design.instruments.map((id) => getPartById(id)?.name ?? id)
  const radio = getPartById(design.radio)?.name ?? design.radio

  const btn =
    'rounded-lg border px-3 py-1.5 text-xs font-semibold backdrop-blur transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
  const on = 'border-violet-300/60 bg-violet-500/30 text-white'
  const off = 'border-white/10 bg-slate-950/70 text-slate-300 hover:bg-slate-800'

  return (
    <div className="flex h-full min-h-[560px] w-full flex-col bg-[#05070d]">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {room ? (
          <BayBoundary onError={() => setRoom(false)}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">Opening the assembly bay…</div>}>
              <SpacecraftStage
                craft={craft}
                explode={explode}
                deployed={deployed}
                panels={panels}
                view={preset}
                ringColor={TONE_COLORS[view.massTone]}
                activeSlot={glowSlot}
                onHover={setHoverSlot}
                onSelect={(slot) => {
                  setPickedSlot(slot)
                  const key = (['solar', 'battery', 'computer', 'attitude', 'propulsion'] as const).find((k) => k === slot)
                  if (key) setLast({ key, id: selected[key] })
                }}
              />
            </Suspense>
          </BayBoundary>
        ) : (
          <div className="h-full overflow-auto">
            <BoardText view={view} />
          </div>
        )}

        <div className="pointer-events-none absolute top-3 left-1/2 z-10 hidden -translate-x-1/2 md:block">
          <div className="hud-panel px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--role-accent)]">
            FACTORY · LUNAR ICE MAPPER · SPACECRAFT
          </div>
        </div>

        <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={() => setDesignStep('rocket')}
            className="tactical-btn-back"
          >
            ← Back
          </button>
          {room && (
            <>
              <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-slate-950/70 p-1.5 backdrop-blur" role="group" aria-label="Camera">
                {VIEWS.map((v) => (
                  <button key={v.id} onClick={() => setPreset(v.id)} aria-pressed={preset === v.id} className={`${btn} text-left ${preset === v.id ? on : 'border-transparent text-slate-300 hover:bg-slate-800'}`}>
                    {v.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setDeployed((v) => !v)} aria-pressed={deployed} className={`${btn} ${deployed ? on : off}`}>
                {deployed ? 'Fold wings' : 'Deploy wings'}
              </button>
              <button onClick={() => setPanels((v) => !v)} aria-pressed={panels} className={`${btn} ${panels ? on : off}`}>
                {panels ? 'Open the panels' : 'Close the panels'}
              </button>
              <label className="flex flex-col gap-1 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 backdrop-blur">
                Exploded view
                <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} className="w-36 accent-violet-400" aria-label="Exploded view" />
              </label>
            </>
          )}
        </div>

        <div className="absolute top-3 right-3 z-10 flex w-64 flex-col items-end gap-3">
          <button
            type="button"
            onClick={() => setDesignStep('orbit')}
            className="tactical-btn-next"
          >
            Select Orbit →
          </button>
          <div className="w-full rounded-xl border border-white/10 bg-slate-950/75 p-3 backdrop-blur">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300">Does it fly?</div>
            <ul className="mt-2 space-y-2.5">
              {view.rows.map((r) => (
                <CheckRow key={r.key} row={r} />
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-snug" style={{ color: TONE_COLOR[view.status.tone] }}>
              {view.status.lines}
            </p>
            <p className="mt-2 border-t border-white/10 pt-2 text-[10px] leading-snug text-slate-500">
              Chosen elsewhere: {instruments.join(' and ')} (Research Lab), {radio} (Communications Center).
            </p>
          </div>
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
