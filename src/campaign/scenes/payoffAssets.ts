import type { ModelId, TextureId } from '../../assets'
import type { PayoffKind } from './types'

/**
 * What each payoff show loads, so it can be fetched before the show starts (a cold load used to
 * show a black frame while the textures came in). Keep in step with the scenes: payoffAssets.test.ts
 * checks every id is in the asset manifest.
 */
export const PAYOFF_ASSETS: Record<PayoffKind, { textures: TextureId[]; models: ModelId[] }> = {
  'ice-map': { textures: ['texture.stars', 'texture.moon-color', 'texture.moon-normal', 'texture.moon-ice'], models: ['model.env-lro'] },
  'moon-landing': { textures: ['texture.stars', 'texture.lunar-crater-closeup'], models: ['model.env-lunar-lander'] },
  'moon-base': {
    textures: ['texture.stars', 'texture.lunar-crater-closeup', 'texture.earth-day', 'texture.earth-night'],
    models: ['model.env-astronaut'],
  },
  'mars-base': { textures: ['texture.stars'], models: [] },
}
