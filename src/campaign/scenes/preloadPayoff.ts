import { useTexture } from '@react-three/drei'
import { assetUrl } from '../../assets'
import { preloadModel } from '../../assets/models'
import { PAYOFF_ASSETS } from './payoffAssets'
import type { PayoffKind } from './types'

const started = new Set<PayoffKind>()

/** Start fetching a payoff show's textures and models into the loaders' caches (once per kind) */
export function preloadPayoff(kind: PayoffKind) {
  if (started.has(kind) || typeof window === 'undefined') return
  started.add(kind)
  try {
    for (const t of PAYOFF_ASSETS[kind].textures) useTexture.preload(assetUrl(t))
    for (const m of PAYOFF_ASSETS[kind].models) preloadModel(m)
  } catch {
    // Preloading is a nicety: the show still loads what it needs when it starts
  }
}
