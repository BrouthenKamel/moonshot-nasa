import { useState, type KeyboardEvent, type Ref } from 'react'
import { audio } from '../../assets/audio'
import { choiceArt } from '../../assets/catalogueArt'
import { assetUrl } from '../../assets/url'
import { Stamp } from './Stamp'

export interface ChoiceStat {
  label: string
  value: string
  /** 'good' and 'bad' colour the value; leave out for neutral */
  tone?: 'good' | 'bad'
}

export interface ChoiceCardProps {
  /** Catalogue id: part, orbit, ride, transfer, ground station or difficulty */
  id: string
  title: string
  /** One line under the title (the real mission it comes from, or what it does) */
  subtitle?: string
  stats?: ChoiceStat[]
  selected?: boolean
  /** Shown but cannot be picked; `reason` says why (e.g. "Too heavy: 1.2 kg over") */
  disabled?: boolean
  reason?: string
  /** Small corner tag, e.g. "Lunar Flashlight" or "Upgrade" */
  tag?: string
  /** 'portrait' (3D part on a glow, default for parts) or 'scene' (painted card art) */
  look?: 'portrait' | 'scene'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  onPick?: () => void
  /**
   * Inside a radiogroup (a tray of options where exactly one is picked): the card becomes
   * role="radio" with aria-checked, and the caller manages tabIndex and arrow keys.
   */
  radio?: boolean
  tabIndex?: number
  buttonRef?: Ref<HTMLButtonElement>
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void
  onFocus?: () => void
  onHover?: () => void
  /** Accessible name when the visible text is not enough (e.g. "Large array: 2 kg, 120 W") */
  ariaLabel?: string
  /** Play sounds on hover and pick (default true) */
  sounds?: boolean
}

const WIDTH = { xs: 'w-full', sm: 'w-40', md: 'w-56', lg: 'w-72' } as const

/**
 * A choice shown as a game card: art on top (the part's 3D portrait on a glow in its category
 * colour, or the painted scene), name, key numbers, and a gentle tilt toward the pointer.
 * Picking plays the choice's own sound; a disabled card thunks and shows why.
 * A real <button>: keyboard and screen readers work as with any button.
 */
export function ChoiceCard({
  id,
  title,
  subtitle,
  stats = [],
  selected = false,
  disabled = false,
  reason,
  tag,
  look,
  size = 'md',
  onPick,
  radio = false,
  tabIndex,
  buttonRef,
  onKeyDown,
  onFocus,
  onHover,
  ariaLabel,
  sounds = true,
}: ChoiceCardProps) {
  const xs = size === 'xs'
  const art = choiceArt(id)
  const accent = art?.accent ?? '#94a3b8'
  const mode = look ?? (art?.portrait ? 'portrait' : 'scene')
  const image = mode === 'portrait' ? (art?.portrait ?? art?.card) : (art?.card ?? art?.portrait)
  const [imgFailed, setImgFailed] = useState(false)
  const pick = () => {
    if (disabled) {
      if (sounds) audio.play('sfx.fit-error')
      return
    }
    if (sounds) audio.play(art?.pick ?? 'sfx.select')
    onPick?.()
  }
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick()
      return
    }
    onKeyDown?.(e)
  }

  return (
    <button
      type="button"
      data-choice-id={id}
      ref={buttonRef}
      role={radio ? 'radio' : undefined}
      aria-checked={radio ? selected : undefined}
      aria-pressed={radio ? undefined : selected}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      onFocus={onFocus}
      aria-disabled={disabled}
      aria-describedby={disabled && reason ? `${id}-reason` : undefined}
      onClick={pick}
      onKeyDown={onKey}
      onPointerEnter={() => {
        if (!disabled && sounds) audio.play('sfx.hover')
        onHover?.()
      }}
      className={`group relative ${WIDTH[size]} shrink-0 select-none text-left transition-transform duration-150 ease-out focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kapton ${
        disabled ? 'cursor-not-allowed opacity-55 grayscale' : 'cursor-pointer hover:-translate-y-0.5'
      }`}
    >
      {/* Direct children of this frame must stay strictly [art, namePlate] for TrayCard/EQUAL_HEIGHT_CARD selectors */}
      <div
        className={`overflow-hidden rounded-[2px] border bg-ink-2 transition-colors ${
          selected ? 'border-kapton' : 'border-rule group-hover:border-rule-strong'
        }`}
      >
        {/* Art: the part on a drafting-table plate, or the painted scene */}
        <div className={`relative ${mode === 'portrait' ? 'aspect-square' : 'aspect-[16/10]'} overflow-hidden bg-ink-1`}>
          {mode === 'portrait' && (
            <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(237,230,214,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(237,230,214,0.05)_1px,transparent_1px)] [background-size:12px_12px]" />
          )}
          {image && !imgFailed ? (
            <img
              src={assetUrl(image)}
              alt=""
              draggable={false}
              onError={() => setImgFailed(true)}
              className={`absolute inset-0 h-full w-full ${mode === 'portrait' ? 'object-contain p-2 transition-transform duration-300 group-hover:scale-[1.04]' : 'object-cover saturate-[0.85]'}`}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center fp-display text-4xl text-paper/20">{title.slice(0, 1)}</div>
          )}
          {mode === 'scene' && <div className="absolute inset-0 bg-gradient-to-t from-ink-2 via-transparent to-transparent" />}
          {/* Category swatch: a thin rule in the part family's colour, no glow */}
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent, opacity: 0.7 }} />
          {tag && (
            <span className={`absolute left-1.5 top-2 fp-tag bg-ink-1/85 ${xs ? 'scale-90 origin-left' : ''}`} data-tone="neutral">
              {tag}
            </span>
          )}
          {selected && (
            <span className="absolute right-1.5 top-2">
              <Stamp verdict="selected" size="sm" animate>
                {xs ? '✓' : 'Flight'}
              </Stamp>
            </span>
          )}
        </div>
        {/* Name plate */}
        <div className={`relative ${xs ? 'p-1.5' : 'p-3'} border-t ${selected ? 'border-kapton' : 'border-rule'}`}>
          <div className={`font-sans font-bold leading-tight text-paper [font-stretch:92%] ${xs ? 'text-[11px]' : 'text-[15px]'}`}>{title}</div>
          {subtitle && <div className={`mt-0.5 leading-snug text-paper-dim ${xs ? 'line-clamp-1 text-[10px]' : 'line-clamp-2 text-xs'}`}>{subtitle}</div>}
          {stats.length > 0 && (
            <dl className={`mt-2 grid ${xs ? 'grid-cols-1 gap-0.5' : 'grid-cols-2 gap-x-3 gap-y-1'}`}>
              {stats.map((s, i) => (
                <div key={s.label} className={`flex items-baseline justify-between gap-1 border-b border-rule/70 pb-0.5 ${i >= 2 ? 'eng-only' : ''}`}>
                  <dt className="fp-label text-[10px] text-paper-faint">{s.label}</dt>
                  <dd className={`fp-data text-xs font-medium ${s.tone === 'good' ? 'text-go' : s.tone === 'bad' ? 'text-nogo' : 'text-paper'}`}>{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {disabled && reason && (
            <div id={`${id}-reason`} className="mt-2 border-l-2 border-nogo bg-nogo/10 px-2 py-1 text-[11px] text-paper">
              {reason}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
