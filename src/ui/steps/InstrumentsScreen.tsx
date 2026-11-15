import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { computeBudgets } from '../../sim/budgets'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'
import { useDragStore } from '../interaction/dragStore'
import { DesignDiagramPanel } from '../../viz/DesignDiagramPanel'
import { DesignDeltaLine, SynergyStrip } from '../../viz/DesignDeltaLine'
import { StageBoundary } from '../../scene/instrumentStage/StageBoundary'
import { canUseWebGL } from '../../scene/webgl'
import { instruments, type InstrumentPart } from '../../data/parts'
import { useAgencyStore } from '../../state/agencyStore'
import { instrumentLock, lockedInDesign, toggleUnlocked } from '../../scene/instrumentStage/labLocks'
import { ChoiceCard } from '../kit/ChoiceCard'
import { Btn, Eng, LineItem, Sheet, Tag, nextLabel, stepNumber } from '../kit'
import { InstrumentSpec, ScienceDock } from './instruments/ScienceDock'
import { audio } from '../../assets/audio'
import { MAX_INSTRUMENTS } from '../../scene/instrumentStage/stageModel'
import { InstrumentCardFoot } from '../../scene/instrumentStage/InstrumentCardFoot'
import {
  EQUAL_HEIGHT_CARD,
  blockedThud,
  instrumentCardView,
  instrumentColor,
  instrumentShortName,
  lessonText,
  overMassHint,
  playToggle,
  rowFocusKey,
} from '../../scene/instrumentStage/instrumentCards'

import { LiveForecastCorner } from '../../scene/instrumentStage/LiveForecastCorner'

const InstrumentStage = lazy(() => import('../../scene/instrumentStage/InstrumentStage'))
const N = stepNumber('instruments')

/** Tells the screen the 3D stage could not run, so the cards below take over the picking */
function Fallen({ onFall }: { onFall: () => void }) {
  useEffect(onFall, [onFall])
  return <DesignDiagramPanel step="instruments" />
}

/** The Research Lab simulator filling the screen; the picks are laid over its foot (ScienceDock) */
function Stage({ onFall, topLeft }: { onFall: () => void; topLeft?: ReactNode }) {
  return (
    <StageBoundary fallback={<Fallen onFall={onFall} />}>
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center text-paper-faint">
            {/* The forecast needs no 3D: it is there at once, as the stage will draw it */}
            <LiveForecastCorner topLeft={topLeft} />
            Finding the south pole…
          </div>
        }
      >
        <InstrumentStage fill topLeft={topLeft} />
      </Suspense>
    </StageBoundary>
  )
}

/** The four cards, where the 3D stage cannot run (and in tests) */
function InstrumentHand({
  chosen,
  day,
  onToggle,
  onInspect,
  onPreview,
}: {
  chosen: string[]
  day: number
  onToggle: (id: string) => void
  onInspect: (id: string) => void
  onPreview: (id: string | null) => void
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  return (
    <div
      role="group"
      aria-label="Instruments: pick up to two"
      className="grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-4"
      onMouseLeave={() => onPreview(null)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onPreview(null)
      }}
    >
      {instruments.map((inst, i) => {
        const on = chosen.includes(inst.id)
        const view = instrumentCardView(inst, on, instrumentLock(inst.id, day))
        return (
          <div key={inst.id} className={`flex h-full w-full max-w-[190px] flex-col gap-2 ${EQUAL_HEIGHT_CARD}`} {...blockedThud(view.blocked)}>
            <ChoiceCard
              id={inst.id}
              size="sm"
              title={instrumentShortName(inst)}
              subtitle={`Like ${inst.flownOn}`}
              selected={on}
              disabled={view.blocked}
              reason={view.reason}
              ariaLabel={`${view.ariaLabel}. ${inst.description}`}
              sounds={false}
              drag={
                view.blocked
                  ? undefined
                  : {
                      field: 'instruments',
                      value: inst.id,
                      label: instrumentShortName(inst),
                      patch: { instruments: on ? chosen : toggleUnlocked(chosen, inst.id, day) },
                      sound: 'sfx.pick-instrument',
                    }
              }
              buttonRef={(el) => {
                refs.current[i] = el
              }}
              onHover={() => {
                onInspect(inst.id)
                onPreview(inst.id)
                if (!view.blocked) audio.play('sfx.hover')
              }}
              onFocus={() => {
                onInspect(inst.id)
                onPreview(inst.id)
              }}
              onKeyDown={(e) => {
                const next = rowFocusKey(e.key, i, instruments.length)
                if (next === null) return
                e.preventDefault()
                refs.current[next]?.focus()
              }}
              onPick={() => {
                onInspect(inst.id)
                playToggle(inst.id, on)
                onToggle(inst.id)
              }}
            />
            <InstrumentCardFoot inst={inst} on={on} color={instrumentColor(inst.id)} />
          </div>
        )
      })}
    </div>
  )
}

/** The full catalogue entry of the card under the pointer or focus: what it does and its limits */
function InstrumentBrief({ instrument, selected }: { instrument: InstrumentPart; selected: boolean }) {
  return (
    <Sheet tone="flat" aria-live="polite" className="p-4">
      <LineItem n={`${N}.2`} label={instrument.name} aside={selected ? 'Aboard' : 'In the catalogue'} />
      <p className="mt-2 text-sm leading-snug text-paper-dim">{instrument.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Tag tone={instrument.seesShadow ? 'ice' : 'caution'}>{lessonText(instrument)}</Tag>
        <Eng className="fp-data text-[11px] text-paper-dim">
          Works {instrument.maxAltitudeKm === null ? 'at any altitude' : `below ${instrument.maxAltitudeKm} km`} · {instrument.dataPerTurn} MB/month ·{' '}
          {instrument.volume} U · Like {instrument.flownOn}
        </Eng>
      </div>
    </Sheet>
  )
}

export function InstrumentsScreen() {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const setPreviewPatch = useUiStore((s) => s.setPreviewPatch)

  const day = useAgencyStore((s) => s.day)
  const toggleInstrument = (id: string) => updateDesign({ instruments: toggleUnlocked(design.instruments, id, day) })
  const handlePreview = useCallback(
    (id: string | null) => {
      if (!id && useDragStore.getState().held) return
      if (!id) {
        setPreviewPatch(null)
        return
      }
      setPreviewPatch({ instruments: toggleUnlocked(design.instruments, id, day) })
    },
    [day, design.instruments, setPreviewPatch],
  )
  useEffect(() => () => setPreviewPatch(null), [setPreviewPatch])

  const lockedAboard = lockedInDesign(design.instruments, day)
  // The instrument under the pointer on the stage's picks: its details float top left
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const hovered = instruments.find((i) => i.id === hoveredId)
  const [inspected, setInspected] = useState<string | null>(null)
  // The stage's bar picks when 3D runs; the cards here pick when it cannot (and in tests)
  const [stageFell, setStageFell] = useState(false)
  const onFall = useCallback(() => setStageFell(true), [])
  const picksHere = stageFell || !canUseWebGL()
  const brief = instruments.find((i) => i.id === (inspected ?? design.instruments[design.instruments.length - 1])) ?? instruments[0]

  // Mass is the catalogue's; power and data come from the budgets, as on the dashboard
  const totalMass = instruments
    .filter((i) => design.instruments.includes(i.id))
    .reduce((sum, i) => sum + i.mass, 0)
  const difficulty = useGameStore((s) => s.difficulty)
  const budgets = useMemo(() => computeBudgets(design, difficulty), [design, difficulty])
  const count = design.instruments.length
  const overMass = overMassHint(
    instruments.filter((i) => design.instruments.includes(i.id)),
    budgets.totalMass,
    budgets.massLimit,
  )

  // One screen: the stage fills it, the picks sit along its foot and nothing scrolls
  if (!picksHere)
    return (
      <div className="relative h-full min-h-[560px] overflow-hidden bg-[#03050a]">
        <Stage onFall={onFall} topLeft={hovered && <InstrumentSpec inst={hovered} on={design.instruments.includes(hovered.id)} />} />
        <ScienceDock
          chosen={design.instruments}
          day={day}
          onToggle={toggleInstrument}
          onHover={(id) => {
            setHoveredId(id)
            handlePreview(id)
          }}
          next={{ label: nextLabel('instruments'), onClick: () => setDesignStep('spacecraft') }}
          overMass={overMass}
        />
      </div>
    )

  // Without 3D (and in tests): the cards, the hovered one's entry and the way on
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="fp-data text-sm text-paper">{`${count} of ${MAX_INSTRUMENTS} instruments`}</span>
        <Eng className="fp-data text-xs text-paper-dim">
          {totalMass.toFixed(1)} kg · {budgets.instrumentPower} W · {budgets.dataPerTurn.toFixed(0)} MB/month
        </Eng>
      </div>
      <SynergyStrip step="instruments" />
      <DesignDeltaLine />

      {lockedAboard.map((lock) => {
        const name = instruments.find((i) => i.id === lock.id)?.name ?? lock.id
        return (
          <div key={lock.id} className="border-l-2 border-caution bg-ink-2 p-4 text-sm text-paper">
            <span className="font-semibold">{name} is in your design but the Research Lab has not unlocked it yet.</span> {lock.text}. It stays in
            your design; Go / No-Go blocks the launch until the lab reaches LV {lock.neededLevel} or you remove it.
          </div>
        )
      })}

      <InstrumentHand chosen={design.instruments} day={day} onToggle={toggleInstrument} onInspect={setInspected} onPreview={handlePreview} />
      <InstrumentBrief instrument={brief} selected={design.instruments.includes(brief.id)} />

      {count === 0 && <div className="border-l-2 border-nogo bg-ink-2 p-3 text-sm text-paper">Select at least one instrument to continue.</div>}

      <div className="flex justify-end pt-1">
        <Btn variant="primary" type="button" onClick={() => setDesignStep('spacecraft')} disabled={count === 0}>
          {nextLabel('instruments')}
        </Btn>
      </div>
    </div>
  )
}
