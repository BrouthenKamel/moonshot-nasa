import { useRef } from 'react'
import { instruments as catalogue } from '../../data/parts'
import { audio } from '../../assets/audio'
import { ChoiceCard } from '../../ui/kit/ChoiceCard'
import { instrumentLock } from './labLocks'
import { altitudeText, instrumentCardView, playToggle, instrumentColor, instrumentShortName, instrumentStats, rowFocusKey } from './instrumentCards'

const MAX = 2

/**
 * The instrument bay docked under the stage: the four instruments as cards (their 3D portrait,
 * key numbers and the shadow lesson), and two slots that fill with each instrument's beam colour.
 * Each card is a toggle (aria-pressed); arrow keys move along the row.
 * Sounds are the tray's own (ChoiceCard sounds off): hover tick, the instrument's pick sound,
 * a card flip when one comes off, and the "cannot fit" thunk on a locked card.
 */
export function InstrumentBar({ chosen, day, onToggle }: { chosen: string[]; day: number; onToggle: (id: string) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const aboard = chosen.map((id) => catalogue.find((i) => i.id === id)).filter((i) => i !== undefined)

  return (
    <div
      data-instrument-bar
      className="flex flex-col gap-4 rounded-b-xl border border-t-0 border-slate-800 bg-[radial-gradient(ellipse_at_top,#0b2a1a_0%,#03050a_70%)] px-4 py-4 lg:flex-row lg:items-stretch"
    >
      {/* The bay: what is aboard, slot by slot */}
      <div className="flex shrink-0 flex-col gap-4 lg:w-52">
        <div>
          <div className="font-mono text-[11px] font-semibold tracking-[0.2em] text-green-400">INSTRUMENT BAY</div>
          <div className="mt-1 font-display text-lg font-bold leading-tight text-white">Pick up to two</div>
          <div className="mt-1 text-[11px] leading-snug text-slate-400">A third pick swaps out the oldest. Only shadow-seeing instruments map the ice.</div>
        </div>
        <div className="space-y-2" role="group" aria-label={`Aboard: ${aboard.length} of ${MAX}`}>
          {Array.from({ length: MAX }, (_, slot) => {
            const inst = aboard[slot]
            const color = inst ? instrumentColor(inst.id) : undefined
            return (
              <div
                key={slot}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors duration-300 ${inst ? 'text-slate-100' : 'border-dashed border-slate-700 text-slate-500'}`}
                style={inst ? { borderColor: `${color}aa`, background: `${color}1f`, boxShadow: `0 0 14px ${color}44` } : undefined}
              >
                <span className="font-mono text-[10px] text-slate-500">{slot + 1}</span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color ?? '#1e293b', boxShadow: color ? `0 0 8px ${color}` : undefined }} />
                <span className="truncate font-semibold">{inst ? instrumentShortName(inst) : 'Empty slot'}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* The cards */}
      <div role="group" aria-label="Instruments: pick up to two" className="grid flex-1 grid-cols-2 justify-items-center gap-3 sm:grid-cols-4">
        {catalogue.map((inst, i) => {
          const on = chosen.includes(inst.id)
          const color = instrumentColor(inst.id)
          const lock = instrumentLock(inst.id, day)
          const view = instrumentCardView(inst, on, lock)
          return (
            <div
              key={inst.id}
              className="flex h-full w-full max-w-[160px] flex-col items-stretch gap-2"
              onClickCapture={() => {
                if (view.blocked) audio.play('sfx.fit-error')
              }}
            >
              <ChoiceCard
                id={inst.id}
                size="sm"
                title={instrumentShortName(inst)}
                subtitle={`Like ${inst.flownOn}`}
                tag={altitudeText(inst)}
                stats={instrumentStats(inst)}
                selected={on}
                disabled={view.blocked}
                reason={view.reason}
                ariaLabel={view.ariaLabel}
                sounds={false}
                buttonRef={(el) => {
                  refs.current[i] = el
                }}
                onHover={() => {
                  if (!view.blocked) audio.play('sfx.hover')
                }}
                onKeyDown={(e) => {
                  const next = rowFocusKey(e.key, i, catalogue.length)
                  if (next === null) return
                  e.preventDefault()
                  refs.current[next]?.focus()
                }}
                onPick={() => {
                  playToggle(inst.id, on)
                  onToggle(inst.id)
                }}
              />
              {/* Its beam colour, lit when aboard: the same colour as its beam and readout on the stage */}
              <div className="mt-auto flex items-center gap-1.5 px-1" aria-hidden>
                <span
                  className="h-1.5 flex-1 rounded-full transition-all duration-300"
                  style={{ background: on ? color : `${color}33`, boxShadow: on ? `0 0 10px ${color}` : 'none' }}
                />
                <span className={`text-[9px] uppercase tracking-wider ${on ? 'text-slate-200' : 'text-slate-500'}`}>beam</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
