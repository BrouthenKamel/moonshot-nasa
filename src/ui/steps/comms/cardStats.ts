import type { ChoiceStat } from '../../kit/ChoiceCard'

/**
 * Screen budget (Jakob, 15 Nov): a Comms card shows one number, the one its tray is about
 * (kbps for a radio, hours a day for a station). The rest of its stats show on hover.
 */
export function cardStat(stats: ChoiceStat[]): ChoiceStat[] {
  return stats.slice(0, 1)
}

/** The stats a card keeps off its face, as one hover line: "Moon: Reaches · Mass: 0.3 kg" */
export function hoverStats(stats: ChoiceStat[]): string {
  return stats
    .slice(1)
    .map((s) => `${s.label}: ${s.value}`)
    .join(' · ')
}
