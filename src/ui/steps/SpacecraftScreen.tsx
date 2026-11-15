import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { canUseWebGL } from '../../scene/webgl'
import { getPartById, type PropulsionPart } from '../../data/parts'
import { buildBayView, type BayView } from '../../viz/spacecraft/bayView'
import { buildCraft, type CraftSlot } from '../../viz/spacecraft/craftBuild'
import { useDesignPreview } from '../useDesignPreview'
import { useInsideStore } from '../interaction/insideStore'
import { audio } from '../../assets/audio'
import { DesignDeltaLine, SynergyStrip } from '../../viz/DesignDeltaLine'
import { trayGroups, type TrayKey } from '../../viz/spacecraft/trayOptions'
import { TONE_COLORS } from '../../viz/spacecraft/boardPainter'
import type { ViewPreset } from '../../scene/spacecraft/SpacecraftStage'
import { Eng, Sheet, Stamp } from '../kit'
import { PartsTray, FactStrip, type ActiveOption } from './spacecraft/PartsTray'
import { BoardText } from './spacecraft/BoardText'
import { FlySheet } from './spacecraft/FlySheet'
import { SceneTitle } from './launch/SceneTitle'

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

/** Live bay view, recomputed when the design or difficulty changes; plus the what-if view of a hovered part. */
function useBayView(): {
  view: BayView
  preview: BayView | null
  budgets: ReturnType<ReturnType<typeof useGameStore.getState>['getBudgets']>
} {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const getBudgets = useGameStore((s) => s.getBudgets)
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)
  const { previewBudgets, previewChecks, previewPatch } = useDesignPreview()
  const current = useMemo(() => {
    const budgets = getBudgets()
    return { view: buildBayView(design, budgets, getGoNoGo().checks), budgets }
    // getBudgets / getGoNoGo read design and difficulty from the store
  }, [design, difficulty, getBudgets, getGoNoGo])
  // The ghost needles: where the hovered part would put each margin
  const preview = useMemo(
    () => (previewPatch && previewBudgets && previewChecks ? buildBayView({ ...design, ...previewPatch }, previewBudgets, previewChecks.checks) : null),
    [design, previewBudgets, previewChecks, previewPatch],
  )
  return { ...current, preview }
}

const VIEWS: Array<{ id: ViewPreset; label: string }> = [
  { id: 'closeup', label: 'Close-up' },
  { id: 'overview', label: 'Whole craft' },
  { id: 'avionics', label: 'Avionics' },
  { id: 'propulsion', label: 'Engine' },
  { id: 'payload', label: 'Payload' },
]

/** Where the power goes: bus, instruments, radio and ion engine against what the panels make. The bar is the story; the numbers are Engineer view. */
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
    <div className="flex flex-wrap items-center gap-3 border border-rule bg-ink-2 px-3 py-1.5 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="fp-label text-[0.68rem]">Power split</span>
        <span className={`fp-data font-semibold ${deficit ? 'text-nogo' : 'text-paper'}`}>
          <span className="story-only">{deficit ? 'short' : 'enough'}</span>
          <Eng>
            {bus + inst}W load / {generated}W solar
          </Eng>
        </span>
      </div>
      <div className="relative h-3 min-w-[160px] flex-1 overflow-hidden border border-rule bg-ink-1">
        <div className="flex h-full">
          <div style={{ width: pct(bus) }} className="bg-paper-dim" title={`Bus: ${bus} W`} />
          <div style={{ width: pct(inst) }} className="bg-go" title={`Instruments: ${inst} W`} />
          <div style={{ width: pct(tx) }} className="bg-caution" title={`Radio TX extra: ${tx} W`} />
          {ionMin > 0 && <div style={{ width: pct(ionMin) }} className="border-l border-ink-1 bg-paper-faint" title={`Ion thrust minimum: ${ionMin} W`} />}
        </div>
        <div className="hud-bar-segments pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-kapton" style={{ left: pct(generated) }} title={`Solar generated: ${generated} W`} />
      </div>
      <div className="flex flex-wrap items-center gap-2.5 fp-data text-[10px] text-paper-dim">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-paper-dim" />
          Bus<Eng> {bus}W</Eng>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-go" />
          Inst<Eng> {inst}W</Eng>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-caution" />
          TX<Eng> +{tx}W</Eng>
        </span>
        {ionMin > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 bg-paper-faint" />
            Ion<Eng> ≥{ionMin}W</Eng>
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-0.5 bg-kapton" />
          Solar
        </span>
      </div>
    </div>
  )
}

/**
 * Step 4 in the Factory: the assembly bay. The 6U craft hovers over a turntable, built from real
 * hardware models, and every choice changes it; the sheet on the right asks the one question:
 * does it fly?
 */
export function SpacecraftScreen() {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const { view, preview, budgets } = useBayView()
  const groups = useMemo(() => trayGroups(budgets), [budgets])
  const craft = useMemo(() => buildCraft(design), [design])
  const { previewBudgets } = useDesignPreview()
  const activeBudgets = previewBudgets ?? budgets
  const [room, setRoom] = useState(canUseWebGL)
  const [hover, setHover] = useState<ActiveOption | null>(null)
  const [last, setLast] = useState<ActiveOption | null>(null)
  const [explode, setExplode] = useState(0)
  const [deployed, setDeployed] = useState(true)
  const [panels, setPanels] = useState(false)
  const [sunLamp, setSunLamp] = useState(true)
  const [integrated, setIntegrated] = useState(false)
  const [preset, setPreset] = useState<ViewPreset>('closeup')
  const [hoverSlot, setHoverSlot] = useState<CraftSlot | null>(null)
  const [pickedSlot, setPickedSlot] = useState<CraftSlot | null>(null)

  const togglePanels = () => {
    const closing = !panels
    setPanels(closing)
    if (closing) {
      setDeployed(false)
      setExplode(0)
      audio.play('sfx.snap')
      useInsideStore.getState().play({
        id: 'factory-integrate',
        caption: 'Panels closed, wings stowed — sliding into the 6U orbital deployer.',
        durationS: 5.5,
        onEnd: () => setIntegrated(true),
      })
    } else {
      setIntegrated(false)
    }
  }

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

  const ghost = (on: boolean) => `fp-btn-ghost justify-start ${on ? '!bg-ink-3 !text-kapton' : ''}`

  return (
    <div className="flex h-full min-h-[560px] w-full flex-col bg-ink-0">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {room ? (
          <BayBoundary onError={() => setRoom(false)}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-paper-faint">Opening the assembly bay…</div>}>
              <SpacecraftStage
                craft={craft}
                explode={explode}
                deployed={deployed}
                panels={panels}
                view={preset}
                ringColor={TONE_COLORS[view.massTone]}
                activeSlot={glowSlot}
                massKg={activeBudgets.totalMass}
                massLimitKg={activeBudgets.massLimit}
                volumeMarginU={budgets.volumeMargin}
                powerMarginW={activeBudgets.powerMargin}
                powerGeneratedW={activeBudgets.powerGenerated}
                propellantMassKg={activeBudgets.propellantMass}
                sunLamp={sunLamp}
                selected={selected}
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

        {room && (
          <div className="pointer-events-none absolute top-3 left-1/2 z-10 hidden -translate-x-1/2 md:block">
            <SceneTitle step="spacecraft" title="Spacecraft" />
          </div>
        )}

        <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-2">
          {room && (
            <Sheet tone="flat" className="flex w-40 flex-col bg-ink-1/90 p-1">
              <div role="group" aria-label="Camera" className="flex flex-col">
                <span className="fp-label px-2 pt-1 pb-0.5 text-[0.62rem] text-paper-faint">Camera</span>
                {VIEWS.map((v) => (
                  <button key={v.id} type="button" onClick={() => setPreset(v.id)} aria-pressed={preset === v.id} className={ghost(preset === v.id)}>
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex flex-col border-t border-rule pt-1">
                <button type="button" onClick={() => setDeployed((v) => !v)} aria-pressed={deployed} className={ghost(false)}>
                  {deployed ? 'Fold wings' : 'Deploy wings'}
                </button>
                <button type="button" onClick={togglePanels} aria-pressed={panels} className={ghost(panels)} data-testid="close-panels">
                  {panels ? 'Open the panels' : 'Close the panels'}
                </button>
                <button type="button" onClick={() => setSunLamp((v) => !v)} aria-pressed={sunLamp} className={ghost(sunLamp)} data-testid="sun-lamp">
                  Sun lamp: {sunLamp ? 'On' : 'Off'}
                </button>
                {integrated && (
                  <div className="px-2 py-1">
                    <Stamp verdict="go" size="sm" animate>
                      INTEGRATED
                    </Stamp>
                  </div>
                )}
                <label className="flex flex-col gap-1 px-2 py-1.5">
                  <span className="fp-label text-[0.62rem] text-paper-faint">Exploded view</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={explode}
                    onChange={(e) => setExplode(Number(e.target.value))}
                    className="tactical-range w-full"
                    aria-label="Exploded view"
                  />
                </label>
              </div>
            </Sheet>
          )}
        </div>

        <div className="absolute top-3 right-3 z-10 flex w-64 flex-col items-end gap-3">
          <button type="button" onClick={() => setDesignStep('orbit')} className="tactical-btn-next">
            Select Orbit →
          </button>
          {room && (
            <div className="w-full">
              <FlySheet view={view} preview={preview} />
              <Eng as="p" className="mt-1 border border-rule bg-ink-1 p-2 text-[10px] leading-snug text-paper-faint">
                Scale: {activeBudgets.totalMass.toFixed(1)} / {activeBudgets.massLimit.toFixed(1)} kg · Bus:{' '}
                {activeBudgets.powerGenerated}W solar vs {activeBudgets.powerConsumed}W load · Propellant:{' '}
                {activeBudgets.propellantMass.toFixed(1)} kg
                <span className="mt-1 block border-t border-rule pt-1">{view.status.lines}</span>
                <span className="mt-1 block border-t border-rule pt-1">
                  Chosen elsewhere: {instruments.join(' and ')} (Research Lab), {radio} (Communications Center).
                </span>
              </Eng>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1.5 border-t border-rule bg-ink-1 px-3 pt-2 pb-3">
        <PowerBudgetSplitBar />
        <SynergyStrip step="spacecraft" compact />
        <DesignDeltaLine />
        <FactStrip option={activeOption} title={activeGroup?.title} group={activeGroup?.key} expanded={hover !== null} />
        <PartsTray groups={groups} selected={selected} onPick={pick} onActive={setHover} />
      </div>
    </div>
  )
}
