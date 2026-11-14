import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import type { TrayGroup, TrayKey, TrayOption } from '../../../viz/spacecraft/trayOptions'
import { useUiStore } from '../../../state/uiStore'
import { glossaryForPart } from '../../../data/glossary'
import { audio } from '../../../assets/audio'
import { choiceArt } from '../../../assets/catalogueArt'
import { prefersReducedMotion } from '../../../scene/space/quality'
import { Tooltip } from '../../Tooltip'
import { TrayCard } from './TrayCard'
import { optionChips } from './optionChips'

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

/** Narrowest and widest a card may get; below the narrowest, the tray scrolls sideways */
const CARD_MIN = 66
const CARD_MAX = 124

/**
 * The Factory's parts bins: five radio groups of portrait cards, one card per part, usable by
 * mouse, keyboard (arrow keys move and pick within a bin) and screen reader.
 */
export function PartsTray({ groups, selected, onPick, onActive }: PartsTrayProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const scroller = useRef<HTMLDivElement>(null)
  const edges = useScrollEdges(scroller)
  const setPreviewPatch = useUiStore((s) => s.setPreviewPatch)

  useEffect(() => () => setPreviewPatch(null), [setPreviewPatch])

  const clearHover = () => {
    onActive(null)
    setPreviewPatch(null)
  }

  /*
   * The cards run with sounds={false} (the game's one rule for pick sounds: the tray plays them),
   * so a click, Enter, Space or arrow key plays the part's own pick sound here, exactly once.
   */
  const pickWithSound = (key: TrayKey, id: string) => {
    audio.play(choiceArt(id)?.pick ?? 'sfx.select')
    onPick(key, id)
  }

  const onKey = (group: TrayGroup, index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const n = group.options.length
    const next = group.options[(index + step + n) % n]
    // Moving with the arrows picks too, with the same sound as a click
    pickWithSound(group.key, next.id)
    setPreviewPatch({ [group.key]: next.id })
    const el = refs.current[`${group.key}:${next.id}`]
    el?.focus()
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  return (
    <div className="relative">
      <div
        ref={scroller}
        className="-mx-1 overflow-x-auto overscroll-x-contain px-1 pt-1.5 pb-1 [scrollbar-color:#334155_transparent] [scrollbar-width:thin]"
        onMouseLeave={clearHover}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) clearHover()
        }}
      >
        <div className="flex w-full gap-2">
          {groups.map((g) => {
            const n = g.options.length
            return (
              <div
                key={g.key}
                role="radiogroup"
                aria-label={g.title}
                className="relative min-w-0 rounded-xl border px-1.5 pt-1 pb-1.5"
                style={{
                  flex: `${n} ${n} 0`,
                  minWidth: n * CARD_MIN + (n - 1) * 5 + 12,
                  maxWidth: n * CARD_MAX + (n - 1) * 5 + 12,
                  borderColor: `${g.color}40`,
                  background: `linear-gradient(180deg, ${g.color}1f 0%, ${g.color}08 40%, rgba(2,6,23,0.85) 100%)`,
                }}
              >
                <h3
                  className="mb-1 flex items-center gap-1.5 truncate font-mono text-[10px] font-semibold tracking-[0.1em] uppercase"
                  style={{ color: g.color }}
                >
                  <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: g.color, boxShadow: `0 0 8px ${g.color}` }} aria-hidden />
                  {g.key === 'attitude' ? <Tooltip term="adcs">{g.title}</Tooltip> : g.title}
                </h3>
                <div className="grid gap-[5px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
                  {g.options.map((o: TrayOption, i) => {
                    const on = selected[g.key] === o.id
                    return (
                      <TrayCard
                        key={o.id}
                        group={g.key}
                        option={o}
                        selected={on}
                        tabIndex={on ? 0 : -1}
                        buttonRef={(el) => {
                          refs.current[`${g.key}:${o.id}`] = el
                        }}
                        onPick={() => pickWithSound(g.key, o.id)}
                        onActive={() => {
                          onActive({ key: g.key, id: o.id })
                          setPreviewPatch({ [g.key]: o.id })
                        }}
                        onHover={() => {
                          audio.play('sfx.hover')
                          onActive({ key: g.key, id: o.id })
                          setPreviewPatch({ [g.key]: o.id })
                        }}
                        onKeyDown={onKey(g, i)}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {/* On narrow screens the tray scrolls sideways: a fade says there is more */}
      {edges.left && <div className="pointer-events-none absolute inset-y-0 -left-1 w-8 bg-gradient-to-r from-[#05070d] to-transparent" aria-hidden />}
      {edges.right && <div className="pointer-events-none absolute inset-y-0 -right-1 w-10 bg-gradient-to-l from-[#05070d] to-transparent" aria-hidden />}
    </div>
  )
}

/** Whether a sideways scroller has more to show on the left and on the right */
function useScrollEdges(ref: RefObject<HTMLDivElement | null>) {
  const [edges, setEdges] = useState({ left: false, right: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const left = el.scrollLeft > 2
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
      setEdges((e) => (e.left === left && e.right === right ? e : { left, right }))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro?.disconnect()
    }
  }, [ref])
  return edges
}

/** One strip above the tray: the description, every number as a chip and the remaining facts of one option. */
export function FactStrip({
  option,
  title,
  group,
  expanded = true,
}: {
  option: TrayOption | null
  title?: string
  group?: TrayKey
  /** False when showing the last pick with nothing hovered: stay inside the slot, off the bay's scale */
  expanded?: boolean
}) {
  const color = group ? choiceArt(option?.id ?? '')?.accent : undefined
  // glossaryForPart matches "ion" in "lithium-ion": electric propulsion only belongs to the engines
  const terms = glossaryForPart(`${title ?? ''} ${option?.short ?? ''} ${option?.description ?? ''}`).filter(
    (e) => group === 'propulsion' || e.term !== 'Electric Propulsion'
  )
  /*
   * A fixed slot of three lines, so hovering a card never resizes the 3D bay above (it used to jump
   * by up to 45 px). While a card is hovered or focused, a longer text grows upward over the bay's
   * floor on the tray's own background; otherwise it stays in the slot and fades out at the bottom.
   */
  return (
    <div className="relative h-[3.4rem]">
      <div
        className={`absolute inset-x-0 bottom-0 z-10 rounded-t-lg bg-[#05070d] px-1 pt-1 text-xs leading-snug text-slate-400 ${
          expanded
            ? 'shadow-[0_-10px_18px_-6px_rgba(5,7,13,0.95)]'
            : 'top-0 overflow-hidden [mask-image:linear-gradient(180deg,#000_70%,transparent)]'
        }`}
        aria-live="polite"
      >
        {option ? (
          <>
            <span className="font-semibold text-slate-200">
              {title ? `${title}: ` : ''}
              {option.short}.
            </span>{' '}
            {group &&
              optionChips(group, option).map((c) => (
                <span
                  key={c.label}
                  className="mr-1 inline-flex items-baseline gap-1 rounded-md border bg-white/5 px-1.5 py-px align-baseline font-mono"
                  style={{ borderColor: `${color ?? '#64748b'}55` }}
                >
                  <span className="text-[9px] tracking-wider text-slate-500 uppercase">{c.label}</span>
                  <span className="font-semibold text-slate-100 tabular-nums">{c.value}</span>
                </span>
              ))}{' '}
            {option.description}
            <span className="block text-slate-500">{option.facts}</span>
            {/* The jargon in this part, in plain words (QC #54) */}
            {terms.map((e) => (
              <span key={e.term} className="block text-slate-300">
                <span className="font-semibold">{e.term}:</span> {e.definition}
              </span>
            ))}
          </>
        ) : (
          <span>
            Pick a card from each bin below. Everything must fit the 6U box and the mass limit, propellant included, and
            the panels must make enough power.
          </span>
        )}
      </div>
    </div>
  )
}
