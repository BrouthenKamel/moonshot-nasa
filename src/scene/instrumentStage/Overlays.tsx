import { lunarOrbits } from '../../data/orbits'
import { COVERAGE_TARGET, activityText, type StageForecast, type InstrumentView, type WhatIf } from './stageModel'

const panel = 'rounded-lg border border-slate-700/70 bg-slate-950/80 backdrop-blur'
const TAU = Math.PI * 2

function Ring({ value, ok, whatIf }: { value: number; ok: boolean; whatIf: boolean }) {
  const r = 30
  const c = TAU * r
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0" aria-hidden>
      {whatIf && <circle cx="40" cy="40" r="38" fill="none" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="4 3" />}
      <circle cx="40" cy="40" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke={ok ? '#22c55e' : '#f59e0b'}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(Math.min(100, value) / 100) * c} ${c}`}
        transform="rotate(-90 40 40)"
        style={{ transition: 'stroke-dasharray 500ms' }}
      />
      <line x1="40" y1="6" x2="40" y2="14" stroke="#fff" strokeWidth="2" transform={`rotate(${(COVERAGE_TARGET / 100) * 360} 40 40)`} />
      <text x="40" y="45" textAnchor="middle" fontSize="16" fontWeight="700" fill={ok ? '#4ade80' : '#fbbf24'}>
        {value.toFixed(0)}%
      </text>
    </svg>
  )
}

export function ForecastPanel({ forecast }: { forecast: StageForecast }) {
  return (
    <div className={`pointer-events-none absolute left-3 top-3 max-w-md p-2 pr-4 ${panel}`}>
      <div className="flex items-center gap-3">
        <Ring value={forecast.coverage} ok={forecast.meetsTarget} whatIf={forecast.isWhatIf} />
        <div className="text-xs text-slate-400">
          <div className="text-sm font-semibold text-slate-100">Ice coverage forecast</div>
          <div>after 12 clean turns · target {COVERAGE_TARGET}%</div>
          <div className="mt-1">
            sunlit ground {forecast.context.toFixed(0)}% · science data {forecast.dataMB.toFixed(0)} MB
          </div>
          <div>{Math.round(forecast.passesPerTurn)} passes over the pole per turn</div>
          {forecast.outreachMB > 0.5 && <div>pictures {forecast.outreachMB.toFixed(0)} MB</div>}
          {forecast.isWhatIf && <div className="font-medium text-blue-300">What-if: not your design</div>}
        </div>
      </div>
      {forecast.reasons.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-slate-800 pt-2 text-xs text-amber-300">
          {forecast.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PassChip({ overShadow }: { overShadow: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border px-4 py-1 text-xs font-medium backdrop-blur transition-colors duration-300 ${
        overShadow
          ? 'border-indigo-400/60 bg-indigo-950/80 text-indigo-200'
          : 'border-amber-300/50 bg-amber-950/70 text-amber-200'
      }`}
    >
      {overShadow ? 'Over a crater that never sees the Sun' : 'Over sunlit ground'}
    </div>
  )
}

export function LabDials({ whatIf, onChange }: { whatIf: WhatIf; onChange: (change: Partial<WhatIf>) => void }) {
  const choice = (on: boolean) =>
    on ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
  return (
    <div className={`absolute right-3 top-3 w-64 space-y-2 p-3 text-xs ${panel}`}>
      <div>
        <div className="font-semibold text-slate-200">Research Lab simulator</div>
        <div className="text-slate-500">Try the other buildings' choices here. Your design stays as it is.</div>
      </div>
      <div>
        <div className="mb-1 text-slate-500">Orbit · decided at the Launch Site</div>
        <div className="flex flex-col gap-1">
          {lunarOrbits.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange({ orbit: o.id })}
              className={`rounded px-2 py-1 text-left ${choice(o.id === whatIf.orbit)}`}
            >
              {o.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-slate-500">Pointing · built at the Factory</div>
        <div className="flex gap-1">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => onChange({ precise: v })}
              className={`flex-1 rounded px-2 py-1 ${choice(v === whatIf.precise)}`}
            >
              {v ? 'Precise' : 'Basic'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function countsAsText(v: InstrumentView): string {
  if (v.countsAs === 'ice') return `maps ice: ${(v.iceRatePerTurn * 100).toFixed(1)}% of what is left, per turn`
  if (v.countsAs === 'context') return 'maps sunlit ground only: adds no ice coverage'
  return 'pictures only: adds no ice coverage'
}

export function ReadOuts({ views, overShadow }: { views: InstrumentView[]; overShadow: boolean }) {
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 w-80 space-y-1.5">
      {views.length === 0 && (
        <div className={`px-3 py-2 text-sm text-slate-300 ${panel}`}>The instrument bay is empty. Pick one or two below.</div>
      )}
      {views.map((v) => {
        const text = activityText(v, overShadow)
        const tone = v.outOfRange || v.veryWeak ? 'text-red-300' : text.startsWith('Blind') ? 'text-indigo-300' : 'text-slate-200'
        return (
          <div key={v.id} className={`px-3 py-2 text-xs ${panel}`}>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: v.color }} />
              <span className="font-semibold text-slate-100">{v.name}</span>
              <span
                className={`ml-auto ${v.strength >= 0.99 ? 'text-green-400' : v.strength >= 0.2 ? 'text-amber-300' : 'text-red-400'}`}
              >
                {Math.round(v.strength * 100)}% strength
              </span>
            </div>
            <div className={tone}>{text}</div>
            <div className="mt-0.5 text-slate-400">{countsAsText(v)}</div>
            {v.problems.map((p) => (
              <div key={p} className="text-amber-300">
                {p}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
