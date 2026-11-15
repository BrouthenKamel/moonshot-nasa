import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type MouseEvent } from 'react'
import { computeBudgets } from '../../sim/budgets'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'
import { DesignDiagramPanel } from '../../viz/DesignDiagramPanel'
import { DesignDeltaLine, SynergyStrip } from '../../viz/DesignDeltaLine'
import { useDesignPreview } from '../useDesignPreview'
import { StageBoundary } from '../../scene/instrumentStage/StageBoundary'
import { canUseWebGL } from '../../scene/webgl'
import { instruments, type InstrumentPart } from '../../data/parts'
import { useAgencyStore } from '../../state/agencyStore'
import { instrumentLock, lockedInDesign, toggleUnlocked } from '../../scene/instrumentStage/labLocks'
import { ChoiceCard } from '../kit/ChoiceCard'
import { Btn, Eng, LineItem, Sheet, StepHeader, Tag, stepNumber } from '../kit'
import { audio } from '../../assets/audio'
import { assetUrl } from '../../assets/url'
import { choiceArt } from '../../assets/catalogueArt'
import { InstrumentCardFoot } from '../../scene/instrumentStage/InstrumentCardFoot'
import { COVERAGE_TARGET } from '../../scene/instrumentStage/stageModel'
import {
  EQUAL_HEIGHT_CARD,
  blockedThud,
  instrumentCardView,
  instrumentColor,
  instrumentShortName,
  lessonText,
  playToggle,
  rowFocusKey,
} from '../../scene/instrumentStage/instrumentCards'

const InstrumentStage = lazy(() => import('../../scene/instrumentStage/InstrumentStage'))
const N = stepNumber('instruments')

/** Tells the screen the 3D stage could not run, so the cards below take over the picking */
function Fallen({ onFall }: { onFall: () => void }) {
  useEffect(onFall, [onFall])
  return <DesignDiagramPanel step="instruments" />
}

/** The Research Lab simulator (it carries the instrument cards), or the flat diagram where 3D cannot run. */
function Stage({
  onFall,
  onPreview,
}: {
  onFall: () => void
  onPreview: (id: string | null) => void
}) {
  const flat = <DesignDiagramPanel step="instruments" />
  if (!canUseWebGL()) return flat

  const pickId = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLElement>('[data-choice-id]')?.dataset.choiceId ?? null : null

  return (
    <div
      onMouseOver={(e: MouseEvent<HTMLDivElement>) => onPreview(pickId(e.target))}
      onMouseLeave={() => onPreview(null)}
      onFocus={(e: FocusEvent<HTMLDivElement>) => onPreview(pickId(e.target))}
      onBlurCapture={(e: FocusEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onPreview(null)
      }}
    >
      <StageBoundary fallback={<Fallen onFall={onFall} />}>
        <Suspense fallback={<div className="mb-4 h-[66vh] min-h-[460px] border border-rule bg-ink-1" />}>
          <InstrumentStage />
        </Suspense>
      </StageBoundary>
    </div>
  )
}

/** With the stage running, the cards live on its bar; here the player can read each instrument's full entry. */
function BriefTabs({
  shown,
  chosen,
  onShow,
  onPreview,
}: {
  shown: string
  chosen: string[]
  onShow: (id: string) => void
  onPreview: (id: string | null) => void
}) {
  return (
    <div
      role="group"
      aria-label="Read an instrument's file"
      className="flex flex-wrap border border-rule"
      onMouseLeave={() => onPreview(null)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onPreview(null)
      }}
    >
      {instruments.map((inst) => {
        const on = inst.id === shown
        const portrait = choiceArt(inst.id)?.portrait
        return (
          <button
            key={inst.id}
            type="button"
            aria-pressed={on}
            onClick={() => onShow(inst.id)}
            onPointerEnter={() => {
              audio.play('sfx.hover')
              onPreview(inst.id)
            }}
            onFocus={() => onPreview(inst.id)}
            className={`flex items-center gap-2 border-r border-rule py-1 pl-1 pr-3 text-xs font-semibold last:border-r-0 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-kapton ${
              on ? 'bg-ink-3 text-paper' : 'text-paper-dim hover:text-paper'
            }`}
          >
            {portrait ? (
              <img src={assetUrl(portrait)} alt="" className="h-7 w-7 bg-ink-1 object-contain" />
            ) : (
              <span className="h-2 w-2" style={{ background: instrumentColor(inst.id) }} />
            )}
            {instrumentShortName(inst)}
            {chosen.includes(inst.id) && <span className="fp-data text-[10px] text-kapton">aboard</span>}
          </button>
        )
      })}
    </div>
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
      <LineItem n={`${N}.3`} label={instrument.name} aside={selected ? 'Aboard' : 'In the catalogue'} />
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

/** The one verdict: does anything aboard see into the dark, and how much ice does that map. Cyan only for ice. */
function ForecastVerdict({ chosen }: { chosen: string[] }) {
  const { budgets, previewBudgets, isPreviewing } = useDesignPreview()
  const active = previewBudgets ?? budgets
  const cov = Math.max(0, Math.min(100, active.projectedCoverage))
  const covDelta = active.projectedCoverage - budgets.projectedCoverage
  const seers = instruments.filter((i) => chosen.includes(i.id) && i.seesShadow).length
  const made = active.dataPerTurn
  const link = active.downlinkPerTurn

  const verdict =
    chosen.length === 0
      ? 'The payload bay is empty'
      : seers === 0
        ? 'Nothing aboard sees into shadow'
        : chosen.length === 1
          ? 'This instrument maps the dark craters'
          : 'This pair maps the dark craters'

  return (
    <Sheet className="p-4" aria-live="polite">
      <LineItem n={`${N}.2`} label="Forecast" />
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className={`fp-display text-lg ${seers > 0 ? 'text-paper' : 'text-caution'}`}>{verdict}</div>
        <div className="text-sm text-paper-dim">
          <span className={`fp-data font-semibold ${cov >= COVERAGE_TARGET ? 'text-ice' : 'text-caution'}`}>{cov.toFixed(0)}%</span> of the ice mapped
          <Eng className="fp-data text-xs">
            {` · target ${COVERAGE_TARGET}%`}
            {isPreviewing && Math.abs(covDelta) >= 1 ? ` (${covDelta > 0 ? `+${covDelta.toFixed(0)}` : covDelta.toFixed(0)}%)` : ''}
          </Eng>
        </div>
      </div>
      <div className="relative mt-2 h-2 border border-rule bg-ink-1">
        <div className={`absolute inset-y-0 left-0 transition-all duration-300 ${cov >= COVERAGE_TARGET ? 'bg-ice' : 'bg-caution'}`} style={{ width: `${cov}%` }} />
        <div className="absolute inset-y-[-3px] w-px bg-paper" style={{ left: `${COVERAGE_TARGET}%` }} title={`${COVERAGE_TARGET}% science target`} />
      </div>
      <Eng as="div" className="mt-3 flex justify-between border-t border-rule pt-2 fp-data text-[11px] text-paper-dim">
        <span>Data link: made {made.toFixed(0)} MB/month</span>
        <span className={made > link ? 'text-caution' : 'text-go'}>downlink {link.toFixed(0)} MB/month</span>
      </Eng>
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

  return (
    <>
      <StepHeader step="instruments" title="Instruments" className="mx-auto mb-4 max-w-3xl">
        <span className="fp-data text-sm text-paper">{`${count} ${count === 1 ? 'instrument' : 'instruments'}`}</span>
        <Eng className="fp-data text-xs text-paper-dim">
          · {totalMass.toFixed(1)} kg · {budgets.instrumentPower} W · {budgets.dataPerTurn.toFixed(0)} MB/month
        </Eng>
      </StepHeader>
      <Stage onFall={onFall} onPreview={handlePreview} />
      <div className="mx-auto max-w-3xl space-y-4">
        <ForecastVerdict chosen={design.instruments} />

        <SynergyStrip step="instruments" />

        {picksHere && <DesignDeltaLine />}

        {lockedAboard.map((lock) => {
          const name = instruments.find((i) => i.id === lock.id)?.name ?? lock.id
          return (
            <div key={lock.id} className="border-l-2 border-caution bg-ink-2 p-4 text-sm text-paper">
              <span className="font-semibold">{name} is in your design but the Research Lab has not unlocked it yet.</span> {lock.text}. It stays in
              your design; Go / No-Go blocks the launch until the lab reaches LV {lock.neededLevel} or you remove it.
            </div>
          )
        })}

        {picksHere ? (
          <InstrumentHand chosen={design.instruments} day={day} onToggle={toggleInstrument} onInspect={setInspected} onPreview={handlePreview} />
        ) : (
          <BriefTabs shown={brief.id} chosen={design.instruments} onShow={setInspected} onPreview={handlePreview} />
        )}
        <InstrumentBrief instrument={brief} selected={design.instruments.includes(brief.id)} />

        {count === 0 && <div className="border-l-2 border-nogo bg-ink-2 p-3 text-sm text-paper">Select at least one instrument to continue.</div>}

        <div className="flex justify-between pt-1">
          <Btn type="button" onClick={() => setDesignStep('planning')}>
            ← Back
          </Btn>
          <Btn variant="primary" type="button" onClick={() => setDesignStep('rocket')} disabled={count === 0}>
            Choose the rocket →
          </Btn>
        </div>
      </div>
    </>
  )
}
