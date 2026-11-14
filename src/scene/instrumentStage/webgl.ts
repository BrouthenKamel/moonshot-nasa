let webgl: boolean | null = null

/** True when this browser can draw the 3D stage. False on the server and in tests. */
export function canUseWebGL(): boolean {
  if (typeof document === 'undefined') return false
  if (webgl === null) {
    try {
      const c = document.createElement('canvas')
      webgl = !!(c.getContext('webgl2') ?? c.getContext('webgl'))
    } catch {
      webgl = false
    }
  }
  return webgl
}
