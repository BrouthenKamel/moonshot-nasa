import type { CheckResult } from '../../sim/types'

/**
 * The launch moment after "Launch Mission": a mission-control poll (each
 * Go / No-Go system reads out GO), a countdown from T-10 and liftoff.
 * Pure timing, so the beats can be tested without a clock.
 */

export type LaunchBeat =
  | { at: number; kind: 'poll'; system: string; word: string }
  | { at: number; kind: 'count'; n: number }
  | { at: number; kind: 'liftoff' }
  | { at: number; kind: 'done' }

/** Full version: 10-15 s whatever the number of checks. Reduced motion: about 2.5 s. */
export const FULL = { startMs: 400, pollBudgetMs: 4800, maxPollMs: 600, countMs: 700, liftoffMs: 1600 }
export const REDUCED = { pollMs: 700, liftoffMs: 1200, doneMs: 2400 }

/** What a system's controller answers: launch is only offered when nothing is red */
export function pollWord(check: Pick<CheckResult, 'status'>): string {
  return check.status === 'green' ? 'GO' : 'GO, little to spare'
}

export function launchTimeline(checks: Pick<CheckResult, 'resource' | 'status'>[], reducedMotion: boolean): LaunchBeat[] {
  const polls = checks.map((c) => ({ system: c.resource, word: pollWord(c) }))
  if (reducedMotion) {
    // The short version: every readout at once, no countdown, liftoff, done
    return [
      ...polls.map((p) => ({ at: 0, kind: 'poll' as const, ...p })),
      { at: REDUCED.pollMs, kind: 'liftoff' },
      { at: REDUCED.doneMs, kind: 'done' },
    ]
  }
  const pollMs = Math.min(FULL.maxPollMs, FULL.pollBudgetMs / Math.max(1, polls.length))
  const beats: LaunchBeat[] = polls.map((p, i) => ({ at: Math.round(FULL.startMs + i * pollMs), kind: 'poll', ...p }))
  const countStart = FULL.startMs + polls.length * pollMs + 300
  for (let n = 10; n >= 0; n--) beats.push({ at: Math.round(countStart + (10 - n) * FULL.countMs), kind: 'count', n })
  const liftoff = Math.round(countStart + 11 * FULL.countMs)
  beats.push({ at: liftoff, kind: 'liftoff' }, { at: liftoff + FULL.liftoffMs, kind: 'done' })
  return beats
}

/** The line a screen reader hears for the latest beat */
export function beatText(beat: LaunchBeat): string {
  switch (beat.kind) {
    case 'poll':
      return `${beat.system}: ${beat.word}.`
    case 'count':
      return beat.n === 0 ? 'T minus 0. Ignition.' : `T minus ${beat.n}.`
    case 'liftoff':
      return 'Liftoff! The Lunar Ice Mapper mission is under way.'
    case 'done':
      return ''
  }
}
