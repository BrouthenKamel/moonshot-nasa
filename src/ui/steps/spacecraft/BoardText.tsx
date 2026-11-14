import type { BayView, Tone } from '../../../viz/spacecraft/bayView'

const TONE: Record<Tone, string> = { green: 'text-green-400', yellow: 'text-yellow-400', red: 'text-red-400' }
const DOT: Record<Tone, string> = { green: 'bg-green-500', yellow: 'bg-yellow-500', red: 'bg-red-500' }

/** The wall board as plain text: the step without WebGL, and in tests. */
export function BoardText({ view }: { view: BayView }) {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 pt-16 pb-4">
      <header className="hud-step-header">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--role-accent)]">
          FACTORY · LUNAR ICE MAPPER · SPACECRAFT
        </div>
        <h1 className="mt-1 font-display text-lg font-bold tracking-tight text-slate-100">{view.title}</h1>
      </header>
      <ul className="space-y-2">
        {view.rows.map((r) => (
          <li key={r.key} className="hud-panel p-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <span className={`inline-block h-2 w-2 rounded-full ${DOT[r.tone]}`} aria-hidden />
                {r.title}
              </span>
              <span className={`font-mono text-sm font-bold tabular-nums ${TONE[r.tone]}`}>{r.text}</span>
            </div>
            {r.tone !== 'green' && <p className="mt-1 text-xs text-slate-400">{r.reason}</p>}
          </li>
        ))}
      </ul>
      <p className="font-mono text-xs tabular-nums text-slate-400">
        Parts ${view.partsCost.toFixed(1)}M. Inside the box, bottom to top:{' '}
        {view.stack.map((s) => `${s.name} (${s.volume} U${s.readOnly ? `, ${s.sub}` : ''})`).join(', ')}.
      </p>
      <p className={`hud-panel p-3 font-mono text-sm font-semibold tabular-nums ${TONE[view.status.tone]}`}>
        {view.status.lines}
      </p>
    </div>
  )
}
