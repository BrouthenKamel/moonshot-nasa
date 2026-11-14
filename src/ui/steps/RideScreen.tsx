import { Component, lazy, Suspense, useLayoutEffect, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { canUseWebGL } from '../../scene/webgl'
import { RideOverlay, RideTimeline } from './RideOverlay'
import { getPartById, type PropulsionPart } from '../../data/parts'
import { EngineNote, RideCardTray, TransferCardTray } from './launch/RideCards'
import { choiceBriefing } from './launch/briefing'
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

/** The delta-v budget in words: shown on the plain screen, read by screen readers over the 3D pad */
function BudgetSummary({ hidden }: { hidden: boolean }) {
  const getBudgets = useGameStore((s) => s.getBudgets)
  useGameStore((s) => s.design)
  const budgets = getBudgets()
  return (
    <div className={hidden ? 'sr-only' : 'rounded-xl border border-orange-400/20 bg-orange-950/60 p-4 text-sm'}>
      <div className="font-medium text-orange-300">Delta-v Budget</div>
      <div className="mt-2 grid grid-cols-2 gap-4 text-orange-200">
        <div>
          On board: <span className="text-orange-400">{budgets.deltaVAvailable.toFixed(0)} m/s</span>
          <span className="text-orange-200/60"> ({budgets.propellantMass} kg propellant)</span>
        </div>
        <div>
          Capture + 12 months of upkeep:{' '}
          <span className={budgets.captureDeltaV !== null && budgets.deltaVMargin >= 0 ? 'text-green-400' : 'text-red-400'}>
            {budgets.captureDeltaV === null ? 'not possible' : `${budgets.deltaVTotal.toFixed(0)} m/s`}
          </span>
        </div>
        <div>
          Climbing out from the drop-off: <span className="text-orange-400">{budgets.deltaVTransfer.toFixed(0)} m/s</span>
        </div>
        <div>
          Arrival:{' '}
          <span className="text-orange-400">{budgets.arrivalTurn === null ? '-' : `month ${budgets.arrivalTurn}`}</span>
          {budgets.transferTurns !== null && budgets.transferTurns > 0 && (
            <span className="text-orange-200/60"> ({budgets.transferTurns} months of running the team in transit)</span>
          )}
        </div>
      </div>
    </div>
  )
}

function Briefing({ id, className = '' }: { id: string; className?: string }) {
  const b = choiceBriefing(id)
  if (!b) return null
  return (
    <p className={`text-[11.5px] leading-snug text-slate-300 ${className}`}>
      <b className="font-semibold text-orange-300">{b.name}.</b> {b.text}
    </p>
  )
}

/** The plain screen: no 3D (tests, server rendering, no WebGL, or the pad failed) */
function PlainRide() {
  const design = useGameStore((s) => s.design)
  const [hover, setHover] = useState<string | null>(null)
  const propulsion = getPartById(design.propulsion) as PropulsionPart | undefined
  const propType = propulsion?.type ?? 'chemical'
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-xl bg-slate-900 p-6">
        <div className="text-xs font-semibold tracking-widest text-orange-500">LAUNCH SITE · LUNAR ICE MAPPER · RIDE &amp; TRANSFER</div>
        <h1 className="mt-1 text-xl font-bold text-orange-400">5. Ride & Transfer</h1>
        <p className="mt-2 text-slate-400">
          Choose your rideshare launch and transfer trajectory. The ride drops you off; you navigate the rest.
        </p>
      </div>
      <BudgetSummary hidden={false} />
      <section>
        <h2 className="mb-4 font-semibold text-slate-200">Rideshare Options</h2>
        <div className="pt-3 pl-2">
          <RideCardTray size="xs" onHover={setHover} />
        </div>
        <Briefing id={hover && hover.startsWith('ride-') ? hover : design.ride} className="mt-3" />
      </section>
      <section>
        <h2 className="mb-1 font-semibold text-slate-200">Transfer Trajectory</h2>
        <p className="mb-4 text-sm text-slate-400">
          Your engine limits your transfer options:{' '}
          <b className="font-semibold text-slate-200">{propulsion ? propulsion.name : 'none'}</b> ({propType === 'electric' ? 'ion' : propType}, chosen at
          the Factory).
        </p>
        <div className="max-w-xl">
          <TransferCardTray size="xs" onHover={setHover} />
        </div>
        <Briefing id={hover && hover.startsWith('transfer-') ? hover : design.transfer} className="mt-3" />
      </section>
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

const DOCK = 'pointer-events-auto absolute rounded-2xl border border-orange-400/20 bg-[#060a14]/92 p-2 shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-md'
const DOCK_TITLE = 'mb-1.5 flex items-baseline justify-between gap-2 px-1 text-[10.5px] font-bold tracking-[0.18em] text-orange-400'

/** The title line at the top left is about 360 px wide: keep the transfer dock clear of it */
const TITLE_RIGHT = 380
function clearOfTitle<T extends { left: number; width: number }>(d: T): T {
  return d.left >= TITLE_RIGHT ? d : { ...d, left: TITLE_RIGHT, width: d.width - (TITLE_RIGHT - d.left) }
}

/** The ride and transfer cards laid over the pad, exactly where its board and signs are */
function PadDocks() {
  const design = useGameStore((s) => s.design)
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
  return (
    <div ref={setWrap} className="pointer-events-none absolute inset-0">
      <RideOverlay maxWidth={transfer ? Math.max(260, transfer.left - 32) : undefined} />
      {transfer && (
        <section
          ref={setTransferEl}
          className={DOCK}
          style={{ left: transfer.left, width: transfer.width, ...transferPos }}
          aria-labelledby="transfer-dock-title"
        >
          <div className="flex gap-2">
            <div className="flex w-[88px] shrink-0 flex-col justify-between px-1 py-0.5">
              <h2 id="transfer-dock-title" className="text-[10.5px] leading-snug font-bold tracking-[0.16em] text-orange-400">
                TRANSFER TO THE MOON
              </h2>
              <EngineNote />
            </div>
            <div className="min-w-0 flex-1">
              <TransferCardTray size="xs" onHover={setHover} />
            </div>
          </div>
          {roomy && <Briefing id={transferBriefing} className="mt-2 line-clamp-2 px-1" />}
        </section>
      )}
      {ride && (
        <section className={DOCK} style={{ left: ride.left, width: ride.width, bottom: ride.bottom }} aria-labelledby="ride-dock-title">
          <h2 id="ride-dock-title" className={DOCK_TITLE}>
            DEPARTURES <span className="text-[10px] font-semibold tracking-wider text-slate-500">PICK YOUR RIDE</span>
          </h2>
          <div className="pt-2 pl-1.5">
            <RideCardTray size="xs" onHover={setHover} />
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
      onClick={() => setDesignStep('orbit')}
      className="rounded-lg bg-slate-700/90 px-6 py-2 font-medium text-slate-200 backdrop-blur hover:bg-slate-600"
    >
      ← Back
    </button>
  )
  const next = (
    <button
      onClick={() => setDesignStep('comms')}
      className="rounded-lg bg-orange-600 px-6 py-2 font-medium text-white shadow-lg shadow-orange-900/50 hover:bg-orange-500"
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
    <div className="mx-auto mt-6 flex max-w-3xl justify-between">
      {back}
      {next}
    </div>
  )
}

export function RideScreen() {
  // The 3D launch pad starts only in a browser with WebGL; server rendering and tests take the plain path
  const [pad, setPad] = useState(canUseWebGL)

  if (!pad)
    return (
      <div className="h-full overflow-auto p-4">
        <PlainRide />
        <StepButtons overlay={false} />
      </div>
    )

  return (
    <div className="relative h-full min-h-[480px] w-full overflow-hidden bg-[#03050a]">
      <PadBoundary onError={() => setPad(false)}>
        <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">Opening the launch site…</div>}>
          <LaunchPad focus={null} />
        </Suspense>
      </PadBoundary>
      <BudgetSummary hidden />
      <RideTimeline />
      <PadDocks />
      <StepButtons overlay />
    </div>
  )
}
