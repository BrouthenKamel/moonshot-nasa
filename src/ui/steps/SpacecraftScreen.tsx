import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { canUseWebGL } from '../../scene/webgl'
import { getPartById, type PropulsionPart } from '../../data/parts'
import { createDefaultDesign } from '../../sim/budgets'
import { buildBayView, type BayView } from '../../viz/spacecraft/bayView'
import { buildCraft, type CraftSlot } from '../../viz/spacecraft/craftBuild'
import { useDesignPreview } from '../useDesignPreview'
import { audio } from '../../assets/audio'
import { DesignDeltaLine, SynergyStrip } from '../../viz/DesignDeltaLine'
import { trayGroups, type TrayKey } from '../../viz/spacecraft/trayOptions'
import { TONE_COLORS } from '../../viz/spacecraft/boardPainter'
import { Btn, Eng, STEP_NAMES, Sheet, nextLabel, stepTitle } from '../kit'
import { normalizeRocket, rocketExplainer, type ExplainerItem } from '../../viz/rocket/rocketView'
import type { RocketFocus } from '../../scene/rocket/RocketBay'
import { prefersReducedMotion } from '../../scene/space/quality'
import { interceptStepLeave } from '../interaction/stepLeave'
import type { DesignStep } from '../../sim/types'
import { hasSeenRocketLoad, markRocketLoadSeen } from './spacecraft/rocketLoadSeen'
import { PartsTray, FactStrip, type ActiveOption } from './spacecraft/PartsTray'
import { BoardText } from './spacecraft/BoardText'
import { FlySheet } from './spacecraft/FlySheet'
import { SceneTitle } from './launch/SceneTitle'

/** The Factory's parts on a new mission's craft, which "Reset to starter" puts back */
const STARTER: Record<TrayKey, string> = (() => {
  const d = createDefaultDesign()
  return { solar: d.solar, battery: d.battery, computer: d.computer, attitude: d.attitude, propulsion: d.propulsion }
})()

const SpacecraftStage = lazy(() => import('../../scene/spacecraft/SpacecraftStage').then((m) => ({ default: m.SpacecraftStage })))
const RocketBay = lazy(() => import('../../scene/rocket/RocketBay').then((m) => ({ default: m.RocketBay })))

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

/** The rocket explained, part by part: chips along the bottom, the picked one's words above them */
function RocketExplainer({ items, focus, onFocus, loading }: { items: ExplainerItem[]; focus: RocketFocus; onFocus: (f: RocketFocus) => void; loading: boolean }) {
  const shown = items.find((i) => i.id === focus)
  return (
    // the left gutter keeps the chips clear of the CAPCOM card in the bottom-left corner
    <div className="space-y-2 border-t border-rule bg-ink-1 px-3 pt-2 pb-3 md:pl-52" data-testid="rocket-explainer">
      <div className="min-h-[3.4rem] px-1 text-xs leading-snug text-paper-dim" aria-live="polite">
        {loading ? (
          <span>Your CubeSat, sealed in its deployer, is lifted up beside the rocket and lowered into the payload fairing at the top.</span>
        ) : shown ? (
          <>
            <span className="font-semibold text-paper">
              {shown.title}: {shown.label}.
            </span>{' '}
            {shown.what}
            {shown.example && <span className="block text-paper-faint">{shown.example}</span>}
          </>
        ) : (
          <span>
            This is the standard rocket your CubeSat rides to space. Pick a part, here or on the rocket, to see what it does. Nothing to choose:
            the launch provider flies it.
          </span>
        )}
      </div>
      <div role="group" aria-label="Parts of the rocket" className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <button
            key={i.id}
            type="button"
            disabled={loading}
            onClick={() => onFocus(i.id)}
            aria-pressed={focus === i.id}
            className={`fp-btn-ghost border border-rule px-2.5 py-1 text-xs disabled:opacity-40 ${focus === i.id ? '!border-kapton !bg-ink-3 !text-kapton' : ''}`}
          >
            {i.id === 'payload' ? i.label : i.title}
          </button>
        ))}
        <button
          type="button"
          disabled={loading}
          onClick={() => onFocus('whole')}
          aria-pressed={focus === 'whole'}
          className={`fp-btn-ghost border border-rule px-2.5 py-1 text-xs disabled:opacity-40 ${focus === 'whole' ? '!border-kapton !bg-ink-3 !text-kapton' : ''}`}
        >
          Whole rocket
        </button>
      </div>
    </div>
  )
}

/** The plain-text rocket explainer, when there is no WebGL */
function RocketText({ items }: { items: ExplainerItem[] }) {
  return (
    <div className="mx-auto max-w-2xl space-y-3 p-6 pt-16 text-paper">
      <Sheet className="space-y-2 p-4">
        <div className="fp-label text-kapton">Inside the rocket, top to bottom</div>
        {items.map((i) => (
          <div key={i.id} className="border-b border-rule pb-1.5 text-sm">
            <span className="font-semibold">
              {i.title}: {i.label}.
            </span>{' '}
            <span className="text-paper-dim">{i.what}</span>
          </div>
        ))}
      </Sheet>
    </div>
  )
}

/** Building the craft; the carry into the rocket; the craft inside the rocket, explained */
type Phase = 'build' | 'loading' | 'inside'

/**
 * The Craft step, in the Factory: the 6U craft hovers over a turntable, built from real hardware
 * models, with the launch rocket standing behind it as a scale model. The sheet on the right asks
 * the one question: does it fly? When it is done, the craft is carried into the rocket's fairing
 * and the rocket is explained part by part. The rocket is the standard one: nothing to choose.
 */
export function SpacecraftScreen() {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const { view, preview, budgets } = useBayView()
  const groups = useMemo(() => trayGroups(budgets), [budgets])
  const craft = useMemo(() => buildCraft(design), [design])
  const rocket = useMemo(() => normalizeRocket(design.rocket).config, [design.rocket])
  const explainer = useMemo(() => rocketExplainer(rocket), [rocket])
  const { previewBudgets } = useDesignPreview()
  const activeBudgets = previewBudgets ?? budgets
  const [room, setRoom] = useState(canUseWebGL)
  const [hover, setHover] = useState<ActiveOption | null>(null)
  const [last, setLast] = useState<ActiveOption | null>(null)
  const [hoverSlot, setHoverSlot] = useState<CraftSlot | null>(null)
  const [pickedSlot, setPickedSlot] = useState<CraftSlot | null>(null)
  const [phase, setPhase] = useState<Phase>('build')
  const [focus, setFocus] = useState<RocketFocus>('payload')
  const [seen, setSeen] = useState(hasSeenRocketLoad)
  /** Where the player is headed once the craft is in the rocket */
  const [exitTo, setExitTo] = useState<DesignStep>('orbit')

  /**
   * Leaving the Craft step loads the craft into the rocket on the way out, then shows the rocket
   * explained, before the next step opens. The first time it plays in full, whichever way the
   * player leaves. After that, "Next" plays a quicker carry that one click or Esc skips, and a tab
   * jump goes straight through, so moving between tabs never gets in the way.
   */
  const leave = (to: DesignStep, via: 'next' | 'tab'): boolean => {
    if (seen && via === 'tab') return false
    audio.play('sfx.select')
    setExitTo(to)
    setFocus('payload')
    // No 3D, or the player asked for less motion: straight to the craft inside the rocket
    setPhase(room && !prefersReducedMotion() ? 'loading' : 'inside')
    return true
  }
  const goOn = () => setDesignStep(exitTo)
  const loaded = () => {
    markRocketLoadSeen()
    setSeen(true)
    setPhase('inside')
  }

  // The dock's tabs ask this step before they move on (see stepLeave.ts); refs keep the latest state
  const leaveRef = useRef(leave)
  const phaseRef = useRef(phase)
  useEffect(() => {
    leaveRef.current = leave
    phaseRef.current = phase
  })
  useEffect(
    () =>
      interceptStepLeave((to) => {
        if (to === 'spacecraft' || to === 'rocket') return false
        // Already in the carry or the explainer: a tab goes straight there
        if (phaseRef.current !== 'build') return false
        return leaveRef.current(to, 'tab')
      }),
    [],
  )

  // Esc skips straight on: during a repeat carry, or from the explainer
  const goOnRef = useRef(goOn)
  useEffect(() => {
    goOnRef.current = goOn
  })
  useEffect(() => {
    if (phase === 'build' || (phase === 'loading' && !seen)) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') goOnRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, seen])

  const selected: Record<TrayKey, string> = {
    solar: design.solar,
    battery: design.battery,
    computer: design.computer,
    attitude: design.attitude,
    propulsion: design.propulsion,
  }
  // The starter craft: the Factory's five parts as a new mission has them (instruments, radio,
  // orbit and plan are chosen elsewhere and stay as they are)
  const atStarter = (Object.keys(STARTER) as TrayKey[]).every((k) => selected[k] === STARTER[k])
  const resetToStarter = () => {
    audio.play('sfx.snap')
    setLast(null)
    setPickedSlot(null)
    updateDesign(STARTER)
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

  if (phase !== 'build') {
    const loading = phase === 'loading'
    return (
      <div className="flex h-full min-h-[560px] w-full flex-col bg-ink-0" data-testid="craft-in-rocket">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {room ? (
            <BayBoundary onError={() => setRoom(false)}>
              <Suspense fallback={<div className="flex h-full items-center justify-center text-paper-faint">Opening the rocket hall…</div>}>
                <RocketBay
                  config={rocket}
                  activeSlot={focus === 'payload' || focus === 'whole' ? null : focus}
                  onSlotHover={() => {}}
                  onSlotClick={(slot) => !loading && setFocus(slot)}
                  payload={loading ? 'loading' : 'inside'}
                  speed={seen ? 2.5 : 1}
                  focus={focus}
                  onLoaded={loaded}
                />
              </Suspense>
            </BayBoundary>
          ) : (
            <div className="h-full overflow-auto">
              <RocketText items={explainer} />
            </div>
          )}

          <div className="pointer-events-none absolute top-3 left-1/2 z-10 hidden -translate-x-1/2 md:block">
            <SceneTitle step="spacecraft" title={`${STEP_NAMES.spacecraft}: into the rocket`} question="What carries the craft to space, and where does it ride?" />
          </div>

          <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-2">
            <button type="button" onClick={() => setPhase('build')} className="tactical-btn-back bg-ink-1">
              ← Back to the craft
            </button>
          </div>

          <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
            {loading ? (
              seen && (
                <Btn variant="secondary" type="button" onClick={goOn} className="bg-ink-1" data-testid="skip-load" title="Skip (Esc)">
                  Skip to {STEP_NAMES[exitTo]} ▸▸
                </Btn>
              )
            ) : (
              <button type="button" onClick={goOn} className="tactical-btn-next" data-testid="explainer-next">
                {`Next: ${STEP_NAMES[exitTo]} →`}
              </button>
            )}
          </div>
        </div>
        <RocketExplainer items={explainer} focus={focus} onFocus={setFocus} loading={loading} />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[560px] w-full flex-col bg-ink-0">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {room ? (
          <BayBoundary onError={() => setRoom(false)}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-paper-faint">Opening the assembly bay…</div>}>
              <SpacecraftStage
                craft={craft}
                explode={0}
                deployed
                panels={false}
                view="closeup"
                ringColor={TONE_COLORS[view.massTone]}
                activeSlot={glowSlot}
                massKg={activeBudgets.totalMass}
                massLimitKg={activeBudgets.massLimit}
                volumeMarginU={budgets.volumeMargin}
                powerMarginW={activeBudgets.powerMargin}
                powerGeneratedW={activeBudgets.powerGenerated}
                propellantMassKg={activeBudgets.propellantMass}
                sunLamp
                selected={selected}
                rocket={rocket}
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
            <SceneTitle step="spacecraft" title={stepTitle('spacecraft')} />
          </div>
        )}
        {room && (
          <div className="pointer-events-none absolute left-[3%] bottom-1.5 z-10 bg-ink-1/85 px-1.5 py-0.5 fp-data text-[10px] text-paper-dim" data-testid="model-rocket-caption">
            Your ride (scale model) · the craft goes in the top
          </div>
        )}

        <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-2">
          <button type="button" onClick={() => setDesignStep('instruments')} className="tactical-btn-back bg-ink-1">
            ← Back
          </button>
        </div>

        <div className="absolute top-3 right-3 z-10 flex w-64 flex-col items-end gap-3">
          <button type="button" onClick={() => leave('orbit', 'next')} className="tactical-btn-next" data-testid="craft-next">
            {nextLabel('spacecraft')}
          </button>
          {room && (
            <div className="w-full">
              <FlySheet view={view} preview={preview} onReset={atStarter ? undefined : resetToStarter} />
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
