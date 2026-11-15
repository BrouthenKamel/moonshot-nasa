import { Suspense, useCallback, useEffect, useRef, useState, type FC, type PointerEvent as ReactPointerEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import { audio } from '../../assets/audio'
import { sayRoom } from '../../assets/ihVoice'
import { difficultyPresets, type Difficulty } from '../../data/brief'
import type { MinigameProps } from '../contract'
import { Envelopes, JarScene } from './Desk'
import {
  AXIAL_TILT_DEG,
  PSR_GOAL,
  buildResult,
  clampLat,
  coinsFromPercent,
  initialTagState,
  markArc,
  sweepComplete,
  sweepCoverage,
  tagSite,
  updateSeenLit,
  wrapLon,
  type Site,
  type TagState,
} from './logic'
import { MoonTable, type Sun } from './MoonTable'

type Phase = 'shadow' | 'envelopes' | 'jar'

const HINT_AFTER_MS = 20_000
/** Degrees of sun longitude per pixel dragged, and degrees of latitude per pixel */
const LON_PER_PX = 0.45
const LAT_PER_PX = 0.012

const KIND_LABEL: Record<Site['kind'], string> = { crater: 'Crater', rim: 'Crater rim', peak: 'High ground' }

export const ShadowHuntView: FC<MinigameProps> = ({ design, onComplete, onExit, replay }) => {
  const [phase, setPhase] = useState<Phase>('shadow')
  const [sun, setSun] = useState<Sun>({ lon: 200, lat: 0 })
  const target = useRef<Sun>({ lon: 200, lat: 0 })
  const lastLon = useRef(200)
  const [tag, setTag] = useState<TagState>(initialTagState)
  const [seenLit, setSeenLit] = useState<string[]>([])
  const [selected, setSelected] = useState<Site | null>(null)
  const [note, setNote] = useState('Drag to swing the Sun around the Moon.')
  const [opened, setOpened] = useState<Difficulty | null>(null)
  const [inJar, setInJar] = useState<number[]>(() => Array.from({ length: coinsFromPercent(design.planning.reservePercent) }, (_, i) => i))
  const t0 = useRef(0)
  const lastPoke = useRef(0)
  const hinted = useRef(false)
  const done = useRef(false)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const sweptWas = useRef(false)
  const tiltNoted = useRef(false)

  const budgetCap = difficultyPresets.engineer.budgetCap
  const poke = useCallback(() => {
    lastPoke.current = performance.now()
  }, [])

  useEffect(() => {
    t0.current = performance.now()
    lastPoke.current = t0.current
    sayRoom('briefing', 'intro')
  }, [])

  // Reyes nudges after 20 s of nothing
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!hinted.current && performance.now() - lastPoke.current > HINT_AFTER_MS) {
        hinted.current = true
        sayRoom('briefing', 'hint')
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    hinted.current = false
    lastPoke.current = performance.now()
  }, [phase])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The sun has eased to a new place: remember the arc swept and which sites got light
  const onSun = useCallback((s: Sun) => {
    setSun(s)
    setTag((t) => {
      const swept = markArc(t.swept, lastLon.current, s.lon)
      return swept.some((b, i) => b !== t.swept[i]) ? { ...t, swept } : t
    })
    lastLon.current = s.lon
    setSeenLit((seen) => updateSeenLit(seen, s.lon, s.lat))
  }, [])

  useEffect(() => {
    if (!sweepComplete(tag.swept) || sweptWas.current) return
    sweptWas.current = true
    audio.play('sfx.ih-dish-servo')
    setNote('Full lap. Tap the craters that never saw the Sun and tag three.')
  }, [tag.swept])

  const down = (e: ReactPointerEvent) => {
    if (phase !== 'shadow') return
    drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
    poke()
  }
  const move = (e: ReactPointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }
    target.current = {
      lon: wrapLon(target.current.lon + dx * LON_PER_PX),
      lat: clampLat(target.current.lat - dy * LAT_PER_PX),
    }
    if (!tiltNoted.current && Math.abs(target.current.lat) >= AXIAL_TILT_DEG - 0.05) {
      tiltNoted.current = true
      setNote('That is the Moon’s biggest tilt, 1.5 degrees. The Sun barely rises at the pole.')
    }
    poke()
  }
  const up = () => {
    drag.current = null
  }

  const select = (s: Site) => {
    poke()
    setSelected(s)
    audio.play('sfx.ih-part-click')
  }

  const doTag = () => {
    if (!selected) return
    const r = tagSite(tag, selected.id)
    setTag(r.state)
    setNote(r.message)
    poke()
    if (r.outcome === 'correct') {
      audio.play('sfx.ih-part-click')
      if (r.done) {
        window.setTimeout(() => {
          setSelected(null)
          setPhase('envelopes')
          setNote('Reyes slid three envelopes across. Open yours.')
        }, 1700)
      }
    }
  }

  const pickEnvelope = (id: Difficulty) => {
    poke()
    if (id !== 'engineer') {
      setNote(`${difficultyPresets[id].name} opens later. For now, everyone flies the Engineer brief.`)
      return
    }
    audio.play('sfx.ih-door-whoosh')
    setOpened(id)
    setNote(`Engineer: $${budgetCap}M, about what Lunar IceCube cost.`)
    window.setTimeout(() => {
      setPhase('jar')
      setNote('Drag coins into the jar. Each is 5% of the budget, held back for surprises.')
    }, 1500)
  }

  const onJarChange = useCallback(
    (next: number[]) => {
      poke()
      setInJar(next)
      setNote(
        next.length === 2
          ? 'CubeSat 101 advises about 10%. Two coins.'
          : next.length === 0
            ? 'An empty jar means nothing to pay for surprises.'
            : `${next.length * 5}% locked away. Parts cannot touch it.`,
      )
    },
    [poke],
  )

  const finish = () => {
    if (done.current) return
    done.current = true
    sayRoom('briefing', 'success')
    onComplete(
      buildResult(design, {
        state: tag,
        reservePercent: inJar.length * 5,
        budgetCapM: budgetCap,
        durationS: (performance.now() - t0.current) / 1000,
      }),
    )
  }

  const skip = () => {
    if (done.current) return
    done.current = true
    sayRoom('briefing', 'success')
    onComplete({ patch: {}, insights: [], durationS: Math.round((performance.now() - t0.current) / 1000) })
  }

  const coverage = sweepCoverage(tag.swept)
  const isTagged = selected ? tag.tagged.includes(selected.id) : false

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-ink-0 text-paper" data-testid="shadow-hunt" data-phase={phase}>
      <div
        className="absolute inset-0 touch-none"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{ cursor: phase === 'shadow' ? 'grab' : undefined }}
      >
        <Canvas camera={{ position: [0, -0.2, 6.2], fov: 38, near: 0.05 }} dpr={[1, 1.75]} gl={{ antialias: true }}>
          <color attach="background" args={['#07090d']} />
          <Suspense fallback={null}>
            {phase === 'shadow' && (
              <MoonTable
                sun={sun}
                target={target}
                onSun={onSun}
                swept={tag.swept}
                seenLit={seenLit}
                tagged={tag.tagged}
                selected={selected}
                onSelect={select}
              />
            )}
            {phase === 'envelopes' && <Envelopes opened={opened} onPick={pickEnvelope} />}
            {phase === 'jar' && <JarScene budgetCap={budgetCap} inJar={inJar} onJarChange={onJarChange} onNote={setNote} />}
          </Suspense>
        </Canvas>
      </div>

      <button type="button" className="fp-btn-secondary absolute left-4 top-4" onClick={onExit}>
        Back to campus
      </button>
      {replay && (
        <button type="button" className="fp-btn-secondary absolute right-4 top-4" data-testid="shadow-skip" onClick={skip}>
          Skip
        </button>
      )}

      {phase === 'shadow' && selected && (
        <div className="absolute bottom-24 right-4 w-72 rounded border border-rule bg-ink-1/90 p-4 backdrop-blur" data-testid="crater-card">
          <div className="fp-label text-[10px] text-paper-faint">{KIND_LABEL[selected.kind]}</div>
          <div className="mt-0.5 text-lg font-semibold">{selected.name}</div>
          <p className="mt-2 text-sm leading-snug text-paper-dim">{selected.line}</p>
          {selected.fact && <p className="mt-2 font-mono text-[12px] text-ice">{selected.fact}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" className="fp-btn-primary flex-1" data-testid="tag-psr" onClick={doTag} disabled={isTagged}>
              {isTagged ? 'Tagged' : 'Tag: never lit'}
            </button>
            <button type="button" className="fp-btn-secondary" onClick={() => setSelected(null)}>
              Zoom out
            </button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-2 px-6 text-center">
        <div className="max-w-xl text-sm text-paper" data-testid="shadow-note">
          {note}
        </div>
        {phase === 'shadow' && (
          <div className="font-mono text-[11px] text-paper-faint" data-testid="shadow-progress">
            {tag.tagged.length} of {PSR_GOAL} tagged
            {!sweepComplete(tag.swept) && ` · lap ${Math.round(coverage * 100)}%`}
          </div>
        )}
        {phase === 'jar' && (
          <button type="button" className="fp-btn-primary pointer-events-auto" data-testid="seal-jar" onClick={finish}>
            Seal the jar
          </button>
        )}
      </div>
    </div>
  )
}
