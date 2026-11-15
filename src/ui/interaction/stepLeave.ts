import type { DesignStep } from '../../sim/types'

/**
 * A step may hold the player for a moment on the way out: the Craft step plays the carry into the
 * rocket before the next step opens. The step registers one interceptor while it is on screen; the
 * dock's tabs go through goToStep(), which asks it first. An interceptor that returns true has taken
 * over the move (and calls setDesignStep itself when done); false lets the move happen at once.
 */
type Intercept = (to: DesignStep) => boolean

let current: Intercept | null = null

/** Register the interceptor of the step on screen; returns the function that removes it */
export function interceptStepLeave(fn: Intercept): () => void {
  current = fn
  return () => {
    if (current === fn) current = null
  }
}

/** Move to `to`, unless the step on screen takes the move over first */
export function goToStep(to: DesignStep, setDesignStep: (step: DesignStep) => void): void {
  if (current?.(to)) return
  setDesignStep(to)
}
