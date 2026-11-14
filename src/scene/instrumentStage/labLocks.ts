/**
 * Which instruments the Research Lab has unlocked yet. Pure: the level rule and the
 * unlock table live in src/data/agency.ts, next to the base's own text about them.
 */
import { buildings, instrumentLabLevel, researchLabLevel } from '../../data/agency'
import { toggleInstrument } from './stageModel'

export interface InstrumentLock {
  id: string
  neededLevel: number
  labLevel: number
  locked: boolean
  text: string // why it is locked and where to upgrade; empty when open
}

/** unlocks: Research Lab level per instrument; the MVP table locks nothing. */
export function instrumentLock(id: string, day: number, unlocks: Record<string, number> = instrumentLabLevel): InstrumentLock {
  const neededLevel = unlocks[id] ?? 1
  const labLevel = researchLabLevel(day)
  const locked = labLevel < neededLevel
  if (!locked) return { id, neededLevel, labLevel, locked, text: '' }
  const up = buildings.find((b) => b.id === 'research-lab')?.upgrade
  const where =
    up && up.toLevel >= neededLevel && day < up.endDay
      ? `upgrade done in ${Math.ceil(up.endDay - day)} days at the agency base; let time run with ▶`
      : 'upgrade it at the agency base'
  return { id, neededLevel, labLevel, locked, text: `Needs Research Lab LV ${neededLevel} · now LV ${labLevel} · ${where}` }
}

/** Locked instruments a design already holds (an imported code, a past run, an earlier save). */
export function lockedInDesign(
  instruments: string[],
  day: number,
  unlocks: Record<string, number> = instrumentLabLevel
): InstrumentLock[] {
  return instruments.map((id) => instrumentLock(id, day, unlocks)).filter((l) => l.locked)
}

/** Like toggleInstrument, but a locked instrument cannot be added. Removing one is always allowed. */
export function toggleUnlocked(
  current: string[],
  id: string,
  day: number,
  unlocks: Record<string, number> = instrumentLabLevel
): string[] {
  if (!current.includes(id) && instrumentLock(id, day, unlocks).locked) return current
  return toggleInstrument(current, id)
}
