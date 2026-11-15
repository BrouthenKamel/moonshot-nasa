import type { GoNoGoResult } from '../../sim/types'
import type { Station } from './stations'

/**
 * How the flight director closes the poll, matching the stamp (QC, 15 Nov): "All stations are go …
 * cleared for launch" only when the stamp says GO FOR LAUNCH. Any caution (a yellow station, or a craft
 * that cannot meet the brief) closes with "Go with a caution on <station>". No clip of that was
 * recorded, so it is a caption-only line (audio.note).
 */
export type PollEnd =
  | { kind: 'go'; voice: 'voice.poll-all-go' }
  | { kind: 'caution'; text: string }
  | { kind: 'nogo'; voice: 'voice.poll-hold' }

const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

export function pollEnd(result: GoNoGoResult, doomed: boolean, stations: Station[]): PollEnd {
  if (!result.canGo) return { kind: 'nogo', voice: 'voice.poll-hold' }
  const cautious = stations.filter((s) => s.status === 'yellow').map((s) => s.title)
  if (cautious.length === 0 && !doomed && result.warnings.length === 0) return { kind: 'go', voice: 'voice.poll-all-go' }
  // A craft that cannot meet the brief is the Science station's caution
  const names = cautious.length ? cautious : ['Science']
  return { kind: 'caution', text: `Go with a caution on ${list(names)}.` }
}

/**
 * Only the first poll on entry plays at full length; a re-poll after a design change runs about 3× faster.
 * The full poll is paced by its own voice lines (it waits for each one); `full` is its nominal pace,
 * the yardstick for the re-poll's timers.
 */
export const POLL_TIMING = {
  full: { open: 2600, gap: 1700, end: 600 },
  fast: { open: 2600 / 3, gap: 1700 / 3, end: 600 / 3 },
} as const
