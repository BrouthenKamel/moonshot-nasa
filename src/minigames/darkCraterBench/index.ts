import type { MinigameDef } from '../contract'
import DarkCraterBench from './View'

export default DarkCraterBench

export const darkCraterBench: MinigameDef = {
  id: 'dark-crater-bench',
  room: 'science-lab',
  title: 'Dark Crater Bench',
  component: DarkCraterBench,
}
