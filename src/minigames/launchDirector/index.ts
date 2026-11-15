import type { MinigameDef } from '../contract'
import LaunchDirector from './View'

export default LaunchDirector

export const minigame: MinigameDef = {
  id: 'launch-director',
  room: 'mission-control',
  title: 'Launch Director',
  component: LaunchDirector,
}
