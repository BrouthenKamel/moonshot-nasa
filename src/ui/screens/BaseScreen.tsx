import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../../state/gameStore'
import { useAgencyStore } from '../../state/agencyStore'
import { BaseMap, type MapTarget } from '../../scene/BaseMap'
import { exampleMissions, scriptedEvents, type MissionCardView, type Speed } from '../../data/agency'
import { fundingPerDay } from '../../game/economy'
import { missionLaunchDay, type FeedItem } from '../../game/world'
import { MISSION_NAME, useMissionWatch } from '../../game/missionLink'
import { BuildingPanel, NewMissionDialog, useNewMissionGate } from '../base/BuildingPanel'
import { baseView, type Stage } from '../base/view'
import { Icon } from '../base/icons'

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

/** Runs the agency clock while the base screen is open (planning screens stop it) */
function useAgencyClock() {
  const tick = useAgencyStore((s) => s.tick)
  useEffect(() => {
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const seconds = Math.min(1, (now - last) / 1000) // no big jumps after the tab sleeps
      last = now
      tick(seconds)
    }, 200)
    return () => window.clearInterval(id)
  }, [tick])
}

const money = (m: number) => `$${m.toFixed(1)}M`

const hud = 'rounded-2xl bg-[#14213d]/85 text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md'

/* ------------------------------------------------------------------ */
/* Top bar                                                             */
/* ------------------------------------------------------------------ */

function SpeedButton({ speed, icon, title }: { speed: Speed; icon: 'pause' | 'play' | 'fast'; title: string }) {
  const current = useAgencyStore((s) => s.speed)
  const setSpeed = useAgencyStore((s) => s.setSpeed)
  const active = speed === current
  return (
    <button
      onClick={() => setSpeed(speed)}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
        active ? 'bg-orange-500 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon name={icon} />
    </button>
  )
}

function TopBar() {
  const day = useAgencyStore((s) => Math.floor(s.day))
  const funds = useAgencyStore((s) => s.funds)
  const popularity = useAgencyStore((s) => s.popularity)
  const skip = useAgencyStore((s) => s.skipToNextEvent)
  const setScreen = useGameStore((s) => s.setScreen)

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-wrap items-start justify-between gap-2">
      <button
        onClick={() => setScreen('title')}
        title="Back to the title screen"
        className={`${hud} pointer-events-auto flex items-center gap-2 px-3 py-2`}
      >
        <Icon name="moon" className="h-6 w-6 text-orange-400" />
        <span className="font-display text-lg font-bold tracking-wide">Moonshot</span>
      </button>

      <div className={`${hud} pointer-events-auto flex items-center gap-2 p-1.5 pl-4`}>
        <div className="mr-1 leading-tight">
          <div className="font-display text-lg font-bold tabular-nums">Day {day}</div>
          <div className="text-[11px] text-white/60">
            Year {Math.floor(day / 360) + 1}, month {Math.floor((day % 360) / 30) + 1}
          </div>
        </div>
        <SpeedButton speed="paused" icon="pause" title="Pause" />
        <SpeedButton speed="normal" icon="play" title="Play (1 day a second)" />
        <SpeedButton speed="fast" icon="fast" title="Fast (10 days a second)" />
        <button
          onClick={skip}
          title="Jump to the next event"
          className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white"
        >
          <Icon name="skip" />
          Next event
        </button>
      </div>

      <div className="pointer-events-auto flex gap-2">
        <div className={`${hud} flex items-center gap-2 px-3 py-2`} title="Public support: more support, more money">
          <Icon name="people" className="h-5 w-5 text-violet-300" />
          <span className="font-display text-lg font-bold tabular-nums">{popularity.toFixed(0)}%</span>
        </div>
        <div className={`${hud} flex items-center gap-2 px-3 py-2`} title={`Government funding: +${money(fundingPerDay(popularity) * 30)} a month`}>
          <Icon name="coins" className="h-5 w-5 text-amber-300" />
          <span className="font-display text-lg font-bold tabular-nums">{money(funds)}</span>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Bottom: the mission tracker                                         */
/* ------------------------------------------------------------------ */

const steps: { stage: Stage; label: string }[] = [
  { stage: 'planning', label: 'Plan' },
  { stage: 'build', label: 'Build' },
  { stage: 'test', label: 'Test' },
  { stage: 'wait', label: 'Launch' },
  { stage: 'transfer', label: 'Travel' },
  { stage: 'orbit', label: 'Science' },
  { stage: 'ended', label: 'Done' },
]

function MissionTracker({
  stage,
  detail,
  attention,
  onOpen,
  onNewMission,
}: {
  stage: Stage
  detail: string
  attention: boolean
  onOpen: () => void
  onNewMission: () => void
}) {
  const gate = useNewMissionGate()
  const cancelPlanning = useAgencyStore((s) => s.cancelPlanning)

  if (stage === 'none') {
    return (
      <div className={`${hud} flex items-center gap-4 p-3 pl-5`}>
        <div className="leading-tight">
          <div className="font-display text-base font-bold">Ready for the Moon</div>
          <div className="text-xs text-white/60">
            {gate.missing > 0 ? `Need ${money(gate.agencyPays)}, ${money(gate.missing)} short` : `Our share: ${money(gate.agencyPays)} of ${money(gate.budget)}`}
          </div>
        </div>
        <button
          onClick={onNewMission}
          className="rounded-xl bg-orange-500 px-5 py-2.5 font-display text-base font-bold shadow-[0_3px_0_#b85d0e] transition hover:bg-orange-400 active:translate-y-0.5 active:shadow-none"
        >
          New mission
        </button>
      </div>
    )
  }

  const current = steps.findIndex((s) => s.stage === stage)
  return (
    <div className={`${hud} w-[min(620px,calc(100vw-24px))] p-3`}>
      <div className="flex items-center gap-3 px-1">
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-bold">{MISSION_NAME}</div>
          <div className="truncate text-xs text-white/65">{detail}</div>
        </div>
        {stage === 'planning' && (
          <button onClick={cancelPlanning} className="rounded-lg px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white">
            Discard plan
          </button>
        )}
        {stage === 'ended' ? (
          <button onClick={onNewMission} disabled={gate.busy} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold hover:bg-orange-400">
            New mission
          </button>
        ) : null}
        <button
          onClick={onOpen}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition ${
            attention ? 'animate-pulse bg-red-500 hover:bg-red-400' : 'bg-white/15 hover:bg-white/25'
          }`}
        >
          {attention && <Icon name="alert" />}
          {attention ? 'Decide' : stage === 'planning' ? 'Continue' : 'Open'}
        </button>
      </div>
      <ol className="mt-3 flex items-center px-1">
        {steps.map((s, i) => {
          const done = i < current
          const now = i === current
          return (
            <li key={s.stage} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    now ? 'bg-orange-500 ring-4 ring-orange-500/30' : done ? 'bg-emerald-500' : 'bg-white/15 text-white/50'
                  }`}
                >
                  {done ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={`text-[10px] ${now ? 'font-bold text-white' : 'text-white/55'}`}>{s.label}</span>
              </div>
              {i < steps.length - 1 && <span className={`mx-1 mb-4 h-0.5 flex-1 rounded ${done ? 'bg-emerald-500' : 'bg-white/15'}`} />}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Pop-up notifications                                                */
/* ------------------------------------------------------------------ */

const toneColor: Record<FeedItem['tone'], string> = {
  info: 'bg-sky-400',
  good: 'bg-emerald-400',
  warning: 'bg-amber-400',
  bad: 'bg-red-400',
}

function effectText(e: FeedItem) {
  const parts: string[] = []
  if (e.money) parts.push(`${e.money > 0 ? '+' : '−'}${money(Math.abs(e.money))}`)
  if (e.popularity) parts.push(`${e.popularity > 0 ? '+' : ''}${e.popularity}% support`)
  return parts.join(' · ')
}

/** New, important log entries pop up for a few seconds */
function Toasts() {
  const feed = useAgencyStore((s) => s.feed)
  const seen = useRef<string | null>(feed[0]?.id ?? null)
  const [toasts, setToasts] = useState<FeedItem[]>([])

  useEffect(() => {
    const fresh: FeedItem[] = []
    for (const item of feed) {
      if (item.id === seen.current) break
      if (!item.quiet) fresh.push(item)
    }
    seen.current = feed[0]?.id ?? null
    if (fresh.length === 0) return
    setToasts((t) => [...fresh.slice(0, 2), ...t].slice(0, 3))
    const ids = new Set(fresh.map((f) => f.id))
    const timer = window.setTimeout(() => setToasts((t) => t.filter((x) => !ids.has(x.id))), 5000)
    return () => window.clearTimeout(timer)
  }, [feed])

  return (
    <div className="pointer-events-none absolute right-3 top-20 z-20 flex w-72 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`${hud} flex gap-2.5 p-3 animate-[toast-in_0.25s_ease-out]`}>
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${toneColor[t.tone]}`} />
          <div className="min-w-0 text-sm">
            <div className="font-semibold">{t.title}</div>
            {t.detail && <div className="text-xs text-white/65">{t.detail}</div>}
            {effectText(t) && <div className="text-xs font-semibold text-emerald-300">{effectText(t)}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Drawers                                                             */
/* ------------------------------------------------------------------ */

function Drawer({ side, title, onClose, children }: { side: 'left' | 'right'; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className={`absolute bottom-3 top-20 z-30 flex w-[min(340px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl bg-[#fbf8f2] text-slate-800 shadow-2xl ${
        side === 'left' ? 'left-3' : 'right-3'
      }`}
    >
      <div className="flex items-center justify-between bg-[#14213d] px-4 py-3 text-white">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white">
          <Icon name="close" />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">{children}</div>
    </div>
  )
}

function Sparkline({ points, color, label, value }: { points: number[]; color: string; label: string; value: string }) {
  const path = useMemo(() => {
    const min = Math.min(...points)
    const max = Math.max(...points)
    const span = Math.max(0.5, max - min)
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${((i / Math.max(1, points.length - 1)) * 100).toFixed(1)},${(30 - ((p - min) / span) * 26).toFixed(1)}`)
      .join(' ')
  }, [points])
  return (
    <div className="rounded-xl bg-white p-2.5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold text-slate-500">{label}</span>
        <span className="font-display text-sm font-bold tabular-nums">{value}</span>
      </div>
      <svg viewBox="0 0 100 32" className="h-9 w-full" preserveAspectRatio="none" role="img" aria-label={`${label} over the last 180 days`}>
        <path d={`${path} L100,32 L0,32 Z`} fill={color} opacity={0.12} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

function LogDrawer({ onClose }: { onClose: () => void }) {
  const day = useAgencyStore((s) => Math.floor(s.day))
  const history = useAgencyStore((s) => s.history)
  const feed = useAgencyStore((s) => s.feed)
  const mission = useAgencyStore((s) => s.mission)
  const funds = useAgencyStore((s) => s.funds)
  const popularity = useAgencyStore((s) => s.popularity)
  const resetAgency = useAgencyStore((s) => s.resetAgency)
  const recent = history.filter((h) => h.day >= day - 180)

  const upcoming = useMemo(() => {
    const items = scriptedEvents.filter((e) => e.day > day).map((e) => ({ title: e.title, day: e.day }))
    if (mission && !mission.last.ended && !mission.last.launched) items.push({ title: `${MISSION_NAME} ride leaves`, day: missionLaunchDay(mission) })
    return items.sort((a, b) => a.day - b.day).slice(0, 3)
  }, [day, mission])

  return (
    <Drawer side="left" title="Agency log" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <Sparkline points={recent.map((h) => h.funds)} color="#c27c0e" label="Funds" value={money(funds)} />
        <Sparkline points={recent.map((h) => h.popularity)} color="#7c5cd6" label="Support" value={`${popularity.toFixed(0)}%`} />
      </div>
      {upcoming.length > 0 && (
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <div className="mb-1 text-[11px] font-semibold text-slate-500">Coming up</div>
          {upcoming.map((e) => (
            <div key={e.title + e.day} className="flex justify-between gap-2 text-sm">
              <span className="truncate">{e.title}</span>
              <span className="shrink-0 tabular-nums text-slate-500">{e.day - day} days</span>
            </div>
          ))}
        </div>
      )}
      <ul className="space-y-1">
        {feed.map((e) => (
          <li key={e.id} className={`flex gap-2.5 rounded-lg px-2 py-1.5 ${e.quiet ? 'opacity-60' : ''}`}>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneColor[e.tone]}`} />
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-semibold">{e.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-slate-400">day {e.day}</span>
              </div>
              {e.detail && <div className="text-xs text-slate-500">{e.detail}</div>}
              {effectText(e) && (
                <div className={`text-xs font-semibold ${(e.money ?? 0) < 0 || (e.popularity ?? 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {effectText(e)}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <button
        onClick={() => {
          if (window.confirm('Reset the agency to the demo start (day 112)? The current mission is dropped.')) resetAgency()
        }}
        className="text-xs text-slate-400 underline hover:text-slate-600"
      >
        Reset demo
      </button>
    </Drawer>
  )
}

const statusText: Record<MissionCardView['status'], string> = {
  planning: 'Planning',
  building: 'Building',
  testing: 'Testing',
  waiting: 'Waiting for ride',
  transfer: 'Travelling',
  'in-orbit': 'In orbit',
  complete: 'Complete',
  lost: 'Lost',
}

function MissionsDrawer({ real, onOpenReal, onClose }: { real: MissionCardView | null; onOpenReal: () => void; onClose: () => void }) {
  const day = useAgencyStore((s) => Math.floor(s.day))
  const list = [...(real ? [real] : []), ...exampleMissions(day)]
  return (
    <Drawer side="right" title="Missions" onClose={onClose}>
      {list.map((m) => (
        <button
          key={m.id}
          onClick={m.real ? onOpenReal : undefined}
          disabled={!m.real}
          className={`w-full rounded-xl bg-white p-3 text-left shadow-sm ${m.real ? 'ring-2 ring-orange-400 hover:shadow-md' : 'cursor-default'}`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-base font-bold">{m.name}</span>
            <span className="text-xs font-semibold text-slate-500">{statusText[m.status]}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-500">{m.detail}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.round(m.progress * 100)}%` }} />
          </div>
          {!m.real && <div className="mt-1 text-[10px] text-slate-400">Example mission</div>}
        </button>
      ))}
    </Drawer>
  )
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

type Overlay = { kind: 'building'; target: MapTarget } | { kind: 'log' } | { kind: 'missions' } | null

export function BaseScreen() {
  useAgencyClock()
  useMissionWatch()

  const agency = useAgencyStore()
  const view = baseView(agency)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [newMission, setNewMission] = useState<{ resume: Speed } | null>(null)

  const attention = !!agency.mission?.last.decisionTitle && !agency.mission.last.ended
  const selected = overlay?.kind === 'building' ? overlay.target : null
  const openBuilding = (target: MapTarget) => setOverlay({ kind: 'building', target })

  // The clock stops while the new-mission brief is open
  const openNewMission = () => {
    setOverlay(null)
    setNewMission({ resume: agency.speed })
    agency.setSpeed('paused')
  }
  const closeNewMission = (started: boolean) => {
    if (!started && newMission) agency.setSpeed(newMission.resume)
    setNewMission(null)
  }

  return (
    <div className="relative h-screen overflow-hidden bg-[#4f86c6]">
      <BaseMap labels={view.labels} selected={selected} onSelect={openBuilding} launched={!!agency.mission?.last.launched && !agency.mission.last.ended} />

      <TopBar />
      <Toasts />

      {agency.pauseReason && !overlay && (
        <div className={`${hud} absolute left-1/2 top-20 z-20 flex -translate-x-1/2 items-center gap-3 px-4 py-2 text-sm`}>
          <Icon name="pause" className="h-4 w-4 text-orange-400" />
          <span className="font-semibold">{agency.pauseReason}</span>
        </div>
      )}

      {/* Corner buttons */}
      <div className="absolute bottom-3 left-3 z-10 flex gap-2">
        <button onClick={() => setOverlay({ kind: 'log' })} className={`${hud} flex items-center gap-2 px-3 py-2.5 text-sm font-semibold hover:bg-[#14213d]`}>
          <Icon name="log" /> Log
        </button>
      </div>
      <div className="absolute bottom-3 right-3 z-10">
        <button onClick={() => setOverlay({ kind: 'missions' })} className={`${hud} flex items-center gap-2 px-3 py-2.5 text-sm font-semibold hover:bg-[#14213d]`}>
          <Icon name="list" /> Missions
          <span className="rounded-full bg-orange-500 px-1.5 text-xs">{exampleMissions(agency.day).length + (view.card ? 1 : 0)}</span>
        </button>
      </div>

      {/* Mission tracker */}
      <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
        <MissionTracker
          stage={view.stage}
          detail={view.card?.detail ?? ''}
          attention={attention}
          onOpen={() => openBuilding(view.active)}
          onNewMission={openNewMission}
        />
      </div>

      {overlay?.kind === 'building' && (
        <BuildingPanel target={overlay.target} view={view} onClose={() => setOverlay(null)} onNewMission={openNewMission} />
      )}
      {overlay?.kind === 'log' && <LogDrawer onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'missions' && (
        <MissionsDrawer real={view.card} onOpenReal={() => openBuilding(view.active)} onClose={() => setOverlay(null)} />
      )}
      {newMission && <NewMissionDialog onClose={closeNewMission} />}
    </div>
  )
}
