import { describe, it, expect } from 'vitest'
import { TILE_LENGTH } from './ground'
import { FAR_PLANE_NEAR_EDGE, TILE_COPIES } from './frame'

describe('ground cover', () => {
  it('leaves no gap between the moving tiles and the far plane at any offset', () => {
    const farthest = Math.max(...TILE_COPIES)
    for (let offset = 0; offset < TILE_LENGTH; offset += 0.5) {
      const farEdge = offset - (farthest + 1) * TILE_LENGTH
      expect(farEdge).toBeLessThanOrEqual(FAR_PLANE_NEAR_EDGE)
    }
  })
})
