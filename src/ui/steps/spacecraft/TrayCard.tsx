import type { KeyboardEvent, Ref } from 'react'
import { ChoiceCard, type ChoiceStat } from '../../kit/ChoiceCard'
import type { TrayKey, TrayOption } from '../../../viz/spacecraft/trayOptions'

/** The label of each category's key number (the last item of TrayOption.stats) */
const KEY_LABEL: Record<TrayKey, string> = {
  solar: 'Power',
  battery: 'Energy',
  computer: 'Storage',
  attitude: 'Pointing',
  propulsion: 'Fuelled',
}

/**
 * Every number of a tray option as labelled chips, read from TrayOption.stats
 * ("mass · volume · cost · key", built by trayGroups): nothing is recomputed here.
 */
export function optionChips(key: TrayKey, o: TrayOption): ChoiceStat[] {
  const parts = o.stats.split(' · ')
  const keyValue = parts[parts.length - 1]?.replace(/ fuelled$/, '') ?? ''
  const chips: ChoiceStat[] = [{ label: KEY_LABEL[key], value: keyValue }]
  for (const p of parts.slice(0, -1)) {
    if (p.startsWith('$')) chips.push({ label: 'Cost', value: p })
    else if (p.endsWith(' U')) chips.push({ label: 'Volume', value: p })
    else if (p.endsWith(' kg')) chips.push({ label: key === 'propulsion' ? 'Dry' : 'Mass', value: p })
  }
  return chips
}

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
  'motion-reduce:[&_button]:!translate-y-0 motion-reduce:[&_img]:!scale-100 motion-reduce:[&_img]:!transition-none',
].join(' ')

interface TrayCardProps {
  group: TrayKey
  option: TrayOption
  selected: boolean
  tabIndex: number
  buttonRef: Ref<HTMLButtonElement>
  onPick: () => void
  onActive: () => void
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
}

/** One Factory part as a compact portrait card, a radio in its bin. Picking plays the category's pick sound. */
export function TrayCard({ group, option, selected, tabIndex, buttonRef, onPick, onActive, onKeyDown }: TrayCardProps) {
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
        onHover={onActive}
        sounds={false}
        onPick={onPick}
        ariaLabel={`${option.short}: ${option.stats}`}
      />
    </div>
  )
}
