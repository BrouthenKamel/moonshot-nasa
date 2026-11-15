import type { MinigameDef } from '../contract'
import RideshareManifest from './View'

export default RideshareManifest

export const minigame: MinigameDef = {
  id: 'rideshare-manifest',
  room: 'launch-hangar',
  title: 'Rideshare Manifest',
  component: RideshareManifest,
}
