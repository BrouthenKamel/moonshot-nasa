import { useRef } from 'react'
import { instruments as catalogue } from '../../data/parts'
import { audio } from '../../assets/audio'
import { ChoiceCard } from '../../ui/kit/ChoiceCard'
import { LineItem, stepNumber } from '../../ui/kit'
import { instrumentLock } from './labLocks'
import { toggleUnlocked } from './labLocks'
import { useDropTarget } from '../../ui/interaction/drag'
import { useDragStore } from '../../ui/interaction/dragStore'
import { InstrumentCardFoot } from './InstrumentCardFoot'
import {
  EQUAL_HEIGHT_CARD,
  blockedThud,
  instrumentCardView,
  instrumentColor,
  instrumentShortName,
  playToggle,
  rowFocusKey,
} from './instrumentCards'

const MAX = 2
const N = stepNumber('instruments')

/**
 * The instrument bay docked under the stage: the four instruments as cards (their 3D portrait,
 * the shadow lesson as a tag; the numbers in Engineer view), and two slots for what is aboard.
 * Each card is a toggle (aria-pressed); arrow keys move along the row.
 * Sounds are the tray's own (ChoiceCard sounds off): hover tick, the instrument's pick sound,
 * a card flip when one comes off, and the "cannot fit" thunk on a locked card.
 */
export function InstrumentBar({
  chosen,
  day,
  onToggle,
}: {
  chosen: string[]
  day: number
  onToggle: (id: string) => void
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const aboard = chosen.map((id) => catalogue.find((i) => i.id === id)).filter((i) => i !== undefined)
  const refusal = useDragStore((s) => s.lastRefusal)
  const bayDrop = useDropTarget({
    id: 'lab:bay',
    accepts: ['instruments'],
    refuse: (p) => {
      const lock = instrumentLock(p.value, day)
      return lock.locked ? lock.text : null
    },
    onDrop: (p) => {
      if (!chosen.includes(p.value)) onToggle(p.value)
    },
  })

  return (
    <div data-instrument-bar className="@container border border-t-0 border-rule bg-ink-1 px-4 py-4">
      {/* Wide stage: the bay beside the cards. Narrower: the bay is a strip above them, so the four cards keep their width */}
      <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-stretch">
        {/* The bay: what is aboard, slot by slot */}
        <div className="flex shrink-0 flex-col gap-3 @2xl:flex-row @2xl:items-center @2xl:gap-6 @3xl:w-52 @3xl:flex-col @3xl:items-stretch @3xl:gap-4">
          <div className="@2xl:flex-1 @3xl:flex-none">
            <LineItem n={`${N}.1`} label="Payload bay" />
            <div className="mt-2 fp-display text-lg leading-tight text-paper">Pick up to two</div>
            <div className="mt-1 text-[11px] leading-snug text-paper-dim">A third pick swaps out the oldest.</div>
          </div>
          <div
            {...bayDrop.handlers}
            className={`grid gap-2 transition-colors @2xl:w-80 @2xl:grid-cols-2 @3xl:w-auto @3xl:grid-cols-1 ${
              bayDrop.state.over
                ? bayDrop.state.ok
                  ? 'outline outline-1 outline-kapton'
                  : 'outline outline-1 outline-nogo'
                : bayDrop.state.compatible
                  ? 'outline outline-1 outline-dashed outline-rule-strong'
                  : ''
            }`}
            role="group"
            aria-label={`Aboard: ${aboard.length} of ${MAX}`}
          >
            {Array.from({ length: MAX }, (_, slot) => {
              const inst = aboard[slot]
              const color = inst ? instrumentColor(inst.id) : undefined
              return (
                <div
                  key={slot}
                  className={`flex items-center gap-2 border px-2.5 py-1.5 text-xs ${
                    inst ? 'border-rule-strong bg-ink-2 text-paper' : 'border-dashed border-rule text-paper-faint'
                  }`}
                >
                  <span className="fp-data text-[10px] text-paper-faint">{slot + 1}</span>
                  <span aria-hidden className="h-2 w-2 shrink-0" style={{ background: color ?? 'var(--color-rule)' }} />
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
            const bounced = refusal?.field === 'instruments' && refusal?.value === inst.id ? 'bounce-back' : ''
            return (
              <div
                key={inst.id}
                className={`flex h-full w-full max-w-[160px] flex-col items-stretch gap-2 ${EQUAL_HEIGHT_CARD} ${bounced}`}
                {...blockedThud(view.blocked)}
              >
                <ChoiceCard
                  id={inst.id}
                  size="sm"
                  title={instrumentShortName(inst)}
                  subtitle={`Like ${inst.flownOn}`}
                  selected={on}
                  disabled={view.blocked}
                  reason={view.reason}
                  ariaLabel={view.ariaLabel}
                  sounds={false}
                  drag={
                    view.blocked
                      ? undefined
                      : {
                          field: 'instruments',
                          value: inst.id,
                          label: instrumentShortName(inst),
                          patch: { instruments: on ? chosen : toggleUnlocked(chosen, inst.id, day) },
                          sound: 'sfx.pick-instrument',
                        }
                  }
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
                <InstrumentCardFoot inst={inst} on={on} color={color} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
