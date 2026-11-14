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

export function getTransferById(id: string): Transfer | undefined {
  return transfers.find((t) => t.id === id)
}
