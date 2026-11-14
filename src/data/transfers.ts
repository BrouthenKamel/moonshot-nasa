import { z } from 'zod'

/** Transfer trajectory options */
export const TransferSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(['direct', 'low-energy', 'hybrid']),
  durationTurns: z.number(),
  deltaVMultiplier: z.number(), // multiplier on ride's requiredDeltaV
  propulsionType: z.enum(['chemical', 'electric', 'any']),
  riskFactor: z.number(), // 1.0 = normal, higher = riskier
})
export type Transfer = z.infer<typeof TransferSchema>

export const transfers: Transfer[] = [
  {
    id: 'transfer-direct',
    name: 'Direct Transfer',
    description:
      'Fast chemical burn trajectory. Arrives in about 1 turn but uses more fuel.',
    type: 'direct',
    durationTurns: 1,
    deltaVMultiplier: 1.0,
    propulsionType: 'chemical',
    riskFactor: 1.0,
  },
  {
    id: 'transfer-low-energy',
    name: 'Low-Energy Transfer',
    description:
      'Weak stability boundary trajectory like Lunar IceCube. Takes 3-4 turns but uses much less fuel.',
    type: 'low-energy',
    durationTurns: 4,
    deltaVMultiplier: 0.4, // WSB transfers need much less delta-v
    propulsionType: 'electric',
    riskFactor: 1.2, // slightly riskier due to long duration
  },
  {
    id: 'transfer-hybrid',
    name: 'Hybrid Spiral',
    description:
      'Electric spiral with chemical capture. Moderate duration, efficient fuel use.',
    type: 'hybrid',
    durationTurns: 2,
    deltaVMultiplier: 0.7,
    propulsionType: 'any',
    riskFactor: 1.1,
  },
]

/** Check if a transfer is compatible with a propulsion type */
export function isTransferCompatible(
  transfer: Transfer,
  propulsionType: 'electric' | 'chemical' | 'cold-gas'
): boolean {
  if (transfer.propulsionType === 'any') return propulsionType !== 'cold-gas'
  if (transfer.propulsionType === 'chemical') return propulsionType === 'chemical'
  if (transfer.propulsionType === 'electric') return propulsionType === 'electric'
  return false
}

export function getTransferById(id: string): Transfer | undefined {
  return transfers.find((t) => t.id === id)
}

export function getCompatibleTransfers(
  propulsionType: 'electric' | 'chemical' | 'cold-gas'
): Transfer[] {
  return transfers.filter((t) => isTransferCompatible(t, propulsionType))
}
