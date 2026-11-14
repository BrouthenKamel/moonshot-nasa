import { ChoiceCard, type ChoiceCardProps } from '../../kit/ChoiceCard'
import { choiceArt } from '../../../assets/catalogueArt'
import { assetUrl } from '../../../assets/url'

/**
 * A Launch Site choice: the shared painted ChoiceCard, plus two things the kit card does not do
 * (kept here so the shared kit stays untouched):
 * - `inset`: the vehicle's 3D portrait popping out of the card's top corner, like a figurine;
 * - `plaque`: a status line under the card in a Go / No-Go colour ("ON TIME", "TOO HEAVY",
 *   "NO ICE INSTRUMENT ON BOARD"), for options that can be picked but have a problem.
 */

export type PlaqueTone = 'good' | 'warn' | 'bad'

export interface Plaque {
  tone: PlaqueTone
  text: string
}

const PLAQUE: Record<PlaqueTone, string> = {
  good: 'border-green-400/45 bg-green-500/15 text-green-300',
  warn: 'border-amber-400/45 bg-amber-500/15 text-amber-300',
  bad: 'border-red-400/50 bg-red-500/20 text-red-300',
}
const PLAQUE_DOT: Record<PlaqueTone, string> = { good: 'bg-green-400', warn: 'bg-amber-400', bad: 'bg-red-400' }

export interface LaunchCardProps extends Omit<ChoiceCardProps, 'look' | 'ariaLabel'> {
  /** Show the choice's 3D portrait (the launch vehicle) as an inset */
  inset?: boolean
  plaque?: Plaque
  /** Size of the inset portrait in px */
  insetSize?: number
}

/** Accessible name: everything the card shows, in reading order */
function labelOf(p: LaunchCardProps): string {
  const parts = [p.title]
  if (p.subtitle) parts.push(p.subtitle)
  if (p.tag) parts.push(p.tag)
  for (const s of p.stats ?? []) parts.push(`${s.label} ${s.value}`)
  if (p.plaque) parts.push(p.plaque.text.charAt(0) + p.plaque.text.slice(1).toLowerCase())
  return parts.join('. ')
}

export function LaunchCard({ inset = false, plaque, insetSize = 64, sounds = true, ...card }: LaunchCardProps) {
  const portrait = inset ? choiceArt(card.id)?.portrait : undefined
  return (
    <div className="group/lc relative flex flex-col">
      {/* The card plays its own hover, pick and "doesn't fit" sounds; the trays add the pick sound only
          for picks the card does not see (arrow keys, clicks in the 3D scene). */}
      <ChoiceCard {...card} look="scene" sounds={sounds} ariaLabel={labelOf({ ...card, plaque })} />
      {portrait && (
        <img
          src={assetUrl(portrait)}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute -top-4 -left-2 z-10 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.7)] transition-transform duration-300 ease-out group-hover/lc:-translate-y-1.5 group-hover/lc:scale-110 motion-reduce:transition-none motion-reduce:group-hover/lc:transform-none"
          style={{ width: insetSize, height: insetSize }}
        />
      )}
      {plaque && (
        <div
          aria-hidden
          className={`mt-1.5 flex items-center justify-center gap-1.5 rounded-md border px-1.5 py-0.5 text-center text-[10px] leading-tight font-bold tracking-wide backdrop-blur ${PLAQUE[plaque.tone]}`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PLAQUE_DOT[plaque.tone]}`} />
          {plaque.text}
        </div>
      )}
    </div>
  )
}
