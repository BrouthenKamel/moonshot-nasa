import { instruments as catalogue } from '../../data/parts'
import { INSTRUMENT_COLORS, INSTRUMENT_SHORT_NAMES } from './stageModel'

/** The four instruments as quick picks, docked under the stage. */
export function InstrumentBar({ chosen, onToggle }: { chosen: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2 rounded-b-xl border border-t-0 border-slate-800 bg-slate-950 p-2">
      {catalogue.map((inst) => {
        const on = chosen.includes(inst.id)
        const color = INSTRUMENT_COLORS[inst.id] ?? '#94a3b8'
        return (
          <button
            key={inst.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(inst.id)}
            className="rounded-lg border-2 px-3 py-2 text-left transition-all hover:-translate-y-0.5"
            style={{
              borderColor: on ? color : '#334155',
              background: on ? `${color}26` : '#0f172a',
              boxShadow: on ? `0 0 18px ${color}66` : 'none',
            }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              {INSTRUMENT_SHORT_NAMES[inst.id] ?? inst.name}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              {inst.mass} kg · {Math.abs(inst.power)} W · ${inst.cost}M
            </div>
            <div className={`text-[11px] ${inst.seesShadow ? 'text-green-400' : 'text-orange-300'}`}>
              {inst.seesShadow ? 'sees into shadow' : 'needs sunlight'}
            </div>
          </button>
        )
      })}
    </div>
  )
}
