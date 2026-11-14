import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useGraphics } from './quality'

/**
 * The shared finishing pass: glow on bright things, darker corners, filmic colour.
 * Drawn only at 'high' quality; at 'low' the scene uses the renderer's own tone mapping.
 */
export function Effects({ bloom = 0.9, vignette = 0.75 }: { bloom?: number; vignette?: number }) {
  const quality = useGraphics((s) => s.quality)
  if (quality !== 'high') return null
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={bloom} luminanceThreshold={1} luminanceSmoothing={0.3} radius={0.75} />
      <Vignette offset={0.2} darkness={vignette} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
