import type { ReactNode } from 'react'

/** A numbered flight-plan line item: "2.1  PAYLOAD ............ aside" */
export function LineItem({ n, label, aside, className = '' }: { n?: string; label: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-baseline gap-2 border-b border-rule pb-1 ${className}`}>
      {n && <span className="fp-data text-[11px] text-paper-faint">{n}</span>}
      <span className="fp-label text-paper">{label}</span>
      {aside != null && <span className="ml-auto fp-data text-xs text-paper-dim">{aside}</span>}
    </div>
  )
}
