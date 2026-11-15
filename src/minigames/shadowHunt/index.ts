import type { MinigameDef, MinigameProps } from '../contract'
import { ShadowHuntView } from './View'
import type { FC } from 'react'

const ShadowHunt: FC<MinigameProps> = ShadowHuntView

export const shadowHunt: MinigameDef = {
  id: 'shadow-hunt',
  room: 'briefing',
  title: 'Shadow Hunt',
  component: ShadowHunt,
}

export default ShadowHunt
