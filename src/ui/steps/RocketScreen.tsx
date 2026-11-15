import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { canUseWebGL } from '../../scene/webgl'
import { BODY_RADIUS_M, getRocketPart, rocketSlots, type RocketPart, type RocketSlot } from '../../data/rocket'
import { layoutRocket, normalizeRocket, optionsFor, partStat, pick, rocketChecks, rocketStats } from '../../viz/rocket/rocketView'
import { useDragPart } from '../interaction/drag'
import { useInsideStore } from '../interaction/insideStore'
import { preloadFairingRide } from '../../scene/launch/fairingAssets'
import { Btn, Eng, Sheet, StepHeader, Tag } from '../kit'
import { SceneTitle } from './launch/SceneTitle'

const RocketBay = lazy(() => import('../../scene/rocket/RocketBay').then((m) => ({ default: m.RocketBay })))
const FairingRide = lazy(() => import('../../scene/launch/FairingRide').then((m) => ({ default: m.FairingRide })))

/** Falls back to the plain list if the 3D hall throws. */
class HallBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
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

const TONE: Record<'green' | 'yellow', 'go' | 'caution'> = { green: 'go', yellow: 'caution' }

function RocketText({ rows }: { rows: Array<{ slot: string; label: string; stat: string }> }) {
  return (
    <div className="mx-auto max-w-2xl space-y-3 p-6 pt-16 text-paper">
      <StepHeader step="rocket" title="Rocket" kicker="Launch Site" />
      <Sheet className="space-y-2 p-4">
        <div className="fp-label text-kapton">Your rocket</div>
        {rows.map((r) => (
          <div key={r.slot} className="flex items-baseline justify-between gap-3 border-b border-rule pb-1.5">
            <span className="fp-label text-paper-faint">{r.slot}</span>
            <span className="font-medium text-paper">{r.label}</span>
            <span className="fp-data text-xs text-paper-dim">{r.stat}</span>
          </div>
        ))}
      </Sheet>
    </div>
  )
}

/** One option in a slot's segmented column: flat, a colour rule on the left when picked */
function OptionButton({
  slot,
  part,
  selected,
  blocked,
  color,
  onPick,
  onActive,
}: {
  slot: RocketSlot
  part: RocketPart
  selected: boolean
  blocked: string | null
  color: string
  onPick: () => void
  onActive: (on: boolean) => void
}) {
  const dragProps = useDragPart(
    blocked ? null : { field: 'rocket-part', value: `${slot}:${part.id}`, label: part.label, sound: 'sfx.snap' },
    { disabled: blocked !== null },
  )
  return (
    <button
      role="radio"
      data-rocket-part={`${slot}:${part.id}`}
      aria-checked={selected}
      aria-disabled={blocked !== null}
      title={blocked ?? part.what}
      onClick={() => {
        if (!blocked) onPick()
      }}
      onPointerDown={dragProps.onPointerDown}
      data-draggable={dragProps['data-draggable']}
      onMouseEnter={() => onActive(true)}
      onFocus={() => onActive(true)}
      style={{ ['--c' as string]: color, ...dragProps.style }}
      className={`relative min-w-0 border-b border-rule px-2 py-1.5 text-left text-xs leading-tight transition-colors last:border-b-0 focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kapton ${
        selected
          ? 'bg-ink-3 font-semibold text-paper before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--c)]'
          : blocked
            ? 'cursor-not-allowed text-paper-faint'
            : 'text-paper-dim hover:bg-ink-3 hover:text-paper'
      }`}
    >
      {part.label}
      <span className="mt-0.5 block truncate fp-data text-[10.5px] font-normal text-paper-faint">{blocked ?? partStat(part)}</span>
    </button>
  )
}

/**
 * Step 3: the Rocket. Pick the engines, stages, nose, fins and boosters of the launch rocket and
 * watch it assemble in the hall. It is the ride the spacecraft will be built for: the choices
 * show how a real rocket is put together, and do not change the mission numbers.
 */
export function RocketScreen() {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const config = useMemo(() => normalizeRocket(design.rocket).config, [design.rocket])
  const layout = useMemo(() => layoutRocket(config), [config])
  const stats = useMemo(() => rocketStats(config), [config])
  const checks = useMemo(() => rocketChecks(config), [config])

  const [hall, setHall] = useState(canUseWebGL)
  const [exploded, setExploded] = useState(false)
  const [firing, setFiring] = useState(false)
  const [hover, setHover] = useState<{ slot: RocketSlot; id: string } | null>(null)
  const [activeSlot, setActiveSlot] = useState<RocketSlot | null>(null)
  const [last, setLast] = useState<{ slot: RocketSlot; id: string } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])
  useEffect(() => {
    if (hall) preloadFairingRide()
  }, [hall])

  const boardFairing = () => {
    useInsideStore.getState().play({
      id: 'fairing-ride',
      caption: 'T-minus 5… inside the payload fairing beside your 6U deployer.',
      durationS: 11,
    })
  }

  const choose = (slot: RocketSlot, id: string) => {
    const r = pick(config, slot, id)
    updateDesign({ rocket: r.config })
    setLast({ slot, id })
    setActiveSlot(slot)
    setNote(r.notes[0] ?? null)
    if (r.notes[0]) timers.current.push(window.setTimeout(() => setNote(null), 6000))
  }

  const testFire = () => {
    setFiring(true)
    timers.current.push(window.setTimeout(() => setFiring(false), 3800))
  }

  const shown = hover ?? last
  const shownPart = shown ? getRocketPart(shown.slot, shown.id) : undefined
  const shownTitle = shown ? rocketSlots.find((s) => s.id === shown.slot)?.title : undefined
  const rows = layout.placed.map((p) => ({
    slot: rocketSlots.find((s) => s.id === p.slot)!.title,
    label: p.part.label,
    stat: partStat(p.part),
  }))

  return (
    <div className="flex h-full min-h-[560px] w-full flex-col bg-ink-0">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {hall ? (
          <HallBoundary onError={() => setHall(false)}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-paper-faint">Opening the assembly hall…</div>}>
              <RocketBay
                config={config}
                exploded={exploded}
                firing={firing}
                activeSlot={hover?.slot ?? activeSlot}
                onSlotHover={(slot) => setHover(slot ? { slot, id: config[slot] } : null)}
                onSlotClick={(slot) => {
                  setActiveSlot(slot)
                  setLast({ slot, id: config[slot] })
                }}
                onPartDrop={(slot, id) => choose(slot, id)}
              />
            </Suspense>
          </HallBoundary>
        ) : (
          <div className="h-full overflow-auto">
            <RocketText rows={rows} />
          </div>
        )}

        {hall && (
          <div className="pointer-events-none absolute top-3 left-1/2 hidden -translate-x-1/2 md:block">
            <SceneTitle step="rocket" title="Rocket" />
          </div>
        )}

        <div className="absolute top-3 left-3 flex flex-col items-start gap-2">
          <button type="button" onClick={() => setDesignStep('instruments')} className="tactical-btn-back bg-ink-1">
            ← Back
          </button>
          {hall && (
            <>
              <Btn variant="secondary" type="button" onClick={testFire} disabled={firing} className="bg-ink-1 disabled:opacity-50">
                Test fire
              </Btn>
              <Btn
                variant="secondary"
                type="button"
                onClick={() => setExploded((v) => !v)}
                aria-pressed={exploded}
                className={`bg-ink-1 ${exploded ? '!border-kapton !text-kapton' : ''}`}
              >
                Exploded view
              </Btn>
              <Btn variant="primary" type="button" onClick={boardFairing} data-testid="board-fairing">
                Board fairing
              </Btn>
            </>
          )}
        </div>

        {hall && (
          <HallBoundary onError={() => {}}>
            <Suspense fallback={null}>
              <FairingRide />
            </Suspense>
          </HallBoundary>
        )}

        <div className="absolute top-3 right-3 flex w-64 flex-col items-end gap-3">
          <button type="button" onClick={() => setDesignStep('spacecraft')} className="tactical-btn-next">
            Build the spacecraft →
          </button>
          <Sheet className="w-full p-3.5">
            <div className="fp-label border-b border-rule pb-1.5 text-kapton">Your rocket</div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="fp-data text-2xl font-semibold text-paper">about {Math.round(stats.heightM)} m</span>
              <span className="text-xs text-paper-dim">tall</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>
                {stats.stages} stage{stats.stages === 1 ? '' : 's'}
              </Tag>
              <Tag>
                {stats.engines} engine{stats.engines === 1 ? '' : 's'}
              </Tag>
              {stats.boosters > 0 && <Tag>{stats.boosters} boosters</Tag>}
            </div>
            <Eng as="div" className="mt-1.5 fp-data text-[10px] text-paper-faint">
              Drawn to a Falcon 9 scale ({(BODY_RADIUS_M * 2).toFixed(1)} m wide). Cosmetic stack only: rocket parts do not alter mission mass, delta-v, or cost.
            </Eng>
            <ul className="mt-3 space-y-2 border-t border-rule pt-2">
              {checks.map((c) => (
                <li key={c.id} className="text-xs leading-snug text-paper-dim">
                  <Tag tone={TONE[c.tone]}>{c.title}</Tag>
                  <span className="mt-1 block">{c.text}</span>
                </li>
              ))}
            </ul>
          </Sheet>
        </div>

        {note && (
          <div
            role="status"
            className="fp-sheet pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 border-l-2 !border-l-caution px-4 py-1.5 text-xs text-paper"
          >
            {note}
          </div>
        )}
      </div>

      <div className="space-y-1.5 border-t border-rule bg-ink-1 px-3 pt-2 pb-3">
        <div className="min-h-[2.6rem] px-1 text-xs leading-snug text-paper-dim" aria-live="polite">
          {shownPart ? (
            <>
              <span className="font-semibold text-paper">
                {shownTitle}: {shownPart.label}.
              </span>{' '}
              {shownPart.what}
              {shownPart.example && <span className="block text-paper-faint">{shownPart.example}</span>}
            </>
          ) : (
            <span>
              Build the rocket that will carry your spacecraft. Pick a part in each bin, click the rocket to find its bin, and use Test fire
              to light the engines. Nothing here changes the mission numbers: it shows how a real rocket goes together.
            </span>
          )}
        </div>
        <div className="grid grid-cols-[1.25fr_0.9fr_0.9fr_1.3fr_1fr_1.1fr] gap-2" onMouseLeave={() => setHover(null)}>
          {rocketSlots.map((slot) => (
            <div
              key={slot.id}
              role="radiogroup"
              aria-label={slot.title}
              className={`border bg-ink-2 transition-colors ${activeSlot === slot.id ? 'border-rule-strong' : 'border-rule'}`}
            >
              <h3 className="flex items-center gap-1.5 border-b border-rule px-2 py-1 fp-label text-[0.68rem] text-paper">
                <span aria-hidden className="h-2.5 w-[3px] shrink-0" style={{ background: slot.color }} />
                {slot.title}
              </h3>
              <div className="flex flex-col">
                {optionsFor(config, slot.id).map(({ part, selected, blocked }) => (
                  <OptionButton
                    key={part.id}
                    slot={slot.id}
                    part={part}
                    selected={selected}
                    blocked={blocked}
                    color={slot.color}
                    onPick={() => choose(slot.id, part.id)}
                    onActive={(on) => setHover(on ? { slot: slot.id, id: part.id } : null)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
