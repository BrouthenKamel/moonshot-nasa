import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { audio } from '../../assets/audio'
import { sayRoom } from '../../assets/ihVoice'
import { modelConstants as C } from '../../data/brief'
import { partsForSlot, type RocketSlot } from '../../data/rocket'
import { computeBudgets } from '../../sim/budgets'
import { Flap } from '../../ui/kit'
import { useDragPart, useDropTarget, useHeld } from '../../ui/interaction/drag'
import { blockedReason, normalizeRocket, pick } from '../../viz/rocket/rocketView'
import type { MinigameProps } from '../contract'
import { HangarScene } from './Scene'
import { boardIsStuck, buildResult, buildRows, massFit, pickOutcome, transferNudge, type RideRow } from './logic'

const IDLE_HINT_MS = 20_000

type Lids = 'open' | 'jam' | 'closed'

/* ---------------- the departure board ---------------- */

function Ticket({ row, onPick }: { row: RideRow; onPick: (id: string) => void }) {
  const drag = useDragPart({ field: 'ride', value: row.ride.id, label: `Ticket: ${row.ride.name}`, sound: 'sfx.ih-part-click' })
  return (
    <button
      type="button"
      {...drag}
      onClick={() => onPick(row.ride.id)}
      data-testid={`ticket-${row.ride.id}`}
      aria-label={`Take the ${row.ride.name} ticket`}
      className="fp-data cursor-grab touch-none select-none border border-dashed border-kapton bg-kapton px-3 py-1 text-[11px] font-bold tracking-widest text-kapton-ink active:cursor-grabbing"
    >
      TICKET ⇥
    </button>
  )
}

function Board({ rows, flaps, onPick }: { rows: RideRow[]; flaps: Record<string, { text: string; tone: 'bad' }>; onPick: (id: string) => void }) {
  return (
    <div className="border border-rule-strong bg-ink-1/90 px-4 py-3 shadow-lg" data-testid="board" role="table" aria-label="Departures">
      <div className="fp-label mb-2 grid grid-cols-[4.5rem_1fr_5rem_6.5rem] gap-3 text-[10px] tracking-[0.25em] text-paper-faint">
        <span>MONTH</span>
        <span>DESTINATION</span>
        <span>PRICE</span>
        <span />
      </div>
      {rows.map((row) => {
        const flap = flaps[row.ride.id]
        return (
          <div key={row.ride.id} role="row" data-ride={row.ride.id} className="grid grid-cols-[4.5rem_1fr_5rem_6.5rem] items-center gap-3 border-t border-rule py-2 text-lg text-paper">
            <span className="fp-data text-kapton">
              <Flap value={`M${row.departure}`} />
            </span>
            <span className={`fp-data tracking-wide ${flap ? 'text-nogo' : ''}`} data-testid={`dest-${row.ride.id}`}>
              <Flap value={flap ? flap.text : row.destination.toUpperCase()} />
            </span>
            <span className="fp-data">
              <Flap value={`$${row.price}M`} />
            </span>
            <Ticket row={row} onPick={onPick} />
          </div>
        )
      })}
    </div>
  )
}

/** "Your CubeSat ready in month N": the build, test and integration months, with the rides' departures on top */
function Calendar({ rows, readyTurn, buildTurns, testTurns }: { rows: RideRow[]; readyTurn: number; buildTurns: number; testTurns: number }) {
  const months = Math.max(12, ...rows.map((r) => r.departure + 1))
  const kind = (m: number) => {
    if (m <= C.designTurns) return 'design'
    if (m <= C.designTurns + buildTurns) return 'build'
    if (m <= C.designTurns + buildTurns + testTurns) return 'test'
    if (m <= readyTurn) return 'integrate'
    return null
  }
  const tint: Record<string, string> = { design: '#5a5650', build: '#9a6b26', test: '#6faf7a', integrate: '#5ee6f0' }
  return (
    <div className="border border-rule-strong bg-ink-1/90 px-4 py-2 shadow-lg" data-testid="calendar">
      <div className="fp-label mb-1 flex items-baseline justify-between text-[10px] tracking-[0.25em] text-paper-faint">
        <span>YOUR CUBESAT IS READY IN MONTH</span>
        <span className="fp-data text-base text-go" data-testid="ready-month">
          <Flap value={readyTurn} />
        </span>
      </div>
      <div className="flex gap-[3px]">
        {Array.from({ length: months }, (_, i) => i + 1).map((m) => {
          const k = kind(m)
          const leaving = rows.filter((r) => r.departure === m)
          return (
            <div key={m} className="relative flex-1 text-center" data-month={m}>
              <div className="h-4 border border-rule" style={{ background: k ? tint[k] : 'transparent', opacity: k ? 0.9 : 1 }} title={k ?? ''} />
              <div className="fp-data mt-0.5 text-[10px] text-paper-faint">{m}</div>
              {leaving.length > 0 && <div className="fp-data absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] text-kapton">▼</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Everything dropped over the hangar floor counts as "onto the rocket" */
function Gate({ onPick }: { onPick: (id: string) => void }) {
  const { handlers, state } = useDropTarget({ id: 'rideshare-gate', accepts: ['ride'], preview: false, onDrop: (p) => onPick(p.value) })
  return (
    <div {...handlers} className="absolute inset-x-0 bottom-0 top-[44%] z-10" data-testid="gate">
      {state.held && (
        <div className={`pointer-events-none absolute inset-6 border-2 border-dashed ${state.over ? 'border-kapton bg-kapton/5' : 'border-kapton/40'}`}>
          <div className="fp-data absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-kapton">let go on the rocket to book the ride</div>
        </div>
      )}
    </div>
  )
}

/* ---------------- the room ---------------- */

export default function RideshareManifest({ design, difficulty, onComplete, onExit, replay }: MinigameProps) {
  const rows = useMemo(() => buildRows(design, difficulty), [design, difficulty])
  const base = useMemo(() => computeBudgets(design, difficulty), [design, difficulty])
  const initialRocket = useMemo(() => normalizeRocket(design.rocket).config, [design.rocket])

  const [phase, setPhase] = useState<'board' | 'load'>('board')
  const [rideId, setRideId] = useState<string | null>(null)
  const [rocket, setRocket] = useState(initialRocket)
  const [flaps, setFlaps] = useState<Record<string, { text: string; tone: 'bad' }>>({})
  const [caption, setCaption] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [lids, setLids] = useState<Lids>('open')
  const [shipped, setShipped] = useState(false)

  const startedAt = useRef(0)
  const rocketTouched = useRef(false)
  const timers = useRef<number[]>([])
  const done = useRef(false)
  const idle = useRef<number | null>(null)
  const fit = useMemo(() => (rideId ? massFit(design, difficulty, rideId) : null), [design, difficulty, rideId])
  const held = useHeld()

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  // intro, and the hint after 20 s without a touch
  useEffect(() => {
    startedAt.current = performance.now()
    sayRoom('launch-hangar', 'intro')
    const arm = () => {
      if (idle.current) window.clearTimeout(idle.current)
      idle.current = window.setTimeout(() => {
        if (!done.current) sayRoom('launch-hangar', 'hint')
        arm()
      }, IDLE_HINT_MS)
    }
    arm()
    window.addEventListener('pointerdown', arm)
    window.addEventListener('keydown', arm)
    const pending = timers.current
    return () => {
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
      if (idle.current) window.clearTimeout(idle.current)
      pending.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  const pickRide = useCallback(
    (id: string) => {
      if (phase !== 'board') return
      const out = pickOutcome(rows, id)
      if (out.kind !== 'ok') {
        audio.play('sfx.fit-error')
        setFlaps((f) => ({ ...f, [id]: { text: out.flap, tone: 'bad' } }))
        setCaption(out.line)
        later(() => setFlaps((f) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== id))), 2600)
        return
      }
      const row = rows.find((r) => r.ride.id === id)!
      const notes: string[] = []
      if (boardIsStuck(rows)) {
        const o = row.compatible ? null : row.incompatibleReason
        notes.push(row.missed ? `Nothing leaves after your CubeSat is ready, so ${row.ride.name} is the closest: you will wait. ` : '')
        if (o) notes.push(o)
      }
      const nudge = transferNudge(design, difficulty, id)
      if (nudge) notes.push(nudge)
      setCaption(notes.join(' ').trim() || null)
      audio.play('sfx.ih-door-whoosh')
      setRideId(id)
      setPhase('load')
    },
    [phase, rows, design, difficulty, later],
  )

  const onDropped = useCallback(() => {
    if (!rideId || !fit) return
    setLoaded(true)
    if (fit.status === 'over') {
      // the door tries, jams, and the craft comes back out: say why, do not just refuse
      later(() => {
        setLids('jam')
        audio.play('sfx.fit-error')
        setCaption(`Too heavy: ${fit.mass.toFixed(1)} kg, and this ride takes ${fit.limit} kg. The door will not close. Take another ticket, or go back and lighten the craft.`)
      }, 450)
      later(() => setLids('open'), 1100)
      later(() => setLoaded(false), 1700)
    } else {
      setCaption(null)
      later(() => setLids('closed'), 500)
    }
  }, [rideId, fit, later])

  const finish = useCallback(() => {
    if (done.current || !rideId) return
    done.current = true
    sayRoom('launch-hangar', 'success')
    const touched = rocketTouched.current
    onComplete(
      buildResult({
        design,
        difficulty,
        rideId,
        rocket: touched ? rocket : undefined,
        durationS: (performance.now() - startedAt.current) / 1000,
      }),
    )
  }, [rideId, design, difficulty, rocket, onComplete])

  const onClunk = useCallback(() => {
    audio.play('sfx.snap')
    audio.play('sfx.ih-part-click')
    later(() => setShipped(true), 700)
    later(finish, 2600)
  }, [later, finish])

  const swap = useCallback((slot: RocketSlot) => {
    setRocket((cur) => {
      const opts = partsForSlot(slot).filter((p) => !blockedReason(cur, p))
      const at = opts.findIndex((p) => p.id === cur[slot])
      const next = opts[(at + 1) % opts.length]
      if (!next || next.id === cur[slot]) return cur
      rocketTouched.current = true
      audio.play('sfx.ih-part-click')
      return pick(cur, slot, next.id).config
    })
  }, [])

  const back = () => {
    setPhase('board')
    setRideId(null)
    setLoaded(false)
    setLids('open')
    setCaption(null)
  }

  const skip = () => {
    done.current = true
    onComplete({ patch: {}, insights: [], durationS: Math.round((performance.now() - startedAt.current) / 1000) })
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-0 text-paper" data-testid="rideshare" data-phase={phase}>
      <div className="absolute inset-0">
        <HangarScene
          phase={phase}
          rocket={rocket}
          craft={design}
          loaded={loaded}
          lids={lids}
          shipped={shipped}
          fit={phase === 'load' ? fit : null}
          onDropped={onDropped}
          onClunk={onClunk}
          onSwap={swap}
        />
      </div>

      {phase === 'board' && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-36 z-20 flex justify-end px-8">
            <div className="pointer-events-auto flex w-[min(560px,56vw)] flex-col gap-2">
              <Board rows={rows} flaps={flaps} onPick={pickRide} />
              <Calendar rows={rows} readyTurn={base.readyTurn} buildTurns={base.buildTurns} testTurns={base.testTurns} />
            </div>
          </div>
          <Gate onPick={pickRide} />
        </>
      )}

      {caption && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-[44rem] items-center gap-4 border-l-2 border-kapton bg-ink-1/90 px-4 py-2 text-sm text-paper shadow" data-testid="caption" role="status">
            <span>{caption}</span>
            {phase === 'load' && (
              <button type="button" className="fp-btn-secondary shrink-0" onClick={back}>
                Change ticket
              </button>
            )}
          </div>
        </div>
      )}

      {phase === 'load' && !caption && !loaded && !held && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
          <div className="fp-data bg-ink-1/80 px-3 py-1 text-xs text-paper-dim">drag your CubeSat into the open bay</div>
        </div>
      )}

      <div className="absolute left-4 top-4 z-30 flex gap-3">
        {phase === 'load' ? (
          <button type="button" className="fp-label text-paper-dim hover:text-paper" onClick={back} data-testid="back-to-board">
            ← Board
          </button>
        ) : (
          <button type="button" className="fp-label text-paper-dim hover:text-paper" onClick={onExit} data-testid="leave">
            ← Campus
          </button>
        )}
        {replay && (
          <button type="button" className="fp-label text-kapton" onClick={skip} data-testid="skip">
            Skip
          </button>
        )}
      </div>
    </div>
  )
}
