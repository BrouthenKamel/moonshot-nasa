import { describe, it, expect, afterEach, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

function fakeDocument(supportsWebGL: boolean) {
  const createElement = vi.fn(() => ({ getContext: () => (supportsWebGL ? {} : null) }))
  vi.stubGlobal('document', { createElement })
  return createElement
}

describe('canUseWebGL', () => {
  it('is false on the server', async () => {
    const { canUseWebGL } = await import('./webgl')
    expect(canUseWebGL()).toBe(false)
  })

  it('tests the browser once and reuses the answer', async () => {
    const createElement = fakeDocument(true)
    const { canUseWebGL } = await import('./webgl')
    expect(canUseWebGL()).toBe(true)
    expect(canUseWebGL()).toBe(true)
    expect(canUseWebGL()).toBe(true)
    expect(createElement).toHaveBeenCalledTimes(1)
  })

  it('reports a browser without WebGL', async () => {
    fakeDocument(false)
    const { canUseWebGL } = await import('./webgl')
    expect(canUseWebGL()).toBe(false)
  })
})
