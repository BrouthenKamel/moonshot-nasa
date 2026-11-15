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
 * Scoped overrides for a 72-120 px tray card (on this wrapper only; ChoiceCard is shared and left
 * as is): titles kept to two lines so cards in a row line up, a slightly shorter art plate, the
 * stat labels dropped (the unit says what each number is: W, Wh, MB, °, kg, U; the full labels are
 * in the fact strip and the accessible name), and no hover lift or zoom under reduced motion.
 */
const COMPACT = [
  'flex min-w-0',
  '[&>button>div]:h-full',
  '[&_.aspect-square]:aspect-[6/5] [&_img]:!p-1',
  '[&_.font-sans.font-bold]:line-clamp-2 [&_.font-sans.font-bold]:min-h-[2lh] [&_.font-sans.font-bold]:text-[10.5px]',
  '[&_dl]:mt-1 [&_dl>div]:justify-center [&_dt]:hidden [&_dd]:text-[10.5px] [&_dd]:whitespace-nowrap',
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
