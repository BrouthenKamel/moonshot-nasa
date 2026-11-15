import type { MinigameDef } from '../contract'
import View from './View'

export default View

export const packTheSix: MinigameDef = {
  id: 'pack-the-six',
  room: 'clean-room',
  title: 'Pack the 6U + Wire the Bus',
  component: View,
}
