import { useRef, type KeyboardEvent } from 'react'
import { audio } from '../../../assets/audio'
import { choiceArt } from '../../../assets/catalogueArt'

/**
 * Keyboard and sound for a tray of ChoiceCards in radio mode: one card in the tab order (the
 * picked one), arrow keys move to the next card and pick it, Home / End jump to the ends; like
 * a native radio group. The cards run with sounds={false} (the game's one rule for pick
 * sounds), so this hook plays each card's own pick sound, once, for a click or an arrow key.
 */
export function useCardRadioGroup(ids: string[], selected: string, onPick: (id: string) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const current = Math.max(0, ids.indexOf(selected))

  /** Pick a card by click, Enter or Space: its sound, then the pick */
  const pick = (id: string) => {
    audio.play(choiceArt(id)?.pick ?? 'sfx.select')
    if (id !== selected) onPick(id)
  }

  const move = (to: number) => {
    const i = (to + ids.length) % ids.length
    const id = ids[i]
    if (id !== selected) pick(id)
    refs.current[i]?.focus()
  }

  const props = (index: number) => ({
    radio: true as const,
    sounds: false as const,
    tabIndex: index === current ? 0 : -1,
    onPick: () => pick(ids[index]),
    buttonRef: (el: HTMLButtonElement | null) => {
      refs.current[index] = el
    },
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      const k = e.key
      if (k === 'ArrowRight' || k === 'ArrowDown') move(index + 1)
      else if (k === 'ArrowLeft' || k === 'ArrowUp') move(index - 1)
      else if (k === 'Home') move(0)
      else if (k === 'End') move(ids.length - 1)
      else return
      e.preventDefault()
    },
  })
  return props
}
