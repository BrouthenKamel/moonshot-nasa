import { useMemo, useState, useSyncExternalStore } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'
import { getOrbitById } from '../../data/orbits'
import { useDropTarget } from '../../ui/interaction/drag'
import { Scene } from './Scene'
import { Effects } from '../space/Effects'
import { ForecastPanel, ReadOuts, TitleLine } from './Overlays'
import { InstrumentBar } from './InstrumentBar'
import { DesignDeltaLine } from '../../viz/DesignDeltaLine'
import { satHeight, type Pass } from './frame'
import { stageModel } from './stageModel'
import { instrumentLock, toggleUnlocked } from './labLocks'
import { useAgencyStore } from '../../state/agencyStore'

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
  const previewPatch = useUiStore((s) => s.previewPatch)
  const difficulty = useGameStore((s) => s.difficulty)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const day = useAgencyStore((s) => s.day)

  const [dragged, setDragged] = useState(false)
  const [overShadow, setOverShadow] = useState(false)
  const still = useSyncExternalStore(subscribeMotion, reducedMotion, () => false)
  const [pass] = useState<Pass>(() => ({ offset: 18 }))
  const [camera] = useState(() => ({
    position: [2.6, satHeight(getOrbitById(design.orbit)?.altitude ?? 15) + 1.2, 6.5] as [number, number, number],
    fov: 55,
    near: 0.1,
    far: 3000,
  }))

  const liveDesign = useMemo(() => (previewPatch ? { ...design, ...previewPatch } : design), [design, previewPatch])
  const model = useMemo(() => stageModel(liveDesign, difficulty), [liveDesign, difficulty])
  const h = satHeight(model.altitudeKm)

  const cradleDrop = useDropTarget({
    id: 'lab:cradle',
    accepts: ['instruments'],
    refuse: (p) => {
      const lock = instrumentLock(p.value, day)
      return lock.locked ? lock.text : null
    },
    onDrop: (p) => {
      if (!design.instruments.includes(p.value)) {
        updateDesign({ instruments: toggleUnlocked(design.instruments, p.value, day) })
      }
    },
  })

  return (
    <div className="mb-4">
      <TitleLine />
      <div
        {...cradleDrop.handlers}
        onPointerDownCapture={() => setDragged(true)}
        className={`relative h-[46vh] min-h-[340px] overflow-hidden border bg-[#03050a] transition-colors ${
          cradleDrop.state.over
            ? cradleDrop.state.ok
              ? 'border-kapton'
              : 'border-nogo'
            : cradleDrop.state.compatible
              ? 'border-dashed border-rule-strong'
              : 'border-slate-800'
        }`}
      >
        <Canvas dpr={[1, 1.75]} camera={camera}>
          <Scene pass={pass} h={h} views={model.instruments} still={still} onShadow={setOverShadow} />
          <Effects preset="space" bloom={0.35} />
        </Canvas>
        <ForecastPanel forecast={model.forecast} altitudeKm={model.altitudeKm} />
        <ReadOuts views={model.instruments} overShadow={overShadow} />
        {/* The hint goes after the first press, so it never covers a callout once the player knows */}
        {!dragged && (
          <div className="hud-fade pointer-events-none absolute right-3 bottom-3 hidden rounded bg-slate-950/70 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500 sm:block">
            drag to look around
          </div>
        )}
      </div>
      <InstrumentBar
        chosen={design.instruments}
        day={day}
        onToggle={(id) => updateDesign({ instruments: toggleUnlocked(design.instruments, id, day) })}
      />
      <DesignDeltaLine className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-slate-900/70 px-3 py-2 text-xs" />
    </div>
  )
}
