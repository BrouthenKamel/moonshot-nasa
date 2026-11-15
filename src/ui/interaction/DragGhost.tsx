import { useEffect, useRef } from 'react'
import { dragPointer, useDragStore } from './dragStore'

/**
 * The DOM "ghost tag" that follows the pointer while a part is held: an inventory tag with the
 * part's name. Kapton when the slot under it would take the part, nogo with the reason when it
 * refuses, neutral elsewhere. `pointer-events: none` so the slots underneath still feel the pointer.
 * Mount once, at the root.
 */
export function DragGhost() {
  const held = useDragStore((s) => s.held)
  const over = useDragStore((s) => s.over)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!held) return
    const place = () => {
      if (ref.current) ref.current.style.transform = `translate(${dragPointer.x + 14}px, ${dragPointer.y + 10}px)`
    }
    place()
    dragPointer.listeners.add(place)
    document.documentElement.dataset.dragging = 'true'
    return () => {
      dragPointer.listeners.delete(place)
      delete document.documentElement.dataset.dragging
    }
  }, [held])

  if (!held) return null
  const tone = over ? (over.ok ? 'kapton' : 'nogo') : 'neutral'
  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none fixed top-0 left-0 z-[200] flex flex-col items-start gap-1" style={{ pointerEvents: 'none' }}>
      <span className="fp-tag bg-ink-1/95 shadow-[0_2px_0_rgba(0,0,0,0.4)]" data-tone={tone}>
        {held.label}
      </span>
      {over && !over.ok && over.reason && <span className="fp-data max-w-[16rem] border-l-2 border-nogo bg-ink-1/95 px-2 py-0.5 text-[10px] text-paper">{over.reason}</span>}
    </div>
  )
}

/** Screen-reader note while a part is held (the visual ghost is aria-hidden) */
export function DragAnnouncer() {
  const held = useDragStore((s) => s.held)
  const over = useDragStore((s) => s.over)
  const text = !held ? '' : over ? (over.ok ? `Release to fit ${held.label}` : `${held.label} cannot go here${over.reason ? `: ${over.reason}` : ''}`) : `Holding ${held.label}`
  return (
    <div aria-live="polite" className="sr-only">
      {text}
    </div>
  )
}
