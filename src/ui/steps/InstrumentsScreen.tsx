import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useGameStore } from '../../state/gameStore'
import { DesignDiagramPanel } from '../../viz/DesignDiagramPanel'
import { StageBoundary } from '../../scene/instrumentStage/StageBoundary'
import { canUseWebGL } from '../../scene/webgl'
import { instruments, type InstrumentPart } from '../../data/parts'
import { useAgencyStore } from '../../state/agencyStore'
import { instrumentLock, lockedInDesign, toggleUnlocked } from '../../scene/instrumentStage/labLocks'
import { ChoiceCard } from '../kit/ChoiceCard'
import { audio } from '../../assets/audio'
import { assetUrl } from '../../assets/url'
import { choiceArt } from '../../assets/catalogueArt'
import {
  altitudeText,
  instrumentCardView,
  instrumentColor,
  instrumentShortName,
  instrumentStats,
  lessonText,
  playToggle,
  rowFocusKey,
} from '../../scene/instrumentStage/instrumentCards'

const InstrumentStage = lazy(() => import('../../scene/instrumentStage/InstrumentStage'))

/** Tells the screen the 3D stage could not run, so the cards below take over the picking */
function Fallen({ onFall }: { onFall: () => void }) {
  useEffect(onFall, [onFall])
  return <DesignDiagramPanel step="instruments" />
}

/** The Research Lab simulator (it carries the instrument cards), or the flat diagram where 3D cannot run. */
function Stage({ onFall }: { onFall: () => void }) {
  const flat = <DesignDiagramPanel step="instruments" />
  if (!canUseWebGL()) return flat
  return (
    <StageBoundary fallback={<Fallen onFall={onFall} />}>
      <Suspense fallback={<div className="mb-4 h-[66vh] min-h-[460px] rounded-xl bg-slate-900" />}>
        <InstrumentStage />
      </Suspense>
    </StageBoundary>
  )
}

/** With the stage running, the cards live on its bar; here the player can read each instrument's full entry. */
function BriefTabs({ shown, chosen, onShow }: { shown: string; chosen: string[]; onShow: (id: string) => void }) {
  return (
    <div role="group" aria-label="Read an instrument's file" className="flex flex-wrap gap-2">
      {instruments.map((inst) => {
        const on = inst.id === shown
        const color = instrumentColor(inst.id)
        const portrait = choiceArt(inst.id)?.portrait
        return (
          <button
            key={inst.id}
            type="button"
            aria-pressed={on}
            onClick={() => onShow(inst.id)}
            onPointerEnter={() => audio.play('sfx.hover')}
            className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 ${
              on ? 'text-white' : 'border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            style={on ? { borderColor: color, background: `${color}22`, boxShadow: `0 0 12px ${color}55` } : undefined}
          >
            {portrait ? (
              <img src={assetUrl(portrait)} alt="" className="h-7 w-7 rounded-full bg-[#0a0f1e] object-contain" />
            ) : (
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            )}
            {instrumentShortName(inst)}
            {chosen.includes(inst.id) && <span style={{ color }}>●</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Card facts shared with the stage's bar; the brief below shows the rest of the catalogue entry */
function InstrumentHand({
  chosen,
  day,
  onToggle,
  onInspect,
}: {
  chosen: string[]
  day: number
  onToggle: (id: string) => void
  onInspect: (id: string) => void
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  return (
    <div role="group" aria-label="Instruments: pick up to two" className="grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-4">
      {instruments.map((inst, i) => {
        const on = chosen.includes(inst.id)
        const color = instrumentColor(inst.id)
        const view = instrumentCardView(inst, on, instrumentLock(inst.id, day))
        return (
          <div
            key={inst.id}
            className="flex h-full flex-col gap-2"
            onClickCapture={() => {
              if (view.blocked) audio.play('sfx.fit-error')
            }}
          >
            <ChoiceCard
              id={inst.id}
              size="sm"
              title={instrumentShortName(inst)}
              subtitle={`Like ${inst.flownOn}`}
              tag={altitudeText(inst)}
              stats={instrumentStats(inst)}
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
                if (!view.blocked) audio.play('sfx.hover')
              }}
              onFocus={() => onInspect(inst.id)}
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
            <span
              aria-hidden
              className="mx-1 mt-auto h-1.5 rounded-full transition-all duration-300"
              style={{ background: on ? color : `${color}33`, boxShadow: on ? `0 0 10px ${color}` : 'none' }}
            />
          </div>
        )
      })}
    </div>
  )
}

/** The full catalogue entry of the card under the pointer or focus: what it does and its limits */
function InstrumentBrief({ instrument, selected }: { instrument: InstrumentPart; selected: boolean }) {
  const color = instrumentColor(instrument.id)
  const chip = 'rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-200'
  return (
    <div
      aria-live="polite"
      className="relative overflow-hidden rounded-xl border bg-[#060a14] p-4 transition-colors duration-300"
      style={{ borderColor: `${color}66`, boxShadow: `inset 4px 0 0 ${color}` }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-display text-lg font-bold text-white">{instrument.name}</div>
        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
          {selected ? 'Aboard' : 'In the catalogue'}
        </div>
      </div>
      <p className="mt-1 text-sm leading-snug text-slate-300">{instrument.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`${chip} ${instrument.seesShadow ? '!text-emerald-300' : '!text-orange-300'}`}>{lessonText(instrument)}</span>
        <span className={chip}>Works {instrument.maxAltitudeKm === null ? 'at any altitude' : `below ${instrument.maxAltitudeKm} km`}</span>
        <span className={chip}>{instrument.dataPerTurn} MB/month</span>
        <span className={chip}>{instrument.volume} U</span>
        <span className={chip}>Like {instrument.flownOn}</span>
      </div>
    </div>
  )
}

export function InstrumentsScreen() {
  const design = useGameStore((s) => s.design)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)

  const day = useAgencyStore((s) => s.day)
  const toggleInstrument = (id: string) => updateDesign({ instruments: toggleUnlocked(design.instruments, id, day) })
  const lockedAboard = lockedInDesign(design.instruments, day)
  const [inspected, setInspected] = useState<string | null>(null)
  // The stage's bar picks when 3D runs; the cards here pick when it cannot (and in tests)
  const [stageFell, setStageFell] = useState(false)
  const onFall = useCallback(() => setStageFell(true), [])
  const picksHere = stageFell || !canUseWebGL()
  const brief = instruments.find((i) => i.id === (inspected ?? design.instruments[design.instruments.length - 1])) ?? instruments[0]

  const totalMass = instruments
    .filter((i) => design.instruments.includes(i.id))
    .reduce((sum, i) => sum + i.mass, 0)

  const totalPower = instruments
    .filter((i) => design.instruments.includes(i.id))
    .reduce((sum, i) => sum + Math.abs(i.power), 0)

  const totalData = instruments
    .filter((i) => design.instruments.includes(i.id))
    .reduce((sum, i) => sum + i.dataPerTurn, 0)

  return (
    <>
    <Stage onFall={onFall} />
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-lg bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-green-400">2. Instrument Selection</h1>
        <p className="mt-2 text-slate-400">
          The science question decides the instrument: the ice sits in craters that never see the Sun. Pick one or two.
          Each one costs mass, volume, power and money, and makes data that has to get home.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-green-900/70 bg-green-950/60 px-4 py-3 text-sm text-green-200">
        <span className="mr-1 font-medium text-green-300">Aboard:</span>
        <span className="rounded-full bg-green-900/60 px-3 py-1">
          <span className="font-semibold text-green-300">{design.instruments.length}</span>{' '}
          {design.instruments.length === 1 ? 'instrument' : 'instruments'}
        </span>
        <span className="rounded-full bg-green-900/60 px-3 py-1">
          <span className="font-semibold text-green-300">{totalMass.toFixed(1)}</span> kg
        </span>
        <span className="rounded-full bg-green-900/60 px-3 py-1">
          <span className="font-semibold text-green-300">{totalPower}</span> W
        </span>
        <span className="rounded-full bg-green-900/60 px-3 py-1">
          <span className="font-semibold text-green-300">{totalData.toFixed(0)}</span> MB/month
        </span>
      </div>

      {lockedAboard.map((lock) => {
        const name = instruments.find((i) => i.id === lock.id)?.name ?? lock.id
        return (
          <div key={lock.id} className="rounded-lg border border-amber-500/60 bg-amber-950/60 p-4 text-sm text-amber-200">
            <span className="font-semibold">{name} is in your design but the Research Lab has not unlocked it yet.</span>{' '}
            {lock.text}. It stays in your design; Go / No-Go blocks the launch until the lab reaches LV {lock.neededLevel} or you
            remove it.
          </div>
        )
      })}

      {picksHere ? (
        <InstrumentHand chosen={design.instruments} day={day} onToggle={toggleInstrument} onInspect={setInspected} />
      ) : (
        <BriefTabs shown={brief.id} chosen={design.instruments} onShow={setInspected} />
      )}
      <InstrumentBrief instrument={brief} selected={design.instruments.includes(brief.id)} />

      {design.instruments.length === 0 && (
        <div className="rounded-lg bg-red-950 p-4 text-center text-sm text-red-300">
          Select at least one instrument to continue.
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={() => setDesignStep('planning')}
          className="rounded-lg bg-slate-700 px-6 py-2 font-medium text-slate-300 hover:bg-slate-600"
        >
          ← Back
        </button>
        <button
          onClick={() => setDesignStep('rocket')}
          disabled={design.instruments.length === 0}
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Configure Spacecraft →
        </button>
      </div>
    </div>
    </>
  )
}
