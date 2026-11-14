import { choiceArt } from '../../assets/catalogueArt'
import { preloadModel } from '../../assets/models'
import { allParts } from '../../data/parts'

/** Every part model the bay can show, fetched as soon as the bay opens so swaps are instant. */
let preloaded = false
export function preloadPartModels() {
  if (preloaded) return
  preloaded = true
  for (const p of allParts) {
    const model = choiceArt(p.id)?.model
    if (model && p.volume > 0) preloadModel(model)
  }
}
