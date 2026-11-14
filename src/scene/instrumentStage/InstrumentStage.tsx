import { useMemo, useState, useSyncExternalStore } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGameStore } from '../../state/gameStore'
import { getOrbitById } from '../../data/orbits'
import { Scene } from './Scene'
import { ForecastPanel, LabDials, ReadOuts } from './Overlays'
import { InstrumentBar } from './InstrumentBar'
import { DesignDeltaLine } from '../../viz/DesignDeltaLine'
import { satHeight, type Pass } from './frame'
import { stageModel, toggleInstrument, whatIfFromDesign, type WhatIf } from './stageModel'

const REDUCE_MOTION = '(prefers-reduced-motion: reduce)'
const subscribeMotion = (onChange: () => void) => {
  const q = window.matchMedia(REDUCE_MOTION)
  q.addEventListener('change', onChange)
  return () => q.removeEventListener('change', onChange)
}
const reducedMotion = () => window.matchMedia(REDUCE_MOTION).matches

/** The Research Lab simulator: a chase view of the satellite measuring the south pole. */
export default function InstrumentStage() {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const updateDesign = useGameStore((s) => s.updateDesign)

  // The dials start from the design each time the player enters the lab.
  const [whatIf, setWhatIf] = useState<WhatIf>(() => whatIfFromDesign(design))
  const [overShadow, setOverShadow] = useState(false)
  const still = useSyncExternalStore(subscribeMotion, reducedMotion, () => false)
  const [pass] = useState<Pass>(() => ({ offset: 18 }))
  const [camera] = useState(() => ({
    position: [2.6, satHeight(getOrbitById(design.orbit)?.altitude ?? 15) + 1.2, 6.5] as [number, number, number],
    fov: 55,
    near: 0.1,
    far: 3000,
  }))

  const model = useMemo(() => stageModel(design, difficulty, whatIf), [design, difficulty, whatIf])
  const h = satHeight(model.altitudeKm)

  return (
    <div className="mb-4">
      <div className="relative h-[66vh] min-h-[460px] overflow-hidden rounded-t-xl border border-slate-800 bg-black">
        <Canvas dpr={[1, 1.75]} camera={camera}>
          <Scene pass={pass} h={h} views={model.instruments} still={still} onShadow={setOverShadow} />
        </Canvas>
        <ForecastPanel forecast={model.forecast} />
        <LabDials whatIf={whatIf} onChange={(change) => setWhatIf((w) => ({ ...w, ...change }))} />
        <ReadOuts views={model.instruments} overShadow={overShadow} />
        <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-slate-950/70 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500">
          Research Lab · drag to look around
        </div>
      </div>
      <InstrumentBar
        chosen={design.instruments}
        onToggle={(id) => updateDesign({ instruments: toggleInstrument(design.instruments, id) })}
      />
      <DesignDeltaLine className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-slate-900/70 px-3 py-2 text-xs" />
    </div>
  )
}
