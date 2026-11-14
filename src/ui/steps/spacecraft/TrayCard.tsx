import type { KeyboardEvent, Ref } from 'react'
import { ChoiceCard, type ChoiceStat } from '../../kit/ChoiceCard'
import type { TrayKey, TrayOption } from '../../../viz/spacecraft/trayOptions'
import { optionChips } from './optionChips'

/** The two numbers on the card itself: the key number and what it costs in the box (mass, or volume for a fuelled engine) */
function cardChips(key: TrayKey, o: TrayOption): ChoiceStat[] {
  const all = optionChips(key, o)
  const second = all.find((c) => c.label === (key === 'propulsion' ? 'Volume' : 'Mass'))
  return second ? [all[0], second] : [all[0]]
}

/*
 * ChoiceCard at size xs puts its stat chips in two columns, which does not fit a 72-120 px tray
 * card. These scoped overrides (on this wrapper only; ChoiceCard is shared and left as is) make
 * the chips one value per row, keep titles to two lines so cards in a row line up, shorten the art a
 * little and keep the hover lift and zoom still when the player asks for reduced motion.
 */
const COMPACT = [
  'flex min-w-0',
  '[&>button>div]:h-full',
  '[&_.aspect-square]:aspect-[6/5] [&_img]:!p-1',
  '[&_.font-display.font-bold]:line-clamp-2 [&_.font-display.font-bold]:min-h-[2lh] [&_.font-display.font-bold]:text-[10.5px] [&_.font-display.font-bold]:tracking-tight',
  '[&_.grid-cols-2]:mt-1 [&_.grid-cols-2]:grid-cols-1 [&_.grid-cols-2]:gap-0.5',
  '[&_.grid-cols-2>div]:px-1 [&_.grid-cols-2>div]:py-px [&_.grid-cols-2>div]:text-center',
  // The unit says what each number is (W, Wh, MB, °, kg, U); the full labels are in the fact strip and the accessible name
  '[&_.grid-cols-2>div>div:first-child]:hidden [&_.grid-cols-2>div>div:last-child]:text-[10.5px] [&_.grid-cols-2>div>div:last-child]:whitespace-nowrap',
  // A smaller check mark, so it does not cover a third of a 60 px portrait
  '[&_.h-6.w-6]:right-1 [&_.h-6.w-6]:top-1 [&_.h-6.w-6]:h-4 [&_.h-6.w-6]:w-4 [&_.h-6.w-6]:text-[9px]',
  'motion-reduce:[&_button]:!translate-y-0 motion-reduce:[&_img]:!scale-100 motion-reduce:[&_img]:!transition-none',
].join(' ')

interface TrayCardProps {
  group: TrayKey
  option: TrayOption
  selected: boolean
  tabIndex: number
  buttonRef: Ref<HTMLButtonElement>
  onPick: () => void
  /** Keyboard focus: shows the part in the fact strip */
  onActive: () => void
  /** Pointer over the card: the tray plays the hover sound and shows the part */
  onHover: () => void
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
}

/** One Factory part as a compact portrait card, a radio in its bin. The tray plays its sounds (sounds={false} here). */
export function TrayCard({ group, option, selected, tabIndex, buttonRef, onPick, onActive, onHover, onKeyDown }: TrayCardProps) {
  return (
    <div className={COMPACT}>
      <ChoiceCard
        id={option.id}
        title={option.short}
        stats={cardChips(group, option)}
        selected={selected}
        look="portrait"
        size="xs"
        radio
        tabIndex={tabIndex}
        buttonRef={buttonRef}
        onKeyDown={onKeyDown}
        onFocus={onActive}
        onHover={onHover}
        sounds={false}
        onPick={onPick}
        ariaLabel={`${option.short}: ${option.stats}`}
      />
    </div>
  )
}
