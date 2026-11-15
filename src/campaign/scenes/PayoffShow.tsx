import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { audio } from '../../assets'
import { Effects } from '../../scene/space/Effects'
import { prefersReducedMotion } from '../../scene/space/quality'
import { ShowClock, type ShowTime } from './payoffParts'
import { beatAt, payoffBeats, payoffCues, payoffDuration, restTime, type Beat } from './payoffTimeline'
import { IceMapScene } from './payoffIceMap'
import { LandingScene } from './payoffLanding'
import { BaseScene } from './payoffBase'
import { MarsScene } from './payoffMars'
import type { PayoffShowProps } from './types'
import { preloadPayoff } from './preloadPayoff'
import { useHideCaptions } from '../../ui/kit/Captions'

/**
 * After a mission's flight: a 10–16 s cinematic of what it achieved (or how it failed).
 * Full-screen overlay; plays once, then calls onDone. Skip or Escape ends it early.
 *
 * Dev only: `&payoffAt=7.5` freezes the show at that second (for screenshots).
 */
export function PayoffShow({ kind, outcome, onDone }: PayoffShowProps) {
  const end = payoffDuration(kind, outcome)
  const beats = useMemo(() => payoffBeats(kind, outcome), [kind, outcome])
  const cues = useMemo(() => payoffCues(kind, outcome), [kind, outcome])
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const frozenAt = useMemo(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return null
    const v = new URLSearchParams(window.location.search).get('payoffAt')
    return v === null ? null : Number(v)
  }, [])
  const hold = frozenAt ?? (reduced ? restTime(kind, outcome) : null)

  const time = useRef<number>(hold ?? 0) as ShowTime
  const [beat, setBeat] = useState<Beat | null>(() => beatAt(beats, time.current))
  const [canvasFailed, setCanvasFailed] = useState(false)
  // The scene is ready once everything it suspends on (textures, models) has loaded
  const [ready, setReady] = useState(false)
  useEffect(() => preloadPayoff(kind), [kind])
  // No stale voice-loop caption (e.g. "Radiation hit…") over the show; the flight's queued lines are dropped
  useHideCaptions()

  const finished = useRef(false)
  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    onDone()
  }, [onDone])

  // Caption, sounds and the end, all read from the same clock the 3D scene runs on
  useEffect(() => {
    let lastT = hold ?? -1
    const played = new Set<number>()
    const startWall = performance.now()
    const id = window.setInterval(() => {
      // Still loading: no captions, no sounds; give up after a while so the show can never hang
      if (!ready && !canvasFailed) {
        if (performance.now() - startWall > LOAD_TIMEOUT_MS) finish()
        return
      }
      if (hold === null && canvasFailed) time.current += 0.1
      const t = time.current
      setBeat(beatAt(beats, t))
      if (hold === null) {
        beats.forEach((b, i) => {
          if (b.sfx && b.at <= t && b.at > lastT && !played.has(i)) {
            played.add(i)
            safePlay(b.sfx)
          }
        })
        cues.forEach((c, i) => {
          if (c.at <= t && c.at > lastT && !played.has(100 + i)) {
            played.add(100 + i)
            safePlay(c.sfx)
          }
        })
        lastT = t
        // Safety: end even if the scene never ran (no WebGL, tab throttled)
        if (t >= end || performance.now() - startWall > (end + 6) * 1000) finish()
      } else if (reduced && frozenAt === null && performance.now() - startWall > 5000) {
        finish()
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [beats, cues, end, finish, hold, reduced, frozenAt, canvasFailed, time, ready])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish])

  const preset = kind === 'mars-base' ? 'day' : 'space'

  return (
    <div className="fixed inset-0 z-50 bg-ink-0" role="dialog" aria-label="Mission result">
      <CanvasBoundary onFail={() => setCanvasFailed(true)}>
        <Canvas
          className="!absolute inset-0"
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          camera={{ fov: 40, near: 0.05, far: 2000, position: [0, 5, 20] }}
          aria-hidden
        >
          <ShowClock.Provider value={time}>
            <Ticker time={time} running={hold === null && ready} />
            <Suspense fallback={null}>
              {kind === 'ice-map' && <IceMapScene outcome={outcome} />}
              {kind === 'moon-landing' && <LandingScene outcome={outcome} />}
              {kind === 'moon-base' && <BaseScene outcome={outcome} />}
              {kind === 'mars-base' && <MarsScene outcome={outcome} />}
              <Effects preset={preset} />
              <Ready onReady={setReady} />
            </Suspense>
          </ShowClock.Provider>
        </Canvas>
      </CanvasBoundary>

      <button type="button" className="fp-btn-ghost absolute right-5 top-5 z-10" onClick={finish}>
        Skip ▸
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-ink-0/90 via-ink-0/50 to-transparent px-8 pb-10 pt-24 text-center">
        {!ready && !canvasFailed && (
          <p className="fp-label animate-pulse text-paper-faint" aria-live="polite">
            Receiving pictures…
          </p>
        )}
        {(ready || canvasFailed) && beat && (
          <div key={beat.at} className="mx-auto max-w-3xl animate-[payoff-in_600ms_ease-out]" aria-live="polite">
            <p className="fp-label text-kapton">{beat.kicker}</p>
            <p className="mt-2 text-xl text-paper md:text-2xl">{beat.text}</p>
          </div>
        )}
      </div>
      <style>{'@keyframes payoff-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}'}</style>
    </div>
  )
}

/** Longest wait for the scene's textures before the show gives up and ends */
const LOAD_TIMEOUT_MS = 20_000

function safePlay(id: Parameters<typeof audio.play>[0]) {
  try {
    audio.play(id)
  } catch {
    // sound is optional
  }
}

/** Mounts only once everything in its Suspense boundary has loaded */
function Ready({ onReady }: { onReady: (ready: boolean) => void }) {
  useEffect(() => onReady(true), [onReady])
  return null
}

/** Advances the show clock with the frame (so the scene and captions share one clock) */
function Ticker({ time, running }: { time: ShowTime; running: boolean }) {
  useFrame((_, dt) => {
    if (running) time.current += Math.min(dt, 0.1)
  }, -1)
  return null
}

class CanvasBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onFail()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

