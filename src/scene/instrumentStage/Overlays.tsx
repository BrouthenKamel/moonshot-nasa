import { lunarOrbits } from '../../data/orbits'
import { Eng, Tag } from '../../ui/kit'
import { COVERAGE_TARGET, activityText, passesText, type StageForecast, type InstrumentView, type WhatIf } from './stageModel'

/** A matte read-out sheet over the 3D stage: ink, hairline, no blur */
// Not .fp-sheet: its unlayered position:relative would beat the absolute placement over the stage
const panel = 'border border-rule bg-ink-1/90'
const TAU = Math.PI * 2

/** Coverage dial: the arc is ice (cyan) once the forecast meets the target, caution below it */
function Ring({ value, ok, whatIf }: { value: number; ok: boolean; whatIf: boolean }) {
  const r = 30
  const c = TAU * r
  const tone = ok ? 'var(--color-ice)' : 'var(--color-caution)'
  return (
    <svg viewBox="0 0 80 80" className="h-16 w-16 shrink-0" aria-hidden>
      {whatIf && <circle cx="40" cy="40" r="38" fill="none" stroke="var(--color-paper-faint)" strokeWidth="1" strokeDasharray="4 3" />}
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--color-rule)" strokeWidth="6" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke={tone}
        strokeWidth="6"
        strokeDasharray={`${(Math.min(100, value) / 100) * c} ${c}`}
        transform="rotate(-90 40 40)"
        style={{ transition: 'stroke-dasharray 500ms' }}
      />
      <line x1="40" y1="6" x2="40" y2="16" stroke="var(--color-paper)" strokeWidth="1.5" transform={`rotate(${(COVERAGE_TARGET / 100) * 360} 40 40)`} />
      <text x="40" y="45" textAnchor="middle" fontSize="15" fontWeight="600" fontFamily="var(--font-mono)" fill={tone}>
        {value.toFixed(0)}%
      </text>
    </svg>
  )
}

/** The building's title line, in the format every building uses. */
export function TitleLine() {
  return (
    <div className="flex items-center gap-2 border border-b-0 border-rule bg-ink-1 px-4 py-2">
      <span aria-hidden className="h-2 w-2 bg-[var(--role-accent)]" />
      <span className="fp-label text-[11px] text-paper-dim">RESEARCH LAB · LUNAR ICE MAPPER · INSTRUMENTS</span>
    </div>
  )
}

/** Story: the coverage dial and one verdict. Engineer: what the forecast is made of. */
export function ForecastPanel({ forecast }: { forecast: StageForecast }) {
  return (
    <div className={`pointer-events-none absolute left-3 top-3 max-w-sm p-2.5 pr-4 ${panel}`}>
      <div className="flex items-center gap-3">
        <Ring value={forecast.coverage} ok={forecast.meetsTarget} whatIf={forecast.isWhatIf} />
        <div className="text-xs text-paper-dim">
          <div className="fp-label text-[10px] text-paper-faint">Ice coverage forecast</div>
          <div className={`text-sm font-semibold ${forecast.meetsTarget ? 'text-ice' : 'text-caution'}`}>
            {forecast.meetsTarget ? 'Maps enough of the ice' : 'Not enough ice mapped'}
          </div>
          <Eng as="div" className="fp-data text-[11px]">
            <div>after 12 clean months · target {COVERAGE_TARGET}%</div>
            <div>
              sunlit ground {forecast.context.toFixed(0)}% · science data {forecast.dataMB.toFixed(0)} MB
            </div>
            <div>{passesText(forecast.passesPerTurn)}</div>
            {forecast.outreachMB > 0.5 && <div>pictures {forecast.outreachMB.toFixed(0)} MB</div>}
          </Eng>
          {forecast.isWhatIf && <div className="mt-0.5 font-medium text-kapton">What-if: not your design</div>}
        </div>
      </div>
      {forecast.reasons.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-rule pt-2 text-xs text-caution">
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
    <Tag tone={overShadow ? 'ice' : 'neutral'} className="bg-ink-1/90">
      {overShadow ? 'Over a crater that never sees the Sun' : 'Over sunlit ground'}
    </Tag>
  )
}

export function LabDials({ whatIf, onChange }: { whatIf: WhatIf; onChange: (change: Partial<WhatIf>) => void }) {
  const choice = (on: boolean) =>
    `border-b border-rule px-2 py-1 text-left last:border-b-0 ${on ? 'bg-kapton text-kapton-ink' : 'text-paper-dim hover:bg-ink-3 hover:text-paper'}`
  return (
    <div className={`absolute right-3 top-3 w-60 space-y-2.5 p-3 text-xs ${panel}`}>
      <div>
        <div className="fp-label text-[10px] text-paper">Lab simulator · what-if</div>
        <div className="mt-0.5 text-paper-faint">Try the other buildings' choices here. Your design stays as it is.</div>
      </div>
      <div>
        <div className="mb-1 text-paper-faint">Orbit · decided at the Launch Site</div>
        <div className="flex flex-col border border-rule">
          {lunarOrbits.map((o) => (
            <button key={o.id} type="button" aria-pressed={o.id === whatIf.orbit} onClick={() => onChange({ orbit: o.id })} className={choice(o.id === whatIf.orbit)}>
              {o.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-paper-faint">Pointing · built at the Factory</div>
        <div className="flex border border-rule">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={v === whatIf.precise}
              onClick={() => onChange({ precise: v })}
              className={`flex-1 border-r border-rule px-2 py-1 text-center last:border-r-0 ${v === whatIf.precise ? 'bg-kapton text-kapton-ink' : 'text-paper-dim hover:bg-ink-3 hover:text-paper'}`}
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
  if (v.countsAs === 'ice') return `maps ice: ${(v.iceRatePerTurn * 100).toFixed(1)}% of what is left, per month`
  if (v.countsAs === 'context') return 'maps sunlit ground only: adds no ice coverage'
  return 'pictures only: adds no ice coverage'
}

export function ReadOuts({ views, overShadow, isWhatIf }: { views: InstrumentView[]; overShadow: boolean; isWhatIf: boolean }) {
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 flex w-80 flex-col items-end gap-1.5">
      <PassChip overShadow={overShadow} />
      {isWhatIf && (
        <Tag tone="kapton" className="bg-ink-1/90">
          What-if view: not your design
        </Tag>
      )}
      {views.length === 0 && <div className={`w-full px-3 py-2 text-sm text-paper-dim ${panel}`}>The instrument bay is empty. Pick one or two below.</div>}
      {views.map((v) => {
        const text = activityText(v, overShadow)
        const tone = v.outOfRange || v.veryWeak ? 'text-nogo' : text.startsWith('Blind') ? 'text-paper-faint' : v.countsAs === 'ice' ? 'text-ice' : 'text-paper'
        return (
          <div key={v.id} className={`w-full px-3 py-2 text-xs ${panel}`}>
            <div className="flex items-center gap-2">
              <span aria-hidden className="h-2 w-2" style={{ background: v.color }} />
              <span className="font-semibold text-paper">{v.name}</span>
              <Eng
                className={`ml-auto fp-data ${v.strength >= 0.99 ? 'text-go' : v.strength >= 0.2 ? 'text-caution' : 'text-nogo'}`}
              >
                {Math.round(v.strength * 100)}% strength
              </Eng>
            </div>
            <div className={tone}>{text}</div>
            <Eng as="div" className="mt-0.5 text-paper-faint">
              {countsAsText(v)}
            </Eng>
            {v.problems.map((p) => (
              <div key={p} className="text-caution">
                {p}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
