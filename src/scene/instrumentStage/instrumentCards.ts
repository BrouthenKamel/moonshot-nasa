/**
 * How an instrument reads as a game card: the same facts on the stage's bar and the flat
 * list. Catalogue facts only (src/data/parts.ts); no mission numbers are worked out here.
 */
import type { ChoiceStat } from '../../ui/kit/ChoiceCard'
import { audio } from '../../assets/audio'
import { choiceArt } from '../../assets/catalogueArt'
import type { InstrumentPart } from '../../data/parts'
import type { InstrumentLock } from './labLocks'
import { INSTRUMENT_COLORS, INSTRUMENT_SHORT_NAMES } from './stageModel'

export const instrumentColor = (id: string) => INSTRUMENT_COLORS[id] ?? '#94a3b8'
export const instrumentShortName = (inst: InstrumentPart) => INSTRUMENT_SHORT_NAMES[inst.id] ?? inst.name

/** What an instrument really reads, in a few words (the same on its card, its foot and the dock) */
export function readsLabel(inst: InstrumentPart): string {
  if (inst.seesShadow) return 'Maps ice, even in shadow'
  return inst.kind === 'context' ? 'Maps sunlit ground, not ice' : 'Pictures only, maps no ice'
}

/** The key lesson, in a few words: does it see into the shadowed craters, and from how high */
export function lessonText(inst: InstrumentPart): string {
  if (!inst.seesShadow)
    return inst.kind === 'context'
      ? 'Maps the sunlit ground only: it cannot see the ice in shadow'
      : 'Takes pictures: it maps no ice'
  return inst.maxAltitudeKm === null
    ? 'Sees into shadowed craters'
    : `Sees into shadowed craters, only below ${inst.maxAltitudeKm} km`
}

export const altitudeText = (inst: InstrumentPart) =>
  inst.maxAltitudeKm === null ? 'Any altitude' : `Below ${inst.maxAltitudeKm} km`

/** Mass, power, cost and the shadow lesson; `full` adds data, volume and altitude */
export function instrumentStats(inst: InstrumentPart, full = false): ChoiceStat[] {
  const stats: ChoiceStat[] = [
    { label: 'Mass', value: `${inst.mass} kg` },
    { label: 'Power', value: `${Math.abs(inst.power)} W` },
    { label: 'Cost', value: `$${inst.cost}M` },
    { label: 'Shadow', value: inst.seesShadow ? 'Sees in' : 'Blind', tone: inst.seesShadow ? 'good' : 'bad' },
  ]
  if (full) {
    stats.push(
      { label: 'Data', value: `${inst.dataPerTurn} MB/mo` },
      { label: 'Works', value: inst.maxAltitudeKm === null ? 'Any height' : `< ${inst.maxAltitudeKm} km` },
    )
  }
  return stats
}

export interface InstrumentCardView {
  blocked: boolean
  reason?: string
  ariaLabel: string
}

/** A locked instrument already aboard stays removable; otherwise it cannot be picked */
export function instrumentCardView(inst: InstrumentPart, selected: boolean, lock: InstrumentLock): InstrumentCardView {
  const blocked = lock.locked && !selected
  const reason = lock.locked ? `🔒 ${lock.text}` : undefined
  const ariaLabel = [
    inst.name,
    `${inst.mass} kg, ${Math.abs(inst.power)} W, $${inst.cost}M, ${inst.dataPerTurn} MB per month, ${inst.volume} U`,
    lessonText(inst),
    `like ${inst.flownOn}`,
    blocked && reason ? lock.text : '',
  ]
    .filter(Boolean)
    .join('. ')
  return { blocked, reason, ariaLabel }
}

/** Arrow keys, Home and End move focus along a row of cards (each card stays a toggle) */
export function rowFocusKey(key: string, index: number, count: number): number | null {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

/**
 * The cards pass sounds={false} (they toggle, and the cue director plays no pick sound), so the
 * trays sound here: the instrument's pick sound going aboard, a card flip coming off.
 */
export function playToggle(id: string, aboard: boolean) {
  audio.play(aboard ? 'sfx.card-flip' : (choiceArt(id)?.pick ?? 'sfx.pick-instrument'))
}

/**
 * A locked card thuds when it is clicked or pressed (the cards play no sounds of their own).
 * Enter and Space never become a click on ChoiceCard, so the keyboard is caught here too.
 */
export function blockedThud(blocked: boolean) {
  const thud = () => {
    if (blocked) audio.play('sfx.fit-error')
  }
  return {
    onClickCapture: thud,
    onKeyDownCapture: (e: { key: string }) => {
      if (e.key === 'Enter' || e.key === ' ') thud()
    },
  }
}

/**
 * On the card's wrapper (a flex column): the card fills its grid cell (never wider, so a narrow
 * row cannot overlap them) and is as tall as the tallest in the row, with the stat chips lined up
 * at the bottom, so a two-line name does not leave the row ragged.
 * Reaches into ChoiceCard's markup (button > frame > art + name plate); if that changes the
 * cards only lose the equal height.
 */
export const EQUAL_HEIGHT_CARD =
  '[&>button]:w-full [&>button]:flex-1 [&>button>div]:flex [&>button>div]:h-full [&>button>div]:flex-col ' +
  '[&>button>div>div:last-child]:flex [&>button>div>div:last-child]:flex-1 [&>button>div>div:last-child]:flex-col ' +
  '[&>button>div>div:last-child>.grid]:mt-auto [&>button>div>div:last-child>.grid]:pt-2'
