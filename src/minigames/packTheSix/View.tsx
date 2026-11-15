import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { sayRoom } from '../../assets/ihVoice'
import { computeBudgets } from '../../sim/budgets'
import { InteractionLayer } from '../../ui/interaction/InteractionLayer'
import { prefersReducedMotion } from '../../scene/space/quality'
import { preloadPartModels } from '../../scene/factory/partModels'
import type { MinigameProps } from '../contract'
import { PackScene, type InspectTarget } from './PackScene'
import { WireScene } from './WireScene'
import {
  allPacked, autoPack, addWire, buildInsights, buildPatch, choiceOf, loadsOf, removeWire, tryPlace, wiringState,
  type Choice, type Family, type Placement, type Wire,
} from './logic'

type Vec3 = [number, number, number]
type Phase = 'pack' | 'wire'

const POSE: Record<Phase, { pos: Vec3; target: Vec3 }> = {
  pack: { pos: [-0.4, 5.6, 8.0], target: [-0.4, 0.3, 0] },
  wire: { pos: [-0.8, 2.6, 9.6], target: [-0.8, 2.4, 0] },
}

/** The camera: eases to the phase's view, or dollies in on a part the player looks inside */
function Rig({ phase, focus }: { phase: Phase; focus: InspectTarget | null }) {
  const camera = useThree((s) => s.camera)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const look = useRef(new THREE.Vector3(...POSE.pack.target))
  const goalPos = useMemo(() => new THREE.Vector3(), [])
  const goalLook = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    const p = POSE[phase]
    if (focus) {
      const dir = new THREE.Vector3(...p.pos).sub(new THREE.Vector3(...p.target)).normalize()
      goalLook.set(...focus.at)
      goalPos.copy(goalLook).addScaledVector(dir, focus.dist)
    } else {
      goalPos.set(...p.pos)
      goalLook.set(...p.target)
    }
    const k = reduced ? 1 : 1 - Math.exp(-dt * 4.5)
    camera.position.lerp(goalPos, k)
    look.current.lerp(goalLook, k)
    camera.lookAt(look.current)
  })
  return null
}

/** Dev only: lets e2e checks find things on screen and read the state */
function DevProbe({ data }: { data: () => unknown }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __pack?: unknown }).__pack = {
      project: (x: number, y: number, z: number): [number, number] => {
        const v = new THREE.Vector3(x, y, z).project(camera)
        const r = (document.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect()
        return [r.left + ((v.x + 1) / 2) * size.width, r.top + ((1 - v.y) / 2) * size.height]
      },
      data,
    }
    return () => {
      delete (window as unknown as { __pack?: unknown }).__pack
    }
  }, [camera, size, data])
  return null
}

export default function PackTheSix({ design, difficulty, onComplete, onExit, replay }: MinigameProps) {
  const initial = useMemo(() => {
    const choice = choiceOf(design)
    return { choice, ...autoPack(design, choice) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [choice, setChoice] = useState<Choice>(initial.choice)
  const [placements, setPlacements] = useState<Placement[]>(initial.placements)
  const [phase, setPhase] = useState<Phase>('pack')
  const [inspect, setInspect] = useState<InspectTarget | null>(null)
  const started = useRef(Date.now())

  const trial = useMemo(() => ({ ...design, ...choice }), [design, choice])
  const budgets = useMemo(() => computeBudgets(trial, difficulty), [trial, difficulty])
  const loads = useMemo(() => loadsOf(design, choice), [design, choice])
  // a head start: the array, the battery and the core boxes are plugged in; the science is left to the player
  const [wires, setWires] = useState<Wire[]>(() => {
    const l = loadsOf(design, initial.choice)
    const core = l.filter((x) => !design.instruments.includes(x.id)).map((x) => ({ from: 'battery', to: x.id }))
    return [{ from: 'solar', to: 'battery' }, ...core]
  })
  const wiring = useMemo(() => wiringState(wires, loads, budgets.powerGenerated), [wires, loads, budgets.powerGenerated])
  const packed = allPacked(placements, choice)

  useEffect(() => {
    preloadPartModels()
    sayRoom('clean-room', 'intro')
  }, [])

  // 20 s without a touch: Reyes gives the hint
  useEffect(() => {
    let last = Date.now()
    const touch = () => (last = Date.now())
    window.addEventListener('pointerdown', touch)
    const iv = window.setInterval(() => {
      if (Date.now() - last >= 20000) {
        last = Date.now()
        sayRoom('clean-room', 'hint')
      }
    }, 1000)
    return () => {
      window.removeEventListener('pointerdown', touch)
      window.clearInterval(iv)
    }
  }, [])

  useEffect(() => {
    if (!inspect) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setInspect(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inspect])

  const onDropPart = useCallback(
    (family: Family, id: string, cell: { col: number; row: number }) => {
      setPlacements((cur) => {
        const r = tryPlace(cur, { id, family }, cell)
        return r.ok ? r.placements : cur
      })
      setChoice((c) => ({ ...c, [family]: id }))
      setInspect(null)
    },
    [],
  )
  const onDropSolar = useCallback((id: string) => {
    setChoice((c) => ({ ...c, solar: id }))
    setInspect(null)
  }, [])

  const finish = () => {
    sayRoom('clean-room', 'success')
    onComplete({ patch: buildPatch(choice), insights: buildInsights(budgets), durationS: Math.round((Date.now() - started.current) / 1000) })
  }

  const line =
    phase === 'pack'
      ? packed
        ? 'Everything fits. Check the scale and the Δv ruler, then wire it.'
        : 'Drag parts from the shelf into the frame. Click any part to look inside.'
      : !wiring.solarLinked
        ? 'Plug the solar array into the battery.'
        : wiring.unpowered.length > 0
          ? `Plug the rest into the battery: ${wiring.unpowered.length} left.`
          : wiring.shortfall > 0
            ? `The bus is ${wiring.shortfall.toFixed(0)} W short and flickers. Go back and pack a bigger array.`
            : 'Everything is powered. Seal the craft.'

  const dataRef = useRef<() => unknown>(() => null)
  dataRef.current = () => ({ choice, placements, phase, wires, wiring, packed, loads: loads.map((l) => l.id) })
  const getData = useCallback(() => dataRef.current(), [])

  return (
    <div className="relative h-full w-full bg-ink-0" data-testid="pack-the-six" onPointerDown={(e) => e.target === e.currentTarget && setInspect(null)}>
      <Canvas
        camera={{ fov: 40, position: POSE.pack.pos, near: 0.1, far: 80 }}
        dpr={[1, 1.5]}
        onPointerMissed={() => setInspect(null)}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#07090d']} />
        <Suspense fallback={null}>
          <Rig phase={phase} focus={inspect} />
          {phase === 'pack' ? (
            <PackScene choice={choice} placements={placements} budgets={budgets} onDropPart={onDropPart} onDropSolar={onDropSolar} onInspect={setInspect} />
          ) : (
            <WireScene
              loads={loads}
              wires={wires}
              state={wiring}
              budgets={budgets}
              onWire={(from, to) => setWires((w) => addWire(w, from, to, loads.map((l) => l.id)))}
              onUnwire={(from, to) => setWires((w) => removeWire(w, from, to))}
              onInspect={setInspect}
            />
          )}
          <DevProbe data={getData} />
        </Suspense>
      </Canvas>

      <InteractionLayer />

      {/* HUD 1 of 3: where to go back, and the one line that says what to do */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4">
        <div className="pointer-events-auto flex max-w-[34rem] items-center gap-3 rounded bg-ink-0/75 px-3 py-2">
          <button type="button" className="fp-btn-ghost text-[12px]" data-testid="pack-back" onClick={() => (phase === 'wire' ? (setInspect(null), setPhase('pack')) : onExit())}>
            {phase === 'wire' ? '← Repack' : '← Campus'}
          </button>
          <p className="text-sm text-paper" data-testid="pack-line">
            {line}
          </p>
        </div>
        {replay && (
          <button type="button" className="fp-btn-ghost pointer-events-auto rounded bg-ink-0/75 text-[12px]" data-testid="room-skip" onClick={() => onComplete({ patch: {}, insights: [], durationS: Math.round((Date.now() - started.current) / 1000) })}>
            Skip
          </button>
        )}
      </div>

      {/* HUD 2 of 3: look-inside caption (only while looking) */}
      {inspect && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
          <button type="button" className="pointer-events-auto max-w-md rounded bg-ink-0/85 px-4 py-2 text-left" data-testid="inspect-caption" onClick={() => setInspect(null)}>
            <div className="fp-label">{inspect.fact.title}</div>
            <div className="text-sm text-paper">{inspect.fact.line}</div>
            <div className="fp-data text-kapton text-base">{inspect.fact.value}</div>
          </button>
        </div>
      )}

      {/* HUD 3 of 3: the one next step */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
        {phase === 'pack' ? (
          <button type="button" className="fp-btn-primary pointer-events-auto" data-testid="pack-next" disabled={!packed} onClick={() => (setInspect(null), setPhase('wire'))}>
            Wire the bus →
          </button>
        ) : (
          <button type="button" className="fp-btn-primary pointer-events-auto" data-testid="room-complete" disabled={!wiring.complete} onClick={finish}>
            {wiring.shortfall > 0 ? 'Seal it anyway' : 'Seal the craft'}
          </button>
        )}
      </div>
    </div>
  )
}
