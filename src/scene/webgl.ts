let supported: boolean | null = null

/**
 * True when this browser can give us a WebGL context. False on the server and in tests.
 * The browser is tested once and the answer reused: screens call this while rendering, and
 * every test opens a WebGL context; browsers keep only a few and drop the oldest, which can
 * be a 3D view that is on screen.
 */
export function canUseWebGL(): boolean {
  if (typeof document === 'undefined') return false
  if (supported === null) {
    try {
      const c = document.createElement('canvas')
      supported = !!(c.getContext('webgl2') || c.getContext('webgl'))
    } catch {
      supported = false
    }
  }
  return supported
}
