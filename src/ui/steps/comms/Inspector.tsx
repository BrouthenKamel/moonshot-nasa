import { Eng } from '../../kit'

export interface InspectorNote {
  text: string
  tone: 'bad' | 'warn' | 'info'
}

const NOTE_TONE = {
  bad: 'border-nogo text-paper',
  warn: 'border-caution text-paper',
  info: 'border-rule-strong text-paper-dim',
} as const

/**
 * The read-out under a tray: the full story of the card the player is pointing at (or the
 * picked one): its description and why it is risky in plain words; the figures in Engineer view.
 */
export function Inspector({
  accent,
  kicker,
  title,
  description,
  figures,
  notes,
}: {
  accent: string
  kicker: string
  title: string
  description: string
  figures: { label: string; value: string; tone?: 'good' | 'bad' }[]
  notes: InspectorNote[]
}) {
  return (
    <div className="fp-sheet mt-4 p-4" data-tone="flat" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-2 w-2" style={{ background: accent }} />
            <span className="fp-label text-[10px] text-paper-faint">{kicker}</span>
          </div>
          <div className="mt-0.5 fp-display text-lg text-paper">{title}</div>
          <p className="mt-0.5 text-sm text-paper-dim">{description}</p>
        </div>
        <Eng as="div" className="flex flex-wrap divide-x divide-rule border border-rule">
          {figures.map((f) => (
            <div key={f.label} className="px-2.5 py-1.5 text-right">
              <div className="fp-label text-[9px] text-paper-faint">{f.label}</div>
              <div className={`fp-data text-sm font-medium ${f.tone === 'good' ? 'text-go' : f.tone === 'bad' ? 'text-nogo' : 'text-paper'}`}>{f.value}</div>
            </div>
          ))}
        </Eng>
      </div>
      {notes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {notes.map((n) => (
            <li key={n.text} className={`border-l-2 pl-2 text-xs ${NOTE_TONE[n.tone]}`}>
              {n.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
