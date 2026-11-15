import { useState, type ReactNode } from 'react'
import { assetUrl } from '../../../assets/url'
import { audio } from '../../../assets/audio'
import { choiceArt } from '../../../assets/catalogueArt'
import { prefersReducedMotion } from '../../../scene/space/quality'

/*
 * The pieces of the Communications step: a compact choice tile (picture, name, one figure) and
 * the signal path from the craft to the dish. Pictures come from the catalogue art.
 */

export type PickTone = 'green' | 'yellow' | 'red'

const TONE_TEXT: Record<PickTone, string> = { green: 'text-go', yellow: 'text-caution', red: 'text-nogo' }
const TONE_STROKE: Record<PickTone, string> = { green: 'var(--color-go)', yellow: 'var(--color-caution)', red: 'var(--color-nogo)' }

/** A picture from the catalogue: the painted scene card when there is one and `scene` is set, else the 3D portrait */
export function ChoicePicture({ id, scene = false, className = '' }: { id: string; scene?: boolean; className?: string }) {
  const art = choiceArt(id)
  const src = scene ? (art?.card ?? art?.portrait) : art?.portrait
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <div className={`bg-ink-1 ${className}`} />
  return (
    <img
      src={assetUrl(src)}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      className={`${scene && art?.card ? 'object-cover' : 'object-contain p-1.5'} bg-ink-1 ${className}`}
    />
  )
}

/**
 * One choice: a picture, a short tag, the name, the figure that matters and a note. Hover or focus
 * previews it on the dashboard; a click picks it.
 */
export function PickTile({
  id,
  tag,
  name,
  figure,
  figureTone,
  detail,
  note,
  noteTone,
  selected,
  scene,
  onPick,
  onPreview,
}: {
  id: string
  tag: string
  name: string
  figure: ReactNode
  figureTone: PickTone
  detail: string
  note?: string
  noteTone?: PickTone
  selected: boolean
  scene?: boolean
  onPick: () => void
  onPreview: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-choice-id={id}
      onClick={() => {
        audio.play(choiceArt(id)?.pick ?? 'sfx.select')
        onPick()
      }}
      onMouseEnter={() => onPreview(true)}
      onMouseLeave={() => onPreview(false)}
      onFocus={() => onPreview(true)}
      onBlur={() => onPreview(false)}
      className={`group flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border text-left transition-colors ${
        selected ? 'border-kapton bg-ink-2 shadow-[0_0_0_1px_var(--color-kapton)]' : 'border-rule bg-ink-1/70 hover:border-rule-strong hover:bg-ink-2'
      }`}
    >
      <div className="relative min-h-0 w-full flex-1">
        <ChoicePicture id={id} scene={scene} className="absolute inset-0 h-full w-full" />
        <span className="absolute left-2 top-2 rounded-sm bg-ink-0/80 px-1.5 py-0.5 fp-label text-[0.6rem] text-paper-dim">{tag}</span>
        {selected && (
          <span className="absolute right-2 top-2 rounded-sm bg-kapton px-1.5 py-0.5 fp-label text-[0.6rem] font-bold text-ink-0">Chosen</span>
        )}
      </div>
      <div className="shrink-0 px-2.5 py-2">
        <div className="truncate text-[0.82rem] font-semibold leading-tight text-paper">{name}</div>
        <div className={`fp-data mt-0.5 text-sm ${TONE_TEXT[figureTone]}`}>{figure}</div>
        <div className="truncate fp-data text-[0.66rem] text-paper-faint">{detail}</div>
        <div className={`mt-0.5 h-4 truncate text-[0.68rem] ${noteTone ? TONE_TEXT[noteTone] : 'text-paper-faint'}`} title={note}>
          {note ?? ''}
        </div>
      </div>
    </button>
  )
}

/** A row of choices with its title */
export function PickRow({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="fp-label text-[0.7rem] tracking-[0.16em] text-paper">{title}</h2>
        {hint && <span className="text-[0.7rem] text-paper-faint">{hint}</span>}
      </div>
      <div role="radiogroup" aria-label={title} className="grid min-h-0 flex-1 grid-cols-3 gap-3">
        {children}
      </div>
    </section>
  )
}

/**
 * The signal path: the radio at the Moon, the beam, the dish on Earth. Packets flow along the
 * beam when the link closes (faster for more data) and it breaks when nothing reaches the ground.
 */
export function SignalPath({
  radioId,
  radioName,
  stationId,
  stationName,
  kbps,
  hours,
  tone,
}: {
  radioId: string
  radioName: string
  stationId: string
  stationName: string
  kbps: number
  hours: number
  tone: PickTone
}) {
  const open = kbps > 0
  const reduced = prefersReducedMotion()
  const packets = open ? Math.min(8, Math.max(2, Math.round(Math.log2(kbps + 1)))) : 0
  const dur = open ? Math.max(0.8, 3.4 - Math.log2(kbps + 1) * 0.3) : 0
  const stroke = TONE_STROKE[tone]
  const end = (id: string, where: string, name: string) => (
    <div className="flex w-36 shrink-0 flex-col items-center text-center">
      <ChoicePicture id={id} className="h-20 w-20 rounded-md border border-rule" />
      <div className="mt-1 fp-label text-[0.6rem] text-paper-faint">{where}</div>
      <div className="line-clamp-1 text-xs font-semibold text-paper">{name}</div>
    </div>
  )
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-lg border border-rule bg-ink-1/60 px-4 py-3">
      <style>{`@keyframes comms-flow { to { stroke-dashoffset: -24 } } @keyframes comms-packet { 0%,100% { opacity: .25 } 50% { opacity: 1 } }`}</style>
      {end(radioId, 'At the Moon', radioName)}
      <div className="flex min-w-0 flex-1 flex-col items-center">
        <svg viewBox="0 0 400 40" preserveAspectRatio="none" className="h-10 w-full" aria-hidden="true">
          {open ? (
            <>
              <line x1="0" y1="20" x2="400" y2="20" stroke="var(--color-rule-strong)" strokeWidth="1" />
              <line
                x1="0"
                y1="20"
                x2="400"
                y2="20"
                stroke={stroke}
                strokeWidth="2"
                strokeDasharray="2 22"
                style={reduced ? undefined : { animation: `comms-flow ${dur}s linear infinite` }}
              />
              {Array.from({ length: packets }, (_, i) => (
                <rect
                  key={i}
                  x={((i + 0.5) / packets) * 370 + 12}
                  y={16}
                  width={7}
                  height={7}
                  fill="var(--color-paper)"
                  stroke={stroke}
                  style={reduced ? undefined : { animation: `comms-packet ${dur}s linear infinite`, animationDelay: `${-(i / packets) * dur}s` }}
                />
              ))}
            </>
          ) : (
            <>
              <line x1="0" y1="20" x2="170" y2="20" stroke={stroke} strokeWidth="1.5" strokeDasharray="6 6" />
              <path d="M190 10 L210 30 M210 10 L190 30" stroke={stroke} strokeWidth="2" />
            </>
          )}
        </svg>
        <div className={`fp-data text-lg ${TONE_TEXT[tone]}`}>{open ? `${kbps} kbps` : 'No link'}</div>
        <div className="text-[0.7rem] text-paper-dim">{open ? `${hours} h a day on the dish` : 'Nothing reaches the ground'}</div>
      </div>
      {end(stationId, 'On Earth', stationName)}
    </div>
  )
}
