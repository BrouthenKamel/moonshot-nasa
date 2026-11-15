import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { detailsPanelId, detailsToggleId, setDetailsOpen, useDetailsOpen } from './detailsState'
import './details.css'

/**
 * The one "Details" control every screen uses (screen budget, Jakob 15 Nov): a screen shows its
 * decision, at most three numbers and one main action; everything else waits behind this toggle.
 *
 *   <Details id="plan">…</Details>                      toggle and panel together
 *   <DetailsToggle id="plan" /> … <DetailsPanel id="plan">…</DetailsPanel>
 *                                                        apart, when the toggle sits in a toolbar
 *   useDetailsOpen('plan')                               to follow the state elsewhere (a painted 3D wall)
 *
 * It is a disclosure (WAI-ARIA): a real <button> with aria-expanded and aria-controls. Opening
 * keeps focus on the toggle; Escape inside the panel closes it and puts focus back on the toggle,
 * and so does closing it any other way while focus is inside. A closed panel is inert: nothing in
 * it can be tabbed to or read out. The open/closed state is kept per id for the browser tab
 * (sessionStorage), so a screen opens the way the player left it.
 */


export function DetailsToggle({
  id,
  label = 'Details',
  openLabel = 'Hide details',
  className = '',
}: {
  id: string
  label?: ReactNode
  openLabel?: ReactNode
  className?: string
}) {
  const open = useDetailsOpen(id)
  return (
    <button
      type="button"
      id={detailsToggleId(id)}
      aria-expanded={open}
      aria-controls={detailsPanelId(id)}
      data-testid={`details-toggle-${id}`}
      onClick={() => setDetailsOpen(id, !open)}
      className={`fp-details-toggle ${className}`}
    >
      <svg aria-hidden="true" viewBox="0 0 10 10" className="fp-details-chevron" data-open={open}>
        <path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      <span>{open ? openLabel : label}</span>
    </button>
  )
}

export function DetailsPanel({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  const open = useDetailsOpen(id)
  const ref = useRef<HTMLDivElement>(null)

  // Closing with focus inside (Escape, the toggle elsewhere, a shortcut) hands focus back to the toggle
  useEffect(() => {
    if (open) return
    const panel = ref.current
    if (panel && typeof document !== 'undefined' && panel.contains(document.activeElement))
      document.getElementById(detailsToggleId(id))?.focus()
  }, [open, id])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !open) return
    e.stopPropagation()
    document.getElementById(detailsToggleId(id))?.focus()
    setDetailsOpen(id, false)
  }

  return (
    <div
      ref={ref}
      id={detailsPanelId(id)}
      role="region"
      aria-labelledby={detailsToggleId(id)}
      data-testid={`details-panel-${id}`}
      data-open={open}
      inert={!open}
      aria-hidden={open ? undefined : true}
      onKeyDown={onKeyDown}
      className={`fp-details-panel ${className}`}
    >
      <div className="fp-details-inner">{children}</div>
    </div>
  )
}

/** Toggle and panel together. `above` opens the panel above the toggle (for bars docked at the bottom). */
export function Details({
  id,
  label,
  openLabel,
  above = false,
  className = '',
  panelClassName = '',
  children,
}: {
  id: string
  label?: ReactNode
  openLabel?: ReactNode
  above?: boolean
  className?: string
  panelClassName?: string
  children: ReactNode
}) {
  return (
    <div className={`flex ${above ? 'flex-col-reverse' : 'flex-col'} items-start ${className}`}>
      <DetailsToggle id={id} label={label} openLabel={openLabel} />
      <DetailsPanel id={id} className={`w-full ${panelClassName}`}>
        {children}
      </DetailsPanel>
    </div>
  )
}
