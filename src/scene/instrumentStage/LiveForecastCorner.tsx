import { useMemo, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'
import { ForecastCorner } from './Overlays'
import { stageModel } from './stageModel'

/** The Science stage's forecast dashboard from the live design, without the 3D scene (shown while it loads) */
export function LiveForecastCorner({ topLeft }: { topLeft?: ReactNode }) {
  const design = useGameStore((s) => s.design)
  const previewPatch = useUiStore((s) => s.previewPatch)
  const difficulty = useGameStore((s) => s.difficulty)
  const live = useMemo(() => (previewPatch ? { ...design, ...previewPatch } : design), [design, previewPatch])
  const model = useMemo(() => stageModel(live, difficulty), [live, difficulty])
  return <ForecastCorner forecast={model.forecast} altitudeKm={model.altitudeKm} topLeft={topLeft} />
}
