import { useRef, type KeyboardEvent } from 'react'
import type { TrayGroup, TrayKey, TrayOption } from '../../../viz/spacecraft/trayOptions'

export interface ActiveOption {
  key: TrayKey
  id: string
}

interface PartsTrayProps {
  groups: TrayGroup[]
  selected: Record<TrayKey, string>
  onPick: (key: TrayKey, id: string) => void
  onActive: (active: ActiveOption | null) => void
}

/** The Factory's parts bins: five radio groups, usable by mouse, keyboard and screen reader. */
export function PartsTray({ groups, selected, onPick, onActive }: PartsTrayProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onKey = (group: TrayGroup, index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const n = group.options.length
    const next = group.options[(index + step + n) % n]
    onPick(group.key, next.id)
    refs.current[`${group.key}:${next.id}`]?.focus()
  }

  return (
    <div className="grid grid-cols-[1fr_1fr_0.9fr_0.9fr_1.7fr] gap-2" onMouseLeave={() => onActive(null)}>
      {groups.map((g) => (
        <div
          key={g.key}
          role="radiogroup"
          aria-label={g.title}
          className="rounded-xl border border-slate-700/60 bg-slate-950/85 p-2"
          style={{ ['--c' as string]: g.color }}
        >
          <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ color: g.color }}>
            {g.title}
          </h3>
          <div className={g.options.length > 3 ? 'grid grid-cols-2 gap-1.5' : 'flex flex-col gap-1.5'}>
            {g.options.map((o: TrayOption, i) => {
              const on = selected[g.key] === o.id
              return (
                <button
                  key={o.id}
                  ref={(el) => {
                    refs.current[`${g.key}:${o.id}`] = el
                  }}
                  role="radio"
                  aria-checked={on}
                  aria-label={`${o.short}: ${o.stats}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => onPick(g.key, o.id)}
                  onKeyDown={onKey(g, i)}
                  onMouseEnter={() => onActive({ key: g.key, id: o.id })}
                  onFocus={() => onActive({ key: g.key, id: o.id })}
                  className={`rounded-lg border px-2 py-1 text-left text-xs leading-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                    on
                      ? 'border-[var(--c)] bg-slate-900 text-white shadow-[inset_0_0_0_1px_var(--c)]'
                      : 'border-slate-700/70 bg-slate-900/70 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {o.short}
                  <span className="mt-0.5 block text-[10.5px] text-slate-500">{o.stats}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/** One strip above the tray: the description and the remaining facts of one option. */
export function FactStrip({ option, title }: { option: TrayOption | null; title?: string }) {
  return (
    <div className="min-h-[2.6rem] px-1 text-xs leading-snug text-slate-400" aria-live="polite">
      {option ? (
        <>
          <span className="font-semibold text-slate-200">
            {title ? `${title}: ` : ''}
            {option.short}.
          </span>{' '}
          {option.description}
          <span className="block text-slate-500">{option.facts}</span>
        </>
      ) : (
        <span>
          Pick parts from the bins below. Everything must fit the 6U box and the mass limit, propellant included, and
          the panels must make enough power.
        </span>
      )}
    </div>
  )
}
