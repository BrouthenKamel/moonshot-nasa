import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { useThree } from '@react-three/fiber'
import { ToneMappingMode } from 'postprocessing'
import { useLayoutEffect } from 'react'
import { NoToneMapping } from 'three'
import { useGraphics } from './quality'

export type EffectsPreset = 'space' | 'interior' | 'night' | 'day'

/**
 * Per-scene tuning. Bloom only catches genuinely bright things (sun, plume, ice glow,
 * screens): the threshold sits at or above 1 so lit panels never wash out.
 */
const PRESETS: Record<EffectsPreset, { bloom: number; threshold: number; smoothing: number; radius: number; vignette: number; offset: number }> = {
  space: { bloom: 1.15, threshold: 0.92, smoothing: 0.35, radius: 0.8, vignette: 0.65, offset: 0.22 },
  interior: { bloom: 0.75, threshold: 0.98, smoothing: 0.28, radius: 0.68, vignette: 0.48, offset: 0.26 },
  night: { bloom: 0.95, threshold: 0.9, smoothing: 0.32, radius: 0.75, vignette: 0.68, offset: 0.22 },
  day: { bloom: 0.45, threshold: 1.1, smoothing: 0.22, radius: 0.58, vignette: 0.38, offset: 0.3 },
}

/**
 * While the composer runs it does the ACES pass itself, so the renderer must not tone map
 * too (that would apply the curve twice). Restores the renderer's own setting on unmount,
 * so quality='low' keeps the Canvas default.
 */
function RendererToneMappingOff() {
  const gl = useThree((s) => s.gl)
  useLayoutEffect(() => {
    const prev = gl.toneMapping
    gl.toneMapping = NoToneMapping
    return () => {
      gl.toneMapping = prev
    }
  }, [gl])
  return null
}

/**
 * The shared finishing pass: glow on bright things, darker corners, filmic colour.
 * Drawn only at 'high' quality; at 'low' the scene uses the renderer's own tone mapping.
 */
export function Effects({ bloom, vignette, preset = 'space' }: { bloom?: number; vignette?: number; preset?: EffectsPreset }) {
  const quality = useGraphics((s) => s.quality)
  if (quality !== 'high') return null
  const p = PRESETS[preset]
  return (
    <>
      <RendererToneMappingOff />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={bloom ?? p.bloom} luminanceThreshold={p.threshold} luminanceSmoothing={p.smoothing} radius={p.radius} />
        <Vignette offset={p.offset} darkness={vignette ?? p.vignette} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  )
}
