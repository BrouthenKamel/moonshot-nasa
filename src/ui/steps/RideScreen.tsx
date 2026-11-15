import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'
import { useDragStore } from '../interaction/dragStore'
import { useDropTarget } from '../interaction/drag'
import { chooseRide, chooseTransfer } from '../../viz/ride/useRideView'
import { useDesignPreview } from '../useDesignPreview'
import { DesignDeltaLine, SynergyStrip } from '../../viz/DesignDeltaLine'
import { canUseWebGL } from '../../scene/webgl'
import { BoardingPass, RideOverlay, RideTimeline, RideVerdict } from './RideOverlay'
import { Eng, Sheet, StepHeader } from '../kit'
import { getPartById, type PropulsionPart } from '../../data/parts'
import { EngineNote, RideCardTray, TransferCardTray } from './launch/RideCards'
import { choiceBriefing } from './launch/briefing'
import { playPick } from './launch/radioKeys'
import { rideDock, transferDock } from './launch/skyLayout'

const LaunchPad = lazy(() => import('../../scene/launch/LaunchPad').then((m) => ({ default: m.LaunchPad })))

/** Falls back to the plain cards if the 3D launch pad throws. */
class PadBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
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

/** The delta-v budget in figures: Engineer view on the plain screen, read by screen readers over the 3D pad */
function BudgetSummary({ hidden }: { hidden: boolean }) {
  const { budgets, previewBudgets } = useDesignPreview()
  const active = previewBudgets ?? budgets
  const body = (
    <>
      <div className="fp-label text-kapton">Delta-v budget</div>
      <div className="mt-2.5 grid grid-cols-2 gap-4 fp-data text-xs text-paper-dim">
        <div>
          On board: <span className="font-bold text-paper">{active.deltaVAvailable.toFixed(0)} m/s</span>
          <span className="text-paper-faint"> ({active.propellantMass} kg propellant)</span>
        </div>
        <div>
          Capture + 12 months of upkeep:{' '}
          <span className={active.captureDeltaV !== null && active.deltaVMargin >= 0 ? 'font-bold text-go' : 'font-bold text-nogo'}>
            {active.captureDeltaV === null ? 'not possible' : `${active.deltaVTotal.toFixed(0)} m/s`}
          </span>
        </div>
        <div>
          Climbing out from the drop-off: <span className="font-bold text-paper">{active.deltaVTransfer.toFixed(0)} m/s</span>
        </div>
        <div>
          Arrival: <span className="font-bold text-paper">{active.arrivalTurn === null ? '-' : `month ${active.arrivalTurn}`}</span>
          {active.transferTurns !== null && active.transferTurns > 0 && (
            <span className="text-paper-faint"> ({active.transferTurns} months of running the team in transit)</span>
          )}
        </div>
      </div>
    </>
  )
  if (hidden) return <div className="sr-only">{body}</div>
  return (
    <Eng as="div" className="border border-rule bg-ink-2 p-4 text-sm">
      {body}
    </Eng>
  )
}

function Briefing({ id, className = '' }: { id: string; className?: string }) {
  const b = choiceBriefing(id)
  if (!b) return null
  return (
    <p className={`text-[11.5px] leading-snug text-paper-dim ${className}`}>
      <b className="font-semibold text-paper">{b.name}.</b> {b.text}
    </p>
  )
}

/** The plain screen: no 3D (tests, server rendering, no WebGL, or the pad failed) */
function PlainRide() {
  const design = useGameStore((s) => s.design)
  const setPreviewPatch = useUiStore((s) => s.setPreviewPatch)
  const [hover, setHover] = useState<string | null>(null)
  const propulsion = getPartById(design.propulsion) as PropulsionPart | undefined
  const propType = propulsion?.type ?? 'chemical'

  const onHoverRide = useCallback(
    (id: string | null) => {
      if (!id && useDragStore.getState().held) return
      setHover(id)
      setPreviewPatch(id ? { ride: id } : null)
    },
    [setPreviewPatch],
  )

  const onHoverTransfer = useCallback(
    (id: string | null) => {
      if (!id && useDragStore.getState().held) return
      setHover(id)
      setPreviewPatch(id ? { transfer: id } : null)
    },
    [setPreviewPatch],
  )

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <StepHeader step="ride" title="Ride & Transfer" kicker="Launch Site · Lunar Ice Mapper" />
      <Sheet className="p-4">
        <RideVerdict />
      </Sheet>
      <BoardingPass />
      <BudgetSummary hidden={false} />
      <SynergyStrip step="ride" />
      <DesignDeltaLine />
      <Sheet as="section" className="p-4">
        <h2 className="fp-label mb-3 text-paper">Departures</h2>
        <div
          className="pt-2 pl-2"
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onHoverRide(null)
          }}
        >
          <RideCardTray size="xs" onHover={onHoverRide} />
        </div>
        <Briefing id={hover && hover.startsWith('ride-') ? hover : design.ride} className="mt-3" />
      </Sheet>
      <Sheet as="section" className="p-4">
        <h2 className="fp-label mb-1 text-paper">Transfer to the Moon</h2>
        <p className="mb-4 text-sm text-paper-dim">
          Your engine limits your transfer options:{' '}
          <b className="font-semibold text-paper">{propulsion ? propulsion.name : 'none'}</b> ({propType === 'electric' ? 'ion' : propType}, chosen at
          the Factory).
        </p>
        <div
          className="max-w-xl"
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onHoverTransfer(null)
          }}
        >
          <TransferCardTray size="xs" onHover={onHoverTransfer} />
        </div>
        <Briefing id={hover && hover.startsWith('transfer-') ? hover : design.transfer} className="mt-3" />
      </Sheet>
    </div>
  )
}

/** Size of an element (its border box), followed as it changes */
function useSize(el: HTMLElement | null) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    if (!el) return
    const read = () => setSize({ w: el.offsetWidth, h: el.offsetHeight })
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return size
}

const DOCK = 'fp-sheet pointer-events-auto absolute p-2.5'
const DOCK_TITLE = 'fp-label mb-1.5 flex items-baseline justify-between gap-2 px-1 text-[0.68rem] text-kapton'

/** The title line at the top left is about 360 px wide: keep the transfer dock clear of it */
const TITLE_RIGHT = 380
function clearOfTitle<T extends { left: number; width: number }>(d: T): T {
  return d.left >= TITLE_RIGHT ? d : { ...d, left: TITLE_RIGHT, width: d.width - (TITLE_RIGHT - d.left) }
}

/** The ride and transfer cards laid over the pad, exactly where its board and signs are */
function PadDocks() {
  const design = useGameStore((s) => s.design)
  const setPreviewPatch = useUiStore((s) => s.setPreviewPatch)
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null)
  const size = useSize(wrap)
  const [hover, setHover] = useState<string | null>(null)
  const [transferEl, setTransferEl] = useState<HTMLElement | null>(null)
  const transferSize = useSize(transferEl)
  const ride = size && rideDock(size.w, size.h)
  const transfer = size && clearOfTitle(transferDock(size.w, size.h))
  // Short screens: the transfer dock would grow past the top edge, so it hangs from the top instead
  const transferPos =
    transfer && size && transferSize && size.h - transfer.bottom - transferSize.h < 8 ? { top: 8 } : { bottom: transfer ? transfer.bottom : 0 }
  // Each panel describes its own choice: the hovered one, else the picked one
  const rideBriefing = hover?.startsWith('ride-') ? hover : design.ride
  const transferBriefing = hover?.startsWith('transfer-') ? hover : design.transfer
  const roomy = !!size && size.h >= 760

  const handleRideHover = useCallback(
    (id: string | null) => {
      if (!id && useDragStore.getState().held) return
      setHover(id)
      setPreviewPatch(id ? { ride: id } : null)
    },
    [setPreviewPatch],
  )

  const handleTransferHover = useCallback(
    (id: string | null) => {
      if (!id && useDragStore.getState().held) return
      setHover(id)
      setPreviewPatch(id ? { transfer: id } : null)
    },
    [setPreviewPatch],
  )

  return (
    <div ref={setWrap} className="pointer-events-none absolute inset-0">
      <RideOverlay maxWidth={transfer ? Math.max(260, transfer.left - 32) : undefined} />
      {transfer && (
        <section
          ref={setTransferEl}
          className={DOCK}
          style={{ left: transfer.left, width: transfer.width, ...transferPos }}
          aria-labelledby="transfer-dock-title"
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) handleTransferHover(null)
          }}
        >
          <div className="flex gap-2">
            <div className="flex w-[88px] shrink-0 flex-col justify-between px-1 py-0.5">
              <h2 id="transfer-dock-title" className="fp-label text-[0.68rem] leading-snug text-kapton">
                Transfer to the Moon
              </h2>
              <EngineNote />
            </div>
            <div className="min-w-0 flex-1">
              <TransferCardTray size="xs" onHover={handleTransferHover} />
            </div>
          </div>
          {roomy && <Briefing id={transferBriefing} className="mt-2 line-clamp-2 px-1" />}
        </section>
      )}
      {ride && (
        <section
          className={DOCK}
          style={{ left: ride.left, width: ride.width, bottom: ride.bottom }}
          aria-labelledby="ride-dock-title"
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) handleRideHover(null)
          }}
        >
          <h2 id="ride-dock-title" className={DOCK_TITLE}>
            Departures <span className="text-paper-faint">Pick your ride</span>
          </h2>
          <div className="pt-2 pl-1.5">
            <RideCardTray size="xs" onHover={handleRideHover} />
          </div>
          {roomy && <Briefing id={rideBriefing} className="mt-2 line-clamp-3 px-0.5" />}
        </section>
      )}
    </div>
  )
}

function StepButtons({ overlay }: { overlay: boolean }) {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const back = (
    <button
      type="button"
      onClick={() => setDesignStep('orbit')}
      className="tactical-btn-back bg-ink-1"
    >
      ← Back
    </button>
  )
  const next = (
    <button
      type="button"
      onClick={() => setDesignStep('comms')}
      className="tactical-btn-next"
    >
      Setup Communications →
    </button>
  )
  if (overlay)
    return (
      <>
        <div className="absolute top-3 left-3">{back}</div>
        <div className="absolute top-3 right-3">{next}</div>
      </>
    )
  return (
    <div className="mx-auto mt-6 flex max-w-4xl justify-between">
      {back}
      {next}
    </div>
  )
}

export function RideScreen() {
  const setPreviewPatch = useUiStore((s) => s.setPreviewPatch)
  useEffect(() => () => setPreviewPatch(null), [setPreviewPatch])
  // The 3D launch pad starts only in a browser with WebGL; server rendering and tests take the plain path
  const [pad, setPad] = useState(canUseWebGL)
  const chartDrop = useDropTarget({
    id: 'ride:chart',
    accepts: ['transfer', 'ride'],
    onDrop: (p) => {
      playPick(p.value)
      if (p.field === 'transfer') chooseTransfer(p.value)
      else chooseRide(p.value)
    },
  })

  if (!pad)
    return (
      <div className="h-full overflow-auto p-4">
        <PlainRide />
        <StepButtons overlay={false} />
      </div>
    )

  return (
    <div className="relative h-full min-h-[480px] w-full overflow-hidden bg-ink-0">
      <div
        {...chartDrop.handlers}
        className={`absolute inset-0 transition-colors ${
          chartDrop.state.over ? 'outline outline-1 -outline-offset-2 outline-kapton' : ''
        }`}
      >
        <PadBoundary onError={() => setPad(false)}>
          <Suspense fallback={<div className="flex h-full items-center justify-center text-paper-faint">Opening the launch site…</div>}>
            <LaunchPad focus={null} />
          </Suspense>
        </PadBoundary>
      </div>
      <BudgetSummary hidden />
      <RideTimeline />
      <PadDocks />
      <StepButtons overlay />
    </div>
  )
}
