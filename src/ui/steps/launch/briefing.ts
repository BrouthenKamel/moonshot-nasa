import { rides, getRideById } from '../../../data/rides'
import { transfers } from '../../../data/transfers'

/** Which engines a ride takes, in words */
export function engineLine(rideId: string): string {
  const ride = getRideById(rideId)
  if (!ride) return ''
  if (ride.electricCompatible && ride.chemicalCompatible) return 'Takes ion and chemical engines.'
  if (ride.electricCompatible) return 'Only an ion engine can climb out from here.'
  return 'Chemical engines only.'
}

/** The words for a ride or transfer: its description, and for a ride the engines it takes */
export function choiceBriefing(id: string): { name: string; text: string } | null {
  const ride = rides.find((r) => r.id === id)
  if (ride) return { name: `${ride.name} (fee $${ride.cost.toFixed(1)}M)`, text: `${ride.description} ${engineLine(ride.id)}` }
  const t = transfers.find((x) => x.id === id)
  if (t) return { name: t.name, text: t.description }
  return null
}
