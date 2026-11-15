import type { MinigameDef } from '../contract'
import CatchThePass from './View'

export const catchThePassDef: MinigameDef = {
  id: 'catch-the-pass',
  room: 'ground-station',
  title: 'Catch the Pass',
  component: CatchThePass,
}

export type { MinigameDef }
export default CatchThePass
