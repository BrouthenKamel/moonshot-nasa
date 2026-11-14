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
import { audio } from '../../assets/audio'
import { assetUrl } from '../../assets/url'
import { choiceArt } from '../../assets/catalogueArt'
import {
  EQUAL_HEIGHT_CARD,
  altitudeText,
  blockedThud,
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
        <Suspense fallback={<div className="mb-4 h-[66vh] min-h-[460px] rounded-xl bg-slate-900" />}>
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
      className="flex flex-wrap gap-2"
      onMouseLeave={() => onPreview(null)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onPreview(null)
      }}
    >
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
            onPointerEnter={() => {
              audio.play('sfx.hover')
              onPreview(inst.id)
            }}
            onFocus={() => onPreview(inst.id)}
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
        const color = instrumentColor(inst.id)
        const view = instrumentCardView(inst, on, instrumentLock(inst.id, day))
        return (
          <div
            key={inst.id}
            className={`flex h-full w-full max-w-[190px] flex-col gap-2 ${EQUAL_HEIGHT_CARD}`}
            {...blockedThud(view.blocked)}
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
            <span
              aria-hidden
              className="mx-1 h-1.5 shrink-0 rounded-full transition-all duration-300"
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
  const chip = 'rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-slate-200'
  return (
    <div
      aria-live="polite"
      className="hud-panel relative overflow-hidden p-4 transition-colors duration-300"
      style={{ borderColor: `${color}66`, boxShadow: `inset 4px 0 0 ${color}` }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-display text-lg font-bold text-white">{instrument.name}</div>
        <div className="font-mono text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
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

/** Live 12-Month Ice Coverage gauge (70% target tick in cyan) + Data Link generation vs downlink funnel */
function CoverageAndLinkFunnel() {
  const { budgets, previewBudgets, isPreviewing } = useDesignPreview()
  const active = previewBudgets ?? budgets
  const activeCov = Math.max(0, Math.min(100, active.projectedCoverage))
  const currentCov = Math.max(0, Math.min(100, budgets.projectedCoverage))
  const covOnTarget = activeCov >= 70
  const covDelta = active.projectedCoverage - budgets.projectedCoverage

  const made = active.dataPerTurn
  const link = active.downlinkPerTurn
  const funnelMax = Math.max(made, link, 1)
  const madePct = Math.min(100, (made / funnelMax) * 100)
  const linkPct = Math.min(100, (link / funnelMax) * 100)
  const overflow = made > link

  return (
    <div className="hud-panel grid gap-4 p-4 sm:grid-cols-2">
      <div>
        <div className="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums">
          <span className="uppercase tracking-[0.16em] text-slate-400">12-Month Ice Coverage</span>
          <span className={covOnTarget ? 'font-bold text-[#22d3ee]' : 'font-bold text-amber-300'}>
            {activeCov.toFixed(0)}%
            {isPreviewing && Math.abs(covDelta) >= 1 && (
              <span className="ml-1 text-[11px] opacity-85">
                ({covDelta > 0 ? `+${covDelta.toFixed(0)}` : covDelta.toFixed(0)}%)
              </span>
            )}
          </span>
        </div>
        <div className="relative mt-2 h-3.5 overflow-hidden rounded border border-slate-700/70 bg-slate-950">
          <div
            className={`absolute inset-y-0 left-0 transition-all duration-300 ${
              covOnTarget ? 'bg-[#22d3ee]/85' : 'bg-amber-400/80'
            }`}
            style={{ width: `${activeCov}%` }}
          />
          {isPreviewing && Math.abs(covDelta) >= 1 && (
            <div
              className="pointer-events-none absolute inset-y-0 border-r-2 border-white/75"
              style={{ left: `${currentCov}%` }}
            />
          )}
          <div className="hud-bar-segments pointer-events-none absolute inset-0" />
          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-[#22d3ee] shadow-[0_0_8px_#22d3ee]"
            style={{ left: '70%' }}
            title="70% science target"
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-slate-400">
          <span>0%</span>
          <span className="text-[#22d3ee]">70% Target</span>
          <span>100%</span>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums">
          <span className="uppercase tracking-[0.16em] text-slate-400">Data Link Funnel</span>
          <span className={overflow ? 'font-semibold text-amber-300' : 'font-semibold text-emerald-300'}>
            {made.toFixed(0)} / {link.toFixed(0)} MB/month
          </span>
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="relative h-2.5 overflow-hidden rounded bg-slate-950">
            <div
              className={`h-full transition-all duration-300 ${overflow ? 'bg-amber-400' : 'bg-sky-400'}`}
              style={{ width: `${madePct}%` }}
            />
          </div>
          <div className="relative h-2.5 overflow-hidden rounded bg-slate-950">
            <div className="h-full bg-emerald-400/85 transition-all duration-300" style={{ width: `${linkPct}%` }} />
          </div>
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-slate-400">
          <span>Made: {made.toFixed(0)} MB/month</span>
          <span>Downlink: {link.toFixed(0)} MB/month</span>
        </div>
      </div>
    </div>
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
  const totalPower = budgets.instrumentPower
  const totalData = budgets.dataPerTurn

  return (
    <>
      <Stage onFall={onFall} onPreview={handlePreview} />
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="hud-step-header">
          <div className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--role-accent)]">
            RESEARCH LAB · LUNAR ICE MAPPER · INSTRUMENTS
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-50">2. Instrument Selection</h1>
          <p className="mt-1.5 text-sm text-slate-300">
            The science question decides the instrument: the ice sits in craters that never see the Sun. Pick one or two.
            Each one costs mass, volume, power and money, and makes data that has to get home.
          </p>
        </header>

        <div className="hud-panel flex flex-wrap items-center gap-2 border-[var(--role-border)] bg-[var(--role-surface)] px-4 py-3 text-sm text-emerald-100">
          <span className="mr-1 font-mono text-xs uppercase tracking-wider text-[var(--role-accent)]">Aboard:</span>
          <span className="rounded-full border border-emerald-400/25 bg-slate-950/60 px-3 py-1 font-mono text-xs tabular-nums">
            <span className="font-semibold text-emerald-300">{design.instruments.length}</span>{' '}
            {design.instruments.length === 1 ? 'instrument' : 'instruments'}
          </span>
          <span className="rounded-full border border-emerald-400/25 bg-slate-950/60 px-3 py-1 font-mono text-xs tabular-nums">
            <span className="font-semibold text-emerald-300">{totalMass.toFixed(1)}</span> kg
          </span>
          <span className="rounded-full border border-emerald-400/25 bg-slate-950/60 px-3 py-1 font-mono text-xs tabular-nums">
            <span className="font-semibold text-emerald-300">{totalPower}</span> W
          </span>
          <span className="rounded-full border border-emerald-400/25 bg-slate-950/60 px-3 py-1 font-mono text-xs tabular-nums">
            <span className="font-semibold text-emerald-300">{totalData.toFixed(0)}</span> MB/month
          </span>
        </div>

        <CoverageAndLinkFunnel />

        <SynergyStrip step="instruments" />

        {picksHere && <DesignDeltaLine />}

        {lockedAboard.map((lock) => {
          const name = instruments.find((i) => i.id === lock.id)?.name ?? lock.id
          return (
            <div key={lock.id} className="hud-panel border-amber-500/60 bg-amber-950/60 p-4 text-sm text-amber-200">
              <span className="font-semibold">{name} is in your design but the Research Lab has not unlocked it yet.</span>{' '}
              {lock.text}. It stays in your design; Go / No-Go blocks the launch until the lab reaches LV {lock.neededLevel} or you
              remove it.
            </div>
          )
        })}

        {picksHere ? (
          <InstrumentHand
            chosen={design.instruments}
            day={day}
            onToggle={toggleInstrument}
            onInspect={setInspected}
            onPreview={handlePreview}
          />
        ) : (
          <BriefTabs shown={brief.id} chosen={design.instruments} onShow={setInspected} onPreview={handlePreview} />
        )}
        <InstrumentBrief instrument={brief} selected={design.instruments.includes(brief.id)} />

        {design.instruments.length === 0 && (
          <div className="hud-panel border-rose-500/50 bg-rose-950/70 p-4 text-center text-sm text-rose-200">
            Select at least one instrument to continue.
          </div>
        )}

        <div className="flex justify-between pt-1">
          <button
            type="button"
            onClick={() => setDesignStep('planning')}
            className="tactical-btn-back"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => setDesignStep('rocket')}
            disabled={design.instruments.length === 0}
            className="tactical-btn-next"
          >
            Configure Spacecraft →
          </button>
        </div>
      </div>
    </>
  )
}
