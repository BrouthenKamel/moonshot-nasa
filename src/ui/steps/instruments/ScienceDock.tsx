import { useRef } from 'react'
import { instruments, type InstrumentPart } from '../../../data/parts'
import { audio } from '../../../assets/audio'
import { assetUrl } from '../../../assets/url'
import { choiceArt } from '../../../assets/catalogueArt'
import { instrumentLock } from '../../../scene/instrumentStage/labLocks'
import { MAX_INSTRUMENTS } from '../../../scene/instrumentStage/stageModel'
import {
  altitudeText,
  blockedThud,
  instrumentCardView,
  instrumentColor,
  instrumentShortName,
  lessonText,
  readsLabel,
  playToggle,
  rowFocusKey,
} from '../../../scene/instrumentStage/instrumentCards'

/*
 * The Science step's picks, laid over the foot of the 3D stage: the four instruments as small
 * tiles (the hovered one's details float in the top-left corner, InstrumentSpec). A click puts an instrument
 * aboard or takes it off; hover (or focus) previews it on the stage.
 */

function Tile({
  inst,
  on,
  day,
  index,
  setRef,
  focusAt,
  onToggle,
  onHover,
}: {
  inst: InstrumentPart
  on: boolean
  day: number
  index: number
  setRef: (index: number, el: HTMLButtonElement | null) => void
  focusAt: (index: number) => void
  onToggle: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const view = instrumentCardView(inst, on, instrumentLock(inst.id, day))
  const portrait = choiceArt(inst.id)?.portrait
  const color = instrumentColor(inst.id)
  return (
    <div {...blockedThud(view.blocked)}>
      <button
        ref={(el) => setRef(index, el)}
        type="button"
        aria-pressed={on}
        aria-label={view.ariaLabel}
        disabled={view.blocked}
        title={view.reason ?? undefined}
        data-choice-id={inst.id}
        onPointerEnter={() => {
          if (!view.blocked) audio.play('sfx.hover')
          onHover(inst.id)
        }}
        onFocus={() => onHover(inst.id)}
        onKeyDown={(e) => {
          const next = rowFocusKey(e.key, index, instruments.length)
          if (next === null) return
          e.preventDefault()
          focusAt(next)
        }}
        onClick={() => {
          playToggle(inst.id, on)
          onToggle(inst.id)
        }}
        className={`relative flex w-32 flex-col overflow-hidden rounded-lg border text-left transition-colors disabled:opacity-40 ${
          on ? 'border-kapton bg-ink-2 shadow-[0_0_0_1px_var(--color-kapton)]' : 'border-rule bg-ink-1/80 hover:border-rule-strong hover:bg-ink-2'
        }`}
      >
        <div className="relative h-20 w-full bg-ink-1">
          {portrait && <img src={assetUrl(portrait)} alt="" draggable={false} className="h-full w-full object-contain p-1.5" />}
          {on && <span className="absolute right-1.5 top-1.5 rounded-sm bg-kapton px-1 py-px fp-label text-[0.56rem] font-bold text-ink-0">Aboard</span>}
        </div>
        <div className="px-2 pb-2 pt-1">
          <div className="min-h-[2.1em] text-[0.8rem] font-semibold leading-tight text-paper">{instrumentShortName(inst)}</div>
          <div className={`truncate text-[0.64rem] ${inst.seesShadow ? 'text-ice' : 'text-paper-faint'}`}>
            {readsLabel(inst)}
          </div>
        </div>
        {/* Its beam colour, lit when aboard: the same colour as its beam and read-out on the stage */}
        <span aria-hidden className="h-[3px] w-full" style={{ background: color, opacity: on ? 0.9 : 0.25 }} />
      </button>
    </div>
  )
}

/** The hovered instrument's details: the Science step shows them in its dashboard, under the forecast */
export function InstrumentSpec({ inst, on }: { inst: InstrumentPart; on: boolean }) {
  const rows: [string, string][] = [
    ['Works', altitudeText(inst)],
    ['Data', `${inst.dataPerTurn} MB/month`],
    ['Power', `${Math.abs(inst.power)} W`],
    ['Mass', `${inst.mass} kg`],
    ['Size', `${inst.volume} U`],
    ['Cost', `$${inst.cost}M`],
  ]
  return (
    <div aria-live="polite" className="text-paper">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 font-display text-base font-bold leading-tight">{inst.name}</span>
        <span className={`shrink-0 fp-label text-[0.6rem] ${on ? 'text-kapton' : 'text-paper-faint'}`}>{on ? 'Aboard' : 'Click to add'}</span>
      </div>
      <div className="fp-label text-[0.6rem] text-paper-faint">Like {inst.flownOn}</div>
      <p className={`mt-2 text-[0.74rem] font-semibold ${inst.seesShadow ? 'text-ice' : 'text-caution'}`}>{lessonText(inst)}</p>
      <p className="mt-1 line-clamp-3 text-[0.74rem] leading-snug text-paper-dim">{inst.description}</p>
      <dl className="mt-2.5 grid grid-cols-3 gap-1">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0 bg-ink-1 px-2 py-1">
            <dt className="text-[0.58rem] uppercase tracking-wider text-paper-faint">{k}</dt>
            <dd className="truncate fp-data text-[0.74rem] text-paper">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function ScienceDock({
  chosen,
  day,
  onToggle,
  onHover,
  next,
}: {
  chosen: string[]
  day: number
  onToggle: (id: string) => void
  /** The instrument under the pointer or focus (null when none): the step previews it and shows its details */
  onHover: (id: string | null) => void
  next: { label: string; onClick: () => void }
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const hover = onHover
  return (
    <div className="pointer-events-none absolute bottom-4 left-20 right-4 z-10 flex items-end gap-3">
      <div
        className="hud-panel pointer-events-auto rounded-xl p-3"
        onPointerLeave={() => hover(null)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hover(null)
        }}
      >
        <div className="flex items-baseline justify-between gap-4">
          <span className="fp-label text-[0.68rem] tracking-[0.16em] text-paper">Pick up to {MAX_INSTRUMENTS}</span>
          <span className="fp-data text-[0.68rem] text-paper-faint">
            {chosen.length} of {MAX_INSTRUMENTS} aboard · a third swaps out the oldest
          </span>
        </div>
        <div role="group" aria-label={`Instruments: pick up to ${MAX_INSTRUMENTS}`} className="mt-2 flex gap-2">
          {instruments.map((inst, i) => (
            <Tile
              key={inst.id}
              inst={inst}
              on={chosen.includes(inst.id)}
              day={day}
              index={i}
              setRef={(at, el) => {
                refs.current[at] = el
              }}
              focusAt={(at) => refs.current[at]?.focus()}
              onToggle={onToggle}
              onHover={hover}
            />
          ))}
        </div>
      </div>

      <div className="pointer-events-auto ml-auto flex flex-col items-end gap-2">
        {chosen.length === 0 && <div className="hud-panel rounded-lg px-3 py-2 text-sm text-nogo">Pick at least one instrument to go on.</div>}
        <button type="button" onClick={next.onClick} disabled={chosen.length === 0} className="tactical-btn-next whitespace-nowrap px-6 disabled:opacity-40">
          {next.label}
        </button>
      </div>
    </div>
  )
}
