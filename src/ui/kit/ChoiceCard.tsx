import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { audio } from '../../assets/audio'
import { choiceArt } from '../../assets/catalogueArt'
import { assetUrl } from '../../assets/url'
import { prefersReducedMotion } from '../../scene/space/quality'

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
  size?: 'sm' | 'md' | 'lg'
  onPick?: () => void
}

const WIDTH = { sm: 'w-40', md: 'w-56', lg: 'w-72' } as const

/**
 * A choice shown as a game card: art on top (the part's 3D portrait on a glow in its category
 * colour, or the painted scene), name, key numbers, and a gentle tilt toward the pointer.
 * Picking plays the choice's own sound; a disabled card thunks and shows why.
 * A real <button>: keyboard and screen readers work as with any button.
 */
export function ChoiceCard({ id, title, subtitle, stats = [], selected = false, disabled = false, reason, tag, look, size = 'md', onPick }: ChoiceCardProps) {
  const art = choiceArt(id)
  const accent = art?.accent ?? '#94a3b8'
  const mode = look ?? (art?.portrait ? 'portrait' : 'scene')
  const image = mode === 'portrait' ? (art?.portrait ?? art?.card) : (art?.card ?? art?.portrait)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [imgFailed, setImgFailed] = useState(false)
  const reduced = useRef(prefersReducedMotion())

  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (reduced.current) return
    const r = e.currentTarget.getBoundingClientRect()
    setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -10, y: ((e.clientX - r.left) / r.width - 0.5) * 12 })
  }
  const pick = () => {
    if (disabled) {
      audio.play('sfx.fit-error')
      return
    }
    audio.play(art?.pick ?? 'sfx.select')
    onPick?.()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick()
    }
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-disabled={disabled}
      aria-describedby={disabled && reason ? `${id}-reason` : undefined}
      onClick={pick}
      onKeyDown={onKey}
      onPointerEnter={() => !disabled && audio.play('sfx.hover')}
      onPointerMove={onMove}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      className={`group relative ${WIDTH[size]} shrink-0 select-none rounded-2xl text-left transition-[transform,box-shadow] duration-200 ease-out focus:outline-none focus-visible:ring-4 ${
        disabled ? 'cursor-not-allowed opacity-60 saturate-50' : 'cursor-pointer hover:-translate-y-1'
      }`}
      style={{
        transform: `perspective(700px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        boxShadow: selected ? `0 0 0 2px ${accent}, 0 0 32px ${accent}88, 0 18px 40px rgba(0,0,0,0.55)` : '0 12px 30px rgba(0,0,0,0.45)',
        ['--tw-ring-color' as string]: `${accent}aa`,
      }}
    >
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f1e]">
        {/* Art */}
        <div className={`relative ${mode === 'portrait' ? 'aspect-square' : 'aspect-[16/10]'} overflow-hidden`}>
          {mode === 'portrait' && (
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at 50% 55%, ${accent}55 0%, ${accent}18 38%, transparent 70%), linear-gradient(180deg, #111a33 0%, #070b16 100%)`,
              }}
            >
              <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:16px_16px]" />
            </div>
          )}
          {image && !imgFailed ? (
            <img
              src={assetUrl(image)}
              alt=""
              draggable={false}
              onError={() => setImgFailed(true)}
              className={`absolute inset-0 h-full w-full ${mode === 'portrait' ? 'object-contain p-2 transition-transform duration-300 group-hover:scale-105' : 'object-cover'}`}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center font-display text-4xl font-bold text-white/20">{title.slice(0, 1)}</div>
          )}
          {mode === 'scene' && <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f1e] via-transparent to-transparent" />}
          {tag && (
            <span className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/85 backdrop-blur">
              {tag}
            </span>
          )}
          {selected && (
            <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: accent }}>
              ✓
            </span>
          )}
          {/* Light sweep on hover */}
          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        </div>
        {/* Name plate */}
        <div className="relative p-3" style={{ borderTop: `2px solid ${accent}` }}>
          <div className="font-display text-base font-bold leading-tight text-white">{title}</div>
          {subtitle && <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-400">{subtitle}</div>}
          {stats.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-1">
              {stats.map((s) => (
                <div key={s.label} className="rounded-md bg-white/5 px-1.5 py-1">
                  <div className="text-[9px] uppercase tracking-wider text-slate-500">{s.label}</div>
                  <div className={`text-xs font-semibold tabular-nums ${s.tone === 'good' ? 'text-emerald-300' : s.tone === 'bad' ? 'text-rose-300' : 'text-slate-100'}`}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
          {disabled && reason && (
            <div id={`${id}-reason`} className="mt-2 rounded-md bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200">
              {reason}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
