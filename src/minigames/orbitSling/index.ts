import type { MinigameDef } from '../contract'
import OrbitSling from './View'

export default OrbitSling

export const orbitSling: MinigameDef = {
  id: 'orbit-sling',
  room: 'flight-dynamics',
  title: 'Orbit Sling',
  component: OrbitSling,
}
