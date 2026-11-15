import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../../scene/space/quality'
import { useInsideStore } from './insideStore'
import { DragAnnouncer, DragGhost } from './DragGhost'

/**
 * The letterbox for a look-inside shot: ink bars close the frame from 16:9 to 2.39:1, the HUD fades
 * (`html[data-inside]` hides `.hud-fade` and dims the shell), one caption sits on the lower bar.
 * Esc, a click on the bars or Skip ends it. Under reduced motion there is no camera move: the scene
 * shows a still shot and the caption waits for the player.
 */
function Letterbox() {
  const shot = useInsideStore((s) => s.shot)
  const caption = useInsideStore((s) => s.caption)
  const end = useInsideStore((s) => s.end)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!shot) {
      setShown(false)
      return
    }
    const raf = requestAnimationFrame(() => setShown(true))
    document.documentElement.dataset.inside = shot.id
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end(true)
    }
    window.addEventListener('keydown', onKey)
    // The scene usually ends the shot itself; the timer is the safety net (reduced motion waits for a click)
    const reduced = prefersReducedMotion()
    const t = reduced ? 0 : window.setTimeout(() => end(false), (shot.durationS + 1) * 1000)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(t)
      delete document.documentElement.dataset.inside
    }
  }, [shot, end])

  if (!shot) return null
  // 2.39:1 inside a 16:9-ish window: each bar takes about 12% of the height
  const bar = shown ? '12vh' : '0vh'
  return (
    <div className="fixed inset-0 z-[150]" role="dialog" aria-label={caption} aria-modal="false" style={{ pointerEvents: 'none' }}>
      <div className="absolute inset-x-0 top-0 bg-ink-0 transition-[height] duration-500 ease-out" style={{ height: bar, pointerEvents: 'auto' }} onClick={() => end(true)} />
      <div
        className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-ink-0 transition-[height] duration-500 ease-out"
        style={{ height: bar, pointerEvents: 'auto' }}
        onClick={() => end(true)}
      >
        <p aria-live="polite" className="fp-data max-w-2xl px-6 text-center text-sm tracking-wide text-paper">
          {caption}
        </p>
      </div>
      <button
        type="button"
        onClick={() => end(true)}
        className="fp-btn-ghost absolute right-4 bottom-3 text-[11px] text-paper-dim"
        style={{ pointerEvents: 'auto' }}
      >
        Skip ⏭ <span className="text-paper-faint">Esc</span>
      </button>
    </div>
  )
}

/** Mount once per screen root: the drag ghost, its screen-reader note and the look-inside letterbox */
export function InteractionLayer() {
  return (
    <>
      <DragGhost />
      <DragAnnouncer />
      <Letterbox />
    </>
  )
}
