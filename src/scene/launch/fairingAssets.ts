import { preloadModel } from '../../assets/models'
import type { ModelId } from '../../assets/manifest'

const FAIRING_MODELS: ModelId[] = [
  'model.sc-fairing_half',
  'model.sc-separation_ring',
  'model.sc-deployer_6u_closed',
  'model.sc-deployer_6u_open',
  'model.cubesat-6u',
]

export function preloadFairingRide() {
  for (const id of FAIRING_MODELS) preloadModel(id)
}
