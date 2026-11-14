import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeStorage } from '../../state/safeStorage'

/**
 * Graphics quality for the space scenes. 'high' adds the post-processing pass (bloom,
 * vignette, filmic tone mapping) and sharper rendering; 'low' draws the scene plainly
 * for slow laptops. The player switches it from the settings button.
 */
export type Quality = 'high' | 'low'

interface GraphicsSettings {
  quality: Quality
  setQuality: (q: Quality) => void
}

const memory = new Map<string, string>()
const fallback = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
}

export const useGraphics = create<GraphicsSettings>()(
  persist(
    (set) => ({
      quality: 'high',
      setQuality: (quality) => set({ quality }),
    }),
    {
      name: 'moonshot-graphics',
      storage: createJSONStorage(() => createSafeStorage(typeof localStorage === 'undefined' ? fallback : localStorage)),
    },
  ),
)

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Frame-rate independent easing factor: `value += (target - value) * ease(dt, k)` */
export const ease = (dt: number, k: number) => 1 - Math.exp(-dt * k)
