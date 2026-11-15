import { useState, type ReactNode } from 'react'
import { create } from 'zustand'

/**
 * The campaign screens' Details control: one toggle and one panel per screen id, closed by default.
 * Same API as the shared kit control in PR 70 (`DetailsToggle id` / `DetailsPanel id`, src/ui/kit/Details.tsx);
 * once that lands, these two imports switch to the kit and this file goes.
 */
const useOpen = create<{ open: Record<string, boolean>; set: (id: string, v: boolean) => void }>((set) => ({
  open: {},
  set: (id, v) => set((s) => ({ open: { ...s.open, [id]: v } })),
}))

export function DetailsToggle({ id, className = '' }: { id: string; className?: string }) {
  const open = useOpen((s) => !!s.open[id])
  const set = useOpen((s) => s.set)
  return (
    <button
      type="button"
      id={`details-toggle-${id}`}
      aria-expanded={open}
      aria-controls={`details-panel-${id}`}
      onClick={() => set(id, !open)}
      className={`fp-label inline-flex items-center gap-1.5 border border-rule-strong bg-ink-1 px-2.5 py-1 text-[0.68rem] text-paper-dim hover:text-paper ${className}`}
    >
      <span aria-hidden="true" className={`text-kapton transition-transform ${open ? 'rotate-90' : ''}`}>
        ›
      </span>
      {open ? 'Hide details' : 'Details'}
    </button>
  )
}

export function DetailsPanel({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  const open = useOpen((s) => !!s.open[id])
  const set = useOpen((s) => s.set)
  const [, force] = useState(0)
  if (!open) return null
  return (
    <div
      id={`details-panel-${id}`}
      role="region"
      aria-labelledby={`details-toggle-${id}`}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        set(id, false)
        force((n) => n + 1)
        document.getElementById(`details-toggle-${id}`)?.focus()
      }}
      className={className}
    >
      {children}
    </div>
  )
}
