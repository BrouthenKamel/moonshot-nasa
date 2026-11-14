import { getOrbitById } from '../data/orbits'
import { computeBudgets } from './budgets'
import type { OperatingMode, SimState } from './types'

/**
 * Choices in flight (F3, Jakob 14 Nov): what the player can pick for the next
 * science month, each with one plain line on its effect, worked out from the
 * craft's own numbers. simulate.ts applies them (scienceTurnStep).
 */

/** What an extra ground pass costs; simulate.ts charges this */
export const EXTRA_PASS_COST = 0.1
/** How much more the link sends with the extra pass */
export const EXTRA_PASS_LINK = 1.5

export interface MonthMode {
  mode: OperatingMode
  label: string
  effect: string
}

export interface MonthOptions {
  modes: MonthMode[]
  extraPass: { label: string; effect: string; affordable: boolean }
}

const mb = (x: number) => `${Math.round(x)} MB`
const wh = (x: number) => `${Math.round(x)} Wh`

export function monthOptions(state: SimState): MonthOptions {
  const b = computeBudgets(state.design, state.difficulty)
  const f = state.flight
  const eclipseHours = getOrbitById(state.design.orbit)?.eclipseHours ?? 0
  const made = b.dataPerTurn * f.scienceFactor
  const link = b.downlinkPerTurn
  const onBoard = f.science.stored
  const store = b.storageCapacity
  const need = (instrumentShare: number) => (b.busPower + b.instrumentPower * instrumentShare) * eclipseHours
  const battery = (instrumentShare: number) =>
    `Battery: ${wh(need(instrumentShare))} needed through an eclipse, ${wh(b.batteryUsableWh)} usable.`
  const overflow = (x: number) =>
    x > link ? ` The link cannot keep up: ${mb(x - link)} a month goes to storage (${mb(onBoard)} of ${mb(store)} used).` : ''

  const modes: MonthMode[] = [
    {
      mode: 'full-science',
      label: 'Full science',
      effect: `Instruments make about ${mb(made)}; the link sends up to ${mb(link)}.${overflow(made)} ${battery(1)}`,
    },
    {
      mode: 'reduced',
      label: 'Reduced',
      effect: `Instruments run half the time: about ${mb(made / 2)} against the ${mb(link)} link, and less ice mapped. ${battery(0.5)}`,
    },
    {
      mode: 'safe-mode',
      label: 'Safe mode',
      effect: `No science this month; the month still counts. Only the bus runs: ${wh(need(0))} through an eclipse. The link still sends ${mb(Math.min(onBoard, link))} stored on board.`,
    },
  ]
  const money = f.main + Math.max(0, f.reserve)
  return {
    modes,
    extraPass: {
      label: `Buy an extra ground pass (${EXTRA_PASS_COST} M)`,
      effect: `The link sends up to ${mb(link * EXTRA_PASS_LINK)} instead of ${mb(link)}. ${money.toFixed(1)} M left (reserve ${Math.max(0, f.reserve).toFixed(1)} M).`,
      affordable: money >= EXTRA_PASS_COST,
    },
  }
}
