import type { KeyboardEvent } from 'react'
import { audio } from '../../../assets/audio'
import { choiceArt } from '../../../assets/catalogueArt'

/** The choice's own pick sound, for picks the card itself does not see (arrow keys, the 3D scene) */
export function playPick(id: string): void {
  audio.play(choiceArt(id)?.pick ?? 'sfx.select')
}

/**
 * Keyboard for a tray of cards where exactly one is picked (a radio group): arrow keys move and
 * pick, skipping options that cannot be picked; Home / End jump to the ends. Only the picked card
 * is in the Tab order.
 */
export function radioKeys<T extends { id: string }>(
  options: T[],
  selectedId: string,
  canPick: (o: T) => boolean,
  pick: (id: string, fromKeyboard: boolean) => void,
  refs: { current: (HTMLButtonElement | null)[] }
) {
  const tabTarget = options.some((o) => o.id === selectedId) ? selectedId : options.find(canPick)?.id
  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const n = options.length
    let j = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      for (let k = 1; k <= n; k++) if (canPick(options[(i + k) % n])) { j = (i + k) % n; break }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      for (let k = 1; k <= n; k++) if (canPick(options[(i - k + n) % n])) { j = (i - k + n) % n; break }
    } else if (e.key === 'Home') j = options.findIndex(canPick)
    else if (e.key === 'End') j = n - 1 - [...options].reverse().findIndex(canPick)
    else return
    e.preventDefault()
    if (j < 0 || j >= n) return
    refs.current[j]?.focus()
    if (options[j].id !== selectedId) pick(options[j].id, true)
  }
  return {
    tabIndex: (id: string) => (id === tabTarget ? 0 : -1),
    onKeyDown,
    ref: (i: number) => (el: HTMLButtonElement | null) => {
      refs.current[i] = el
    },
  }
}
