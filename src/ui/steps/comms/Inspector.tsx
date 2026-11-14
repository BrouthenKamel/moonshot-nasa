export interface InspectorNote {
  text: string
  tone: 'bad' | 'warn' | 'info'
}

const NOTE_TONE = {
  bad: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  info: 'border-white/10 bg-white/5 text-slate-300',
} as const

/**
 * The read-out under a tray: the full story of the card the player is pointing at (or the
 * picked one): its description, what it would do for this mission, and why it is risky.
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
    <div
      className="mt-4 rounded-2xl border border-white/10 bg-[#070c1a] p-4"
      style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: accent }}>
            {kicker}
          </div>
          <div className="font-display text-lg font-bold text-white">{title}</div>
          <p className="mt-0.5 text-sm text-slate-400">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {figures.map((f) => (
            <div key={f.label} className="rounded-lg bg-white/5 px-2.5 py-1.5 text-right">
              <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">{f.label}</div>
              <div className={`text-sm font-semibold tabular-nums ${f.tone === 'good' ? 'text-emerald-300' : f.tone === 'bad' ? 'text-rose-300' : 'text-slate-100'}`}>
                {f.value}
              </div>
            </div>
          ))}
        </div>
      </div>
      {notes.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {notes.map((n) => (
            <li key={n.text} className={`rounded-lg border px-2.5 py-1 text-xs ${NOTE_TONE[n.tone]}`}>
              {n.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
