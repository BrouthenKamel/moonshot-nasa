import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { setDragPointer, useDragStore, registerSlot, type DragPayload, type DropSlotSpec } from './dragStore'

/** Pixels the pointer must travel before a press becomes a drag (a shorter press stays a click) */
const THRESHOLD = { mouse: 5, pen: 6, touch: 10 } as const

let suppressNextClick = false
if (typeof window !== 'undefined') {
  // A drag that ends over its own card must not also pick it with the click that follows
  window.addEventListener(
    'click',
    (e) => {
      if (!suppressNextClick) return
      suppressNextClick = false
      e.stopPropagation()
      e.preventDefault()
    },
    true,
  )
}

/**
 * Follow one pointer from a press until it lets go. Pointer events, so mouse, touch and pen all
 * work. The pointer is never captured (touch's implicit capture is released) so whatever lies
 * under it, a DOM drop target or a 3D slot in a canvas, gets its own enter and leave events.
 * `immediate` starts the drag at once (3D parts on the bench have no click to keep).
 */
export function trackDrag(payload: DragPayload, e: { clientX: number; clientY: number; pointerId: number; pointerType: string; target: EventTarget | null }, immediate = false) {
  const el = e.target as Element | null
  if (el && 'hasPointerCapture' in el && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  const x0 = e.clientX
  const y0 = e.clientY
  const limit = THRESHOLD[e.pointerType as keyof typeof THRESHOLD] ?? 5
  let dragging = false
  let domSlotId: string | null = null
  const syncDomSlot = (x: number, y: number) => {
    if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return
    const hit = document.elementFromPoint(x, y)?.closest?.('[data-drop-slot]')
    const nextId = hit?.getAttribute('data-drop-slot') ?? null
    if (nextId === domSlotId) return
    if (domSlotId) useDragStore.getState().leave(domSlotId)
    domSlotId = nextId
    if (nextId) useDragStore.getState().enter(nextId)
  }
  const start = (x: number, y: number) => {
    dragging = true
    setDragPointer(x, y)
    useDragStore.getState().begin(payload)
    syncDomSlot(x, y)
  }
  if (immediate) start(x0, y0)
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return
    if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) > limit) start(ev.clientX, ev.clientY)
    if (dragging) {
      setDragPointer(ev.clientX, ev.clientY)
      syncDomSlot(ev.clientX, ev.clientY)
    }
  }
  const done = (commit: boolean) => (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', esc)
    if (!dragging) return
    if (!immediate) {
      suppressNextClick = true
      // clear the flag if no click follows (the pointer was released over another element)
      window.setTimeout(() => (suppressNextClick = false), 0)
    }
    if (commit) {
      syncDomSlot(ev.clientX, ev.clientY)
      useDragStore.getState().release()
    } else useDragStore.getState().cancel()
  }
  const up = done(true)
  const cancel = done(false)
  const esc = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !dragging) return
    dragging = false
    useDragStore.getState().cancel()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', esc)
}

/**
 * Make a DOM element (a tray card, a boarding pass, a coin) draggable. Spread the result onto the
 * element. A short press is still a click, so keyboard and click picking keep working.
 * `touch-action: pan-x` keeps a sideways swipe scrolling the tray while an upward drag lifts the part.
 */
export function useDragPart(payload: DragPayload | null, { disabled = false }: { disabled?: boolean } = {}) {
  const ref = useRef(payload)
  ref.current = payload
  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (disabled || !ref.current || e.button !== 0) return
      trackDrag(ref.current, e.nativeEvent)
    },
    [disabled],
  )
  return { onPointerDown, style: { touchAction: 'pan-x' as const }, 'data-draggable': payload ? 'true' : undefined }
}

/** A registered slot that always reads the latest props (the slot is registered once per id) */
export function liveSpec(id: string, ref: { current: DropSlotSpec }): DropSlotSpec {
  return {
    id,
    get accepts() {
      return ref.current.accepts
    },
    refuse: (p) => ref.current.refuse?.(p) ?? null,
    get onDrop() {
      return ref.current.onDrop
    },
    get preview() {
      return ref.current.preview
    },
  }
}

/** True while any part is held; with a field, only while a part of that field is held */
export function useHeld(field?: string) {
  return useDragStore((s) => (s.held ? (field ? s.held.field === field : true) : false))
}

/**
 * A DOM drop target (a departure row, a schedule strip, the reserve box). Spread `handlers` on the
 * element; `state` says whether a part is held, whether it would be taken and whether it is over.
 */
export function useDropTarget(spec: DropSlotSpec) {
  const specRef = useRef(spec)
  specRef.current = spec
  useEffect(() => registerSlot(liveSpec(spec.id, specRef)), [spec.id])
  const held = useDragStore((s) => s.held)
  const over = useDragStore((s) => (s.over?.slotId === spec.id ? s.over : null))
  const compatible = !!held && spec.accepts.includes(held.field as string)
  const enter = useDragStore((s) => s.enter)
  const leave = useDragStore((s) => s.leave)
  return {
    handlers: {
      onPointerEnter: () => enter(spec.id),
      onPointerLeave: () => leave(spec.id),
      'data-drop-slot': spec.id,
      'data-drop-state': over ? (over.ok ? 'over' : 'refuse') : compatible ? 'ready' : 'idle',
    },
    state: { held, compatible, over: !!over, ok: over?.ok ?? false, reason: over?.reason ?? null },
  }
}
