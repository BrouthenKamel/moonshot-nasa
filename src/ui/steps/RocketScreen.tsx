import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { canUseWebGL } from '../../scene/webgl'
import { BODY_RADIUS_M, getRocketPart, rocketSlots, type RocketPart, type RocketSlot } from '../../data/rocket'
import { layoutRocket, normalizeRocket, optionsFor, partStat, pick, rocketChecks, rocketStats } from '../../viz/rocket/rocketView'

const RocketBay = lazy(() => import('../../scene/rocket/RocketBay').then((m) => ({ default: m.RocketBay })))

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

const TONE: Record<'green' | 'yellow', string> = { green: '#22c55e', yellow: '#eab308' }

function RocketText({ rows }: { rows: Array<{ slot: string; label: string; stat: string }> }) {
  return (
    <div className="mx-auto max-w-2xl space-y-3 p-6 pt-16 text-slate-200">
      <header className="hud-step-header">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--role-accent)]">
          LAUNCH SITE · LUNAR ICE MAPPER · ROCKET
        </div>
        <h1 className="mt-1 font-display text-xl font-bold text-slate-50">Your rocket</h1>
      </header>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.slot} className="hud-panel flex items-baseline justify-between px-4 py-2.5">
            <span className="font-mono text-xs uppercase tracking-wider text-slate-400">{r.slot}</span>
            <span className="font-medium text-slate-100">{r.label}</span>
            <span className="font-mono text-xs tabular-nums text-slate-400">{r.stat}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function OptionButton({
  part,
  selected,
  blocked,
  color,
  onPick,
  onActive,
}: {
  part: RocketPart
  selected: boolean
  blocked: string | null
  color: string
  onPick: () => void
  onActive: (on: boolean) => void
}) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      aria-disabled={blocked !== null}
      title={blocked ?? part.what}
      onClick={() => {
        if (!blocked) onPick()
      }}
      onMouseEnter={() => onActive(true)}
      onFocus={() => onActive(true)}
      style={{ ['--c' as string]: color }}
      className={`min-w-0 rounded-lg border px-2 py-1.5 text-left text-xs leading-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
        selected
          ? 'border-[var(--c)] bg-slate-900 text-white shadow-[inset_0_0_0_1px_var(--c)]'
          : blocked
            ? 'cursor-not-allowed border-slate-800 bg-slate-900/40 text-slate-600'
            : 'border-slate-700/70 bg-slate-900/70 text-slate-300 hover:bg-slate-800'
      }`}
    >
      {part.label}
      <span className="mt-0.5 block truncate font-mono text-[10.5px] tabular-nums text-slate-400">
        {blocked ?? partStat(part)}
      </span>
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

  const barBtn =
    'hud-panel px-4 py-2 font-mono text-xs font-semibold text-slate-200 backdrop-blur transition-colors hover:border-white/30 hover:bg-slate-800/90'

  return (
    <div className="flex h-full min-h-[560px] w-full flex-col bg-[#05080f]">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {hall ? (
          <HallBoundary onError={() => setHall(false)}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">Opening the assembly hall…</div>}>
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
              />
            </Suspense>
          </HallBoundary>
        ) : (
          <div className="h-full overflow-auto">
            <RocketText rows={rows} />
          </div>
        )}

        <div className="pointer-events-none absolute top-3 left-1/2 hidden -translate-x-1/2 md:block">
          <div className="hud-panel px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--role-accent)]">
            LAUNCH SITE · LUNAR ICE MAPPER · ROCKET
          </div>
        </div>

        <div className="absolute top-3 left-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setDesignStep('instruments')}
            className="tactical-btn-back"
          >
            ← Back
          </button>
          {hall && (
            <>
              <button type="button" onClick={testFire} disabled={firing} className={`${barBtn} disabled:opacity-50`}>
                Test fire
              </button>
              <button
                type="button"
                onClick={() => setExploded((v) => !v)}
                aria-pressed={exploded}
                className={`${barBtn} ${exploded ? 'border-orange-400/60 text-orange-200' : ''}`}
              >
                Exploded view
              </button>
            </>
          )}
        </div>

        <div className="absolute top-3 right-3 flex w-64 flex-col items-end gap-3">
          <button
            type="button"
            onClick={() => setDesignStep('spacecraft')}
            className="tactical-btn-next"
          >
            Build the spacecraft →
          </button>
          <div className="hud-panel w-full p-3.5 backdrop-blur">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--role-accent)]">
              Your rocket
            </div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
              about {Math.round(stats.heightM)} m
              <span className="ml-1 text-xs font-normal text-slate-400">tall</span>
            </div>
            <div className="mt-1 font-mono text-xs tabular-nums text-slate-400">
              {stats.stages} stage{stats.stages === 1 ? '' : 's'} · {stats.engines} engine{stats.engines === 1 ? '' : 's'}
              {stats.boosters > 0 ? ` · ${stats.boosters} boosters` : ''}
            </div>
            <div className="mt-1 font-mono text-[10px] tabular-nums text-slate-500">
              Drawn to a Falcon 9 scale ({(BODY_RADIUS_M * 2).toFixed(1)} m wide)
            </div>
            <ul className="mt-3 space-y-2">
              {checks.map((c) => (
                <li key={c.id} className="flex gap-2 text-xs leading-snug text-slate-300">
                  <span className="mt-1 h-2 w-2 flex-none rounded-full" style={{ background: TONE[c.tone], boxShadow: `0 0 8px ${TONE[c.tone]}` }} />
                  <span>
                    <span className="font-semibold text-slate-100">{c.title}.</span> {c.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {note && (
          <div role="status" className="hud-panel pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border-yellow-300/40 bg-yellow-950/85 px-4 py-1.5 text-xs text-yellow-100 backdrop-blur">
            {note}
          </div>
        )}
      </div>

      <div className="space-y-1.5 border-t border-[var(--role-border)] bg-[#070a12] px-3 pt-2 pb-3">
        <div className="min-h-[2.6rem] px-1 text-xs leading-snug text-slate-400" aria-live="polite">
          {shownPart ? (
            <>
              <span className="font-semibold text-slate-200">
                {shownTitle}: {shownPart.label}.
              </span>{' '}
              {shownPart.what}
              {shownPart.example && <span className="block text-slate-500">{shownPart.example}</span>}
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
              className={`hud-panel p-2 transition-colors ${activeSlot === slot.id ? 'border-white/35' : ''}`}
            >
              <h3 className="mb-1.5 font-mono text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ color: slot.color }}>
                {slot.title}
              </h3>
              <div className="flex flex-col gap-1">
                {optionsFor(config, slot.id).map(({ part, selected, blocked }) => (
                  <OptionButton
                    key={part.id}
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
