import { useEffect, useRef, useState } from 'react'
import type { CheckResult } from '../../sim/types'
import { playCue } from '../../audio/gameSounds'
import { beatText, launchTimeline, type LaunchBeat } from './launchTimeline'

/**
 * The launch moment, shown over the Go / No-Go step after "Launch Mission":
 * the poll of every Go / No-Go system, the countdown and liftoff, then
 * `onDone` (the flight starts on the base). Plain DOM and CSS, no WebGL.
 * Skip or Escape ends it at once; with reduced motion it is a short, still version.
 */

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const KEYFRAMES = `
@keyframes ls-rise { 0% { transform: translateY(0) } 15% { transform: translateY(2px) } 100% { transform: translateY(-120vh) } }
@keyframes ls-flame { 0%, 100% { transform: scaleY(1); opacity: .95 } 50% { transform: scaleY(1.35); opacity: .75 } }
@keyframes ls-in { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
`

export function LaunchSequence({
  checks: checksAtOpen,
  onDone,
  reducedMotion,
  initialShown = 0,
}: {
  checks: Pick<CheckResult, 'resource' | 'status'>[]
  onDone: () => void
  /** Leave out to follow the player's system setting */
  reducedMotion?: boolean
  /** How many beats are already shown (tests and server rendering) */
  initialShown?: number
}) {
  // Fixed when the sequence opens, so a re-render of the step never restarts the timers
  const [{ checks, reduced, beats }] = useState(() => {
    const r = reducedMotion ?? prefersReducedMotion()
    return { checks: checksAtOpen, reduced: r, beats: launchTimeline(checksAtOpen, r) }
  })
  const [shown, setShown] = useState(initialShown)
  const finished = useRef(false)
  const skipRef = useRef<HTMLButtonElement>(null)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  const finish = () => {
    if (finished.current) return
    finished.current = true
    onDoneRef.current()
  }

  // One timer per beat, from the moment the sequence opens
  useEffect(() => {
    const timers = beats.map((b, i) =>
      setTimeout(() => {
        setShown((s) => Math.max(s, i + 1))
        if (b.kind === 'liftoff') playCue('launch')
        if (b.kind === 'done') finish()
      }, b.at)
    )
    return () => timers.forEach(clearTimeout)
  }, [beats])

  // Focus the Skip button, and let Escape skip
  useEffect(() => {
    skipRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        finish()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const visible = beats.slice(0, shown)
  const polls = visible.filter((b): b is Extract<LaunchBeat, { kind: 'poll' }> => b.kind === 'poll')
  const count = [...visible].reverse().find((b): b is Extract<LaunchBeat, { kind: 'count' }> => b.kind === 'count')
  const liftoff = visible.some((b) => b.kind === 'liftoff')
  const latest = [...visible].reverse().find((b) => b.kind !== 'done')
  const allPolled = polls.length === checks.length
  const motion = !reduced

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="launch-title"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#03050a] text-slate-100"
    >
      <style>{KEYFRAMES}</style>
      <div className="flex items-center justify-between border-b border-blue-900/60 px-4 py-3 sm:px-6">
        <h2 id="launch-title" className="font-mono text-xs tracking-widest text-blue-300 sm:text-sm">
          COMMS CENTER · LUNAR ICE MAPPER · LAUNCH
        </h2>
        <button
          ref={skipRef}
          type="button"
          onClick={finish}
          className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
        >
          Skip <span className="text-slate-400">(Esc)</span>
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:p-8">
        <section aria-label="Go / No-Go poll" className="min-h-0">
          <p className="font-mono text-xs tracking-widest text-slate-400">FLIGHT DIRECTOR: GO / NO-GO FOR LAUNCH?</p>
          <ul className="mt-3 space-y-1.5 font-mono text-sm">
            {checks.map((c) => {
              const answer = polls.find((p) => p.system === c.resource)
              return (
                <li
                  key={c.resource}
                  className="flex items-baseline justify-between gap-3 border-b border-slate-800/70 pb-1"
                  style={answer && motion ? { animation: 'ls-in 200ms ease-out' } : undefined}
                >
                  <span className="text-slate-300">{c.resource.toUpperCase()}</span>
                  <span
                    className={
                      !answer ? 'text-slate-600' : answer.word === 'GO' ? 'font-bold text-green-400' : 'font-bold text-yellow-300'
                    }
                  >
                    {answer ? answer.word.toUpperCase() : 'STANDING BY'}
                  </span>
                </li>
              )
            })}
          </ul>
          {allPolled && <p className="mt-3 font-mono text-sm text-green-300">All systems GO. We are go for launch.</p>}
        </section>

        <section aria-label="Countdown and liftoff" className="relative flex min-h-48 flex-col items-center justify-end">
          <div className="font-mono text-5xl font-bold tabular-nums text-orange-400 sm:text-7xl" aria-hidden="true">
            {liftoff ? 'LIFTOFF' : count ? `T-${count.n}` : reduced ? '' : 'T-10'}
          </div>
          {/* The rocket: plain shapes, rising at liftoff (standing still with reduced motion) */}
          <div
            aria-hidden="true"
            className="mt-6 flex flex-col items-center"
            style={liftoff && motion ? { animation: 'ls-rise 1.6s cubic-bezier(.5,0,.9,.4) forwards' } : undefined}
          >
            <div className="h-0 w-0 border-x-[14px] border-b-[26px] border-x-transparent border-b-slate-200" />
            <div className="flex h-24 w-7 flex-col items-center justify-start bg-slate-100 pt-3">
              <div className="h-3 w-3 rounded-full bg-blue-500" />
            </div>
            <div className="flex w-12 justify-between">
              <div className="h-4 w-2.5 bg-orange-500" />
              <div className="h-4 w-2.5 bg-orange-500" />
            </div>
            {liftoff && (
              <div
                className="h-10 w-5 origin-top rounded-b-full bg-gradient-to-b from-yellow-200 via-orange-400 to-transparent"
                style={motion ? { animation: 'ls-flame 120ms ease-in-out infinite' } : undefined}
              />
            )}
          </div>
          <div className="h-2 w-40 rounded bg-slate-700" />
        </section>
      </div>

      {/* What a screen reader hears: the latest readout */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {latest ? beatText(latest) : 'Launch sequence starting. Press Escape to skip.'}
      </p>
    </div>
  )
}
