import type { BayView, Tone } from '../../../viz/spacecraft/bayView'

const TONE: Record<Tone, string> = { green: 'text-green-400', yellow: 'text-yellow-400', red: 'text-red-400' }
const DOT: Record<Tone, string> = { green: 'bg-green-500', yellow: 'bg-yellow-500', red: 'bg-red-500' }

/** The wall board as plain text: the step without WebGL, and in tests. */
export function BoardText({ view }: { view: BayView }) {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 pt-16 pb-4">
      <h1 className="text-xs font-semibold tracking-[0.14em] text-purple-300">{view.title}</h1>
      <ul className="space-y-2">
        {view.rows.map((r) => (
          <li key={r.key} className="rounded-lg bg-slate-900 p-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <span className={`inline-block h-2 w-2 rounded-full ${DOT[r.tone]}`} aria-hidden />
                {r.title}
              </span>
              <span className={`text-sm font-bold ${TONE[r.tone]}`}>{r.text}</span>
            </div>
            {r.tone !== 'green' && <p className="mt-1 text-xs text-slate-400">{r.reason}</p>}
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">
        Parts ${view.partsCost.toFixed(1)}M. Inside the box, bottom to top:{' '}
        {view.stack.map((s) => `${s.name} (${s.volume} U${s.readOnly ? `, ${s.sub}` : ''})`).join(', ')}.
      </p>
      <p className={`rounded-lg bg-slate-900 p-3 text-sm font-semibold ${TONE[view.status.tone]}`}>{view.status.lines}</p>
    </div>
  )
}
