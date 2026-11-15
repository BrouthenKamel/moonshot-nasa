import { create } from 'zustand'
import type { Design } from '../../sim/types'
import type { AudioId } from '../../assets/manifest'
import { audio } from '../../assets/audio'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'

/**
 * Hands on Hardware: the shared drag-and-drop state. "Drag is a question; drop is the answer."
 * While a part is held over a compatible slot the design preview (`uiStore.previewPatch`) shows what
 * would happen, exactly as hover does on the cards; dropping commits it with `updateDesign`;
 * letting go anywhere else cancels it. Only catalogue ids ever travel in a payload.
 */

/** What is being carried: a catalogue choice for one design field */
export interface DragPayload {
  /** The design field (or a pseudo-field such as 'planning-block') the part belongs to */
  field: keyof Design | (string & {})
  /** The catalogue id (or a small token) chosen */
  value: string
  /** Name on the ghost tag that follows the pointer */
  label: string
  /** The design change a drop commits; defaults to `{ [field]: value }` */
  patch?: Partial<Design>
  /** Sound on a good drop; defaults to `sfx.snap` */
  sound?: AudioId
}

/** A place a part can go */
export interface DropSlotSpec {
  id: string
  /** Fields this slot takes */
  accepts: ReadonlyArray<string>
  /** Extra veto: return a reason string to refuse (e.g. "Does not fit: 0.5 U short"), or null to allow */
  refuse?: (p: DragPayload) => string | null
  /** Custom commit; default is `updateDesign(patch)` */
  onDrop?: (p: DragPayload) => void
  /** Hover shows the preview patch (default true) */
  preview?: boolean
}

export interface OverState {
  slotId: string
  ok: boolean
  reason: string | null
}

export interface DropEvent {
  slotId: string
  field: string
  value: string
  /** performance.now() of the drop */
  at: number
}

interface DragState {
  held: DragPayload | null
  over: OverState | null
  /** Last good drop: drives the snap juice (ease-in, camera nudge, dust puff, stamp) */
  lastDrop: DropEvent | null
  /** Last refused drop: drives the bounce-back */
  lastRefusal: { field: string; value: string; reason: string | null; at: number } | null
  begin: (p: DragPayload) => void
  enter: (slotId: string) => void
  leave: (slotId: string) => void
  release: () => void
  cancel: () => void
}

/** Slots are registered outside React state: they are looked up on drop, never rendered from */
const slots = new Map<string, DropSlotSpec>()
export function registerSlot(spec: DropSlotSpec): () => void {
  slots.set(spec.id, spec)
  return () => {
    if (slots.get(spec.id) === spec) slots.delete(spec.id)
  }
}
export function getSlot(id: string): DropSlotSpec | undefined {
  return slots.get(id)
}

/** Whether a slot takes a payload, and why not */
export function judge(spec: DropSlotSpec, p: DragPayload): { ok: boolean; reason: string | null } {
  if (!spec.accepts.includes(p.field as string)) return { ok: false, reason: null }
  const reason = spec.refuse?.(p) ?? null
  return { ok: reason === null, reason }
}

export function payloadPatch(p: DragPayload): Partial<Design> {
  return p.patch ?? ({ [p.field]: p.value } as Partial<Design>)
}

export const useDragStore = create<DragState>()((set, get) => ({
  held: null,
  over: null,
  lastDrop: null,
  lastRefusal: null,
  begin: (held) => {
    useUiStore.getState().setPreviewPatch(null)
    set({ held, over: null })
  },
  enter: (slotId) => {
    const { held } = get()
    const spec = slots.get(slotId)
    if (!held || !spec) return
    const { ok, reason } = judge(spec, held)
    set({ over: { slotId, ok, reason } })
    if (ok && spec.preview !== false) useUiStore.getState().setPreviewPatch(payloadPatch(held))
    else useUiStore.getState().setPreviewPatch(null)
  },
  leave: (slotId) => {
    if (get().over?.slotId !== slotId) return
    set({ over: null })
    useUiStore.getState().setPreviewPatch(null)
  },
  release: () => {
    const { held, over } = get()
    useUiStore.getState().setPreviewPatch(null)
    if (!held) return set({ over: null })
    const spec = over ? slots.get(over.slotId) : undefined
    if (spec && over?.ok) {
      if (spec.onDrop) spec.onDrop(held)
      else useGameStore.getState().updateDesign(payloadPatch(held))
      audio.play(held.sound ?? 'sfx.snap')
      set({ held: null, over: null, lastDrop: { slotId: spec.id, field: held.field as string, value: held.value, at: performance.now() } })
      return
    }
    if (spec && over && !over.ok) {
      // the wrong category or a part that does not fit: it bounces back with a thunk
      audio.play('sfx.fit-error')
      set({ held: null, over: null, lastRefusal: { field: held.field as string, value: held.value, reason: over.reason, at: performance.now() } })
      return
    }
    set({ held: null, over: null })
  },
  cancel: () => {
    useUiStore.getState().setPreviewPatch(null)
    set({ held: null, over: null })
  },
}))

/** Live pointer position while dragging: kept out of React state so the ghost moves without re-renders */
export const dragPointer = { x: 0, y: 0, listeners: new Set<() => void>() }
export function setDragPointer(x: number, y: number) {
  dragPointer.x = x
  dragPointer.y = y
  dragPointer.listeners.forEach((l) => l())
}
