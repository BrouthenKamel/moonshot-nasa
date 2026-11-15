import { z } from 'zod'

/**
 * Transfer from the ride's drop-off into the science orbit.
 * How long it takes and how much delta-v it needs is worked out by the
 * calculator from the engine, the orbit and the ride.
 */
export const TransferSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(['direct', 'low_energy']),
  durationTurns: z.number(), // nominal for an impulsive engine; electric spirals take longer
  propulsionType: z.enum(['chemical', 'electric', 'any']),
  /** Worked-out transfers only: days from the drop-off to the Moon */
  days: z.number().optional(),
  /** Worked-out transfers only: speed left over on arrival at the Moon (km/s), what the capture burn removes */
  arrivalExcessKms: z.number().optional(),
  /** Worked-out transfers only: m/s of course corrections on the way */
  courseCorrection: z.number().optional(),
})
export type Transfer = z.infer<typeof TransferSchema>

export const transfers: Transfer[] = [
  {
    id: 'transfer-direct',
    name: 'Direct Transfer',
    description:
      'Straight to the Moon in about five days, then one big braking burn. Needs a strong chemical engine and a lot of propellant.',
    type: 'direct',
    durationTurns: 0,
    propulsionType: 'chemical',
  },
  {
    id: 'transfer-low-energy',
    name: 'Low-Energy Transfer',
    description:
      'A long loop out past the Moon that lets the Sun do most of the braking (CAPSTONE took 4 months). Saves propellant, costs months of running the team. The only way for an ion engine.',
    type: 'low_energy',
    durationTurns: 4,
    propulsionType: 'any',
  },
]

/** Check if a transfer is compatible with a propulsion type */
export function isTransferCompatible(
  transfer: Transfer,
  propulsionType: 'electric' | 'chemical' | 'cold-gas'
): boolean {
  if (transfer.propulsionType === 'any') return true
  if (transfer.propulsionType === 'chemical') return propulsionType !== 'electric'
  return propulsionType === transfer.propulsionType
}

/* ------------------------------------------------------------------ */
/* Transfers of any length (the transfer step's drag)                  */
/* ------------------------------------------------------------------ */

/** Fastest real path: about 4 days, like Apollo */
export const TRANSFER_MIN_DAYS = 4
/** Slowest: a long low-energy loop past the Moon (CAPSTONE took about 4 months) */
export const TRANSFER_MAX_DAYS = 120
/** Up to this a transfer is a direct shot; longer ones are phasing loops and low-energy paths */
export const DIRECT_MAX_DAYS = 20
/** From this long, the Sun and Earth do the braking: the Moon captures the craft at almost no speed */
export const LOW_ENERGY_DAYS = 90

const TIMED = /^transfer-(\d+)d$/

export function timedTransferId(days: number): string {
  return `transfer-${Math.round(Math.min(TRANSFER_MAX_DAYS, Math.max(TRANSFER_MIN_DAYS, days)))}d`
}

/** Days of a worked-out transfer id, or null for the named ones */
export function timedTransferDays(id: string): number | null {
  const m = TIMED.exec(id)
  return m ? Number(m[1]) : null
}

/** Days a transfer takes, for any transfer (the named ones: direct 5, low-energy 4 months) */
export function transferDays(t: Transfer): number {
  return t.days ?? (t.type === 'direct' ? 5 : t.durationTurns * 30)
}

/**
 * A transfer that takes `days` from the drop-off to the Moon. The faster it is, the faster the
 * craft arrives and the bigger the burn to stop: a direct shot arrives at about 0.85 km/s over
 * the Moon's escape speed; from 90 days on, a low-energy path arrives at almost none. Ion engines
 * are too weak to brake a fast arrival, so they need the slow end.
 */
export function timedTransfer(days: number): Transfer {
  const d = Math.round(Math.min(TRANSFER_MAX_DAYS, Math.max(TRANSFER_MIN_DAYS, days)))
  const direct = d <= DIRECT_MAX_DAYS
  const fast = Math.min(1, Math.max(0, (LOW_ENERGY_DAYS - d) / (LOW_ENERGY_DAYS - TRANSFER_MIN_DAYS)))
  return {
    id: timedTransferId(d),
    name: direct ? `Direct (${d} days)` : d < LOW_ENERGY_DAYS ? `Phasing loops (${d} days)` : `Low-energy (${d} days)`,
    description: direct
      ? 'Straight to the Moon, then a big braking burn.'
      : d < LOW_ENERGY_DAYS
        ? 'A few loops round Earth before heading out: a smaller braking burn, more months of cruise.'
        : 'A long loop out past the Moon: the Sun does most of the braking.',
    type: direct ? 'direct' : 'low_energy',
    durationTurns: direct ? 0 : Math.round(d / 30),
    propulsionType: d >= LOW_ENERGY_DAYS ? 'any' : 'chemical',
    days: d,
    arrivalExcessKms: Math.round(0.85 * fast ** 1.3 * 1000) / 1000,
    courseCorrection: Math.round(30 + 20 * (1 - fast)),
  }
}

export function getTransferById(id: string): Transfer | undefined {
  const named = transfers.find((t) => t.id === id)
  if (named) return named
  const days = timedTransferDays(id)
  return days === null ? undefined : timedTransfer(days)
}
