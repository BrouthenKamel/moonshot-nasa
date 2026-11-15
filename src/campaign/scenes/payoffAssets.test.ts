import { describe, expect, it } from 'vitest'
import { assets } from '../../assets'
import { PAYOFF_ASSETS } from './payoffAssets'

describe('PAYOFF_ASSETS', () => {
  it('names only assets that exist, with the right kind', () => {
    const kinds = new Map(assets.map((a) => [a.id as string, a.kind]))
    for (const [kind, list] of Object.entries(PAYOFF_ASSETS)) {
      for (const t of list.textures) expect(kinds.get(t), `${kind}: ${t}`).toBe('texture')
      for (const m of list.models) expect(kinds.get(m), `${kind}: ${m}`).toBe('model')
    }
  })
})
