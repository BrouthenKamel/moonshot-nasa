import type { MinigameDef } from '../contract'
import EclipseSurvival from './View'

export const eclipseSurvivalDef: MinigameDef = {
  id: 'eclipse-survival',
  room: 'thermal-vac',
  title: 'Eclipse Survival',
  component: EclipseSurvival,
}

export default EclipseSurvival
export type { MinigameDef }
