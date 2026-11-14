import { buildings, lockedPlot } from '../../data/agency'
import type { MapTarget } from '../../scene/BaseMap'
import { useAgencyStore } from '../../state/agencyStore'
import { campaign, phaseProgress } from '../../game/campaign'
import { fundingPerDay, grantShare, missionFunding } from '../../game/economy'
import { lunarPapers, paperProgress, research } from '../../game/research'
import { missionLaunchDay } from '../../game/world'
import {
  MISSION_NAME,
  missionBudget,
  openMissionScreen,
  planningProgress,
  type MissionDetails,
} from '../../game/missionLink'
import type { BaseView } from './view'
import { Icon } from './icons'

const months = (n: number) => (n <= 0 ? 'done' : `${n} month${n === 1 ? '' : 's'}`)

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-3 shadow-sm">
      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium tabular-nums text-slate-800">{value}</span>
    </div>
  )
}

function Bar({ value, tone = 'bg-orange-500' }: { value: number; tone?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </div>
  )
}

function ActionButton({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-lg bg-orange-500 px-3 py-2 font-display font-bold text-white shadow-sm hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      {children}
    </button>
  )
}

function OpenMissionButton({ label = 'Open the mission screen' }: { label?: string }) {
  return (
    <button onClick={openMissionScreen} className="w-full rounded-lg border-2 border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
      {label} →
    </button>
  )
}

/** An event card from the mission, answered here */
function DecisionCard({ details }: { details: MissionDetails }) {
  const d = details.decision
  if (!d) return null
  return (
    <section className="rounded-xl border-2 border-red-400 bg-red-50 p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-red-600">Decision needed</div>
      <div className="mt-0.5 font-display text-base font-bold text-slate-800">{d.title}</div>
      <p className="mt-1 text-sm text-slate-700">{d.text}</p>
      {d.realMission && <p className="mt-1 text-xs text-slate-500">Real mission: {d.realMission}</p>}
      <p className="mt-1 text-xs text-slate-500">
        Mission budget left ${details.moneyLeft.toFixed(1)}M, reserve ${Math.max(0, details.reserve).toFixed(1)}M
      </p>
      <div className="mt-2 space-y-1.5">
        {d.options.map((o) => (
          <button
            key={o.id}
            onClick={() => useAgencyStore.getState().answer(o.id)}
            className="w-full rounded-lg bg-white p-2 text-left text-sm text-slate-800 shadow-sm ring-1 ring-slate-200 hover:ring-orange-400"
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* New mission                                                         */
/* ------------------------------------------------------------------ */

/** Can a new mission be planned now, and what would it cost? */
export function useNewMissionGate() {
  const funds = useAgencyStore((s) => s.funds)
  const popularity = useAgencyStore((s) => s.popularity)
  const mission = useAgencyStore((s) => s.mission)
  const budget = missionBudget()
  const f = missionFunding(budget, popularity)
  const busy = !!mission && !mission.last.ended
  const missing = Math.max(0, f.agencyPays - funds)
  return { budget, ...f, funds, busy, missing, canStart: !busy && missing === 0 }
}

export function NewMissionDialog({ onClose }: { onClose: (started: boolean) => void }) {
  const gate = useNewMissionGate()
  const beginPlanning = useAgencyStore((s) => s.beginPlanning)
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => onClose(false)}>
      <div className="w-full max-w-md rounded-2xl bg-[#fbf7ef] p-5 text-slate-800 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">New mission brief</div>
        <h2 className="font-display text-2xl font-bold">{MISSION_NAME}</h2>
        <p className="mt-1 text-sm text-slate-600">
          A 6U CubeSat to map water ice in the dark craters at the Moon&apos;s south pole. Reach lunar orbit, map 70% of
          the region and get 300 MB of science data home.
        </p>
        <div className="mt-3 space-y-1 rounded-xl bg-white p-3 shadow-sm">
          <Row label="Mission budget" value={`$${gate.budget.toFixed(1)}M`} />
          <Row label={`Government pays (${Math.round(gate.share * 100)}%)`} value={`$${gate.grant.toFixed(1)}M`} />
          <Row label="Agency pays now" value={<span className="text-orange-600">${gate.agencyPays.toFixed(1)}M</span>} />
          <Row label="Agency funds" value={`$${gate.funds.toFixed(1)}M`} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          You pay when you approve the plan (Go). Unspent budget comes back when the mission ends. The higher your
          popularity, the more the government pays.
        </p>
        {gate.busy && <p className="mt-2 text-sm font-medium text-red-600">One mission at a time: {MISSION_NAME} is still flying.</p>}
        {!gate.busy && gate.missing > 0 && (
          <p className="mt-2 text-sm font-medium text-red-600">
            ${gate.missing.toFixed(1)}M short. Let time pass: funding comes in every day.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button onClick={() => onClose(false)} className="flex-1 rounded-lg border-2 border-slate-300 py-2 font-semibold text-slate-600 hover:bg-white">
            Cancel
          </button>
          <div className="flex-1">
            <ActionButton
              disabled={!gate.canStart}
              onClick={() => {
                onClose(true)
                beginPlanning()
              }}
            >
              Start planning
            </ActionButton>
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-500">The clock stops while you plan.</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Panel contents per building                                         */
/* ------------------------------------------------------------------ */

function HeadquartersPanel({ view, onNewMission }: { view: BaseView; onNewMission: () => void }) {
  const a = useAgencyStore()
  const gate = useNewMissionGate()
  const phases = campaign(a)
  const m = a.mission
  return (
    <>
      <Section title="Road to Mars">
        <div className="space-y-2.5">
          {phases.map((p) => (
            <div key={p.id}>
              <div className="flex items-center justify-between text-sm font-bold text-slate-800">
                <span>{p.name}</span>
                <span className="tabular-nums text-slate-500">{Math.round(phaseProgress(p) * 100)}%</span>
              </div>
              <Bar value={phaseProgress(p)} tone={phaseProgress(p) === 1 ? 'bg-emerald-500' : 'bg-orange-500'} />
              <ul className="mt-1 space-y-0.5">
                {p.goals.map((g) => (
                  <li key={g.label} className={`text-xs ${g.state === 'locked' ? 'text-slate-400' : 'text-slate-700'}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon
                        name={g.state === 'done' ? 'check' : g.state === 'active' ? 'dot' : 'lock'}
                        className={`h-3.5 w-3.5 ${g.state === 'done' ? 'text-emerald-600' : g.state === 'active' ? 'text-orange-500' : 'text-slate-400'}`}
                      />
                      {g.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Funding right now">
        <Row label="Government funding" value={`$${(fundingPerDay(a.popularity) * 30).toFixed(2)}M / month`} />
        <Row label="Mission grant share" value={`${Math.round(grantShare(a.popularity) * 100)}% of the budget`} />
        <Row label={`Agency share of a $${gate.budget}M mission`} value={`$${gate.agencyPays.toFixed(1)}M`} />
        <p className="mt-1.5 text-xs text-slate-500">
          Popularity drives both. Launches, papers and successes raise it; a lost mission lowers it. The agency cannot
          go bankrupt: what you cannot afford, you wait for.
        </p>
      </Section>

      {view.stage === 'ended' && m && (
        <Section title={`${MISSION_NAME}: result`}>
          <p className="text-sm font-bold">
            {m.last.outcome === 'success' ? 'Full success' : m.last.outcome === 'partial' ? 'Partial success' : 'Mission lost'}
          </p>
          <Row label="Ice map" value={`${m.last.coverage.toFixed(0)}%`} />
          <Row label="Science data home" value={`${Math.round(m.last.dataMb)} MB`} />
          <div className="mt-2">
            <OpenMissionButton label="Open the full report" />
          </div>
        </Section>
      )}

      <ActionButton onClick={onNewMission} disabled={gate.busy}>
        + New mission
      </ActionButton>
    </>
  )
}

function FactoryPanel({ view }: { view: BaseView }) {
  const d = view.details
  if (view.stage === 'planning') {
    const p = planningProgress()
    return (
      <Section title={`${MISSION_NAME}: design`}>
        <Row label="Step" value={`${p.step} (${p.index} of ${p.total})`} />
        <div className="my-2">
          <Bar value={p.index / p.total} />
        </div>
        <OpenMissionButton label="Continue planning" />
      </Section>
    )
  }
  if (view.stage === 'build' && d) {
    const s = d.stagesLeft
    return (
      <>
        <DecisionCard details={d} />
        <Section title={`${MISSION_NAME}: build`}>
          <Row label="Design" value={months(s.design)} />
          <Row label="Build" value={months(s.build)} />
          <Row label="Tests (Test Facility)" value={months(s.test)} />
          <Row label="Integration" value={months(s.integration)} />
          <div className="mt-2">
            <OpenMissionButton />
          </div>
        </Section>
      </>
    )
  }
  return null
}

const TEST_FACTORS = [2.0, 1.4, 1.0, 0.7]

function TestPanel({ view }: { view: BaseView }) {
  const d = view.details
  return (
    <>
      {d && view.stage === 'test' && <DecisionCard details={d} />}
      {d && (view.stage === 'build' || view.stage === 'test') && (
        <Section title={`${MISSION_NAME}: tests`}>
          <Row label="Test months booked" value={d.testTurns} />
          <Row label="Test months left" value={d.stagesLeft.test} />
          <Row label="Failure odds in flight" value={`× ${d.testFactor.toFixed(1)}`} />
        </Section>
      )}
      <Section title="Why test?">
        <div className="grid grid-cols-4 gap-1 text-center text-xs">
          {TEST_FACTORS.map((f, i) => (
            <div key={i} className="rounded-lg bg-slate-50 p-1.5">
              <div className="font-bold text-slate-800">{i} mo</div>
              <div className="text-slate-500">odds × {f.toFixed(1)}</div>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">More testing costs time and money, but makes thruster, radio and computer failures rarer.</p>
      </Section>
    </>
  )
}

function LaunchPanel({ view }: { view: BaseView }) {
  const a = useAgencyStore()
  const m = a.mission
  const d = view.details
  return (
    <>
      {d && view.stage === 'wait' && <DecisionCard details={d} />}
      {m && !m.last.ended && (
        <Section title={`${MISSION_NAME}: ride`}>
          <Row label="Ride leaves on" value={`Day ${missionLaunchDay(m)}`} />
          {!m.last.launched ? (
            <Row label="Countdown" value={`${view.daysToRide} days`} />
          ) : (
            <Row label="Status" value="Launched" />
          )}
          {d && d.missedRides > 0 && <Row label="Missed rides" value={d.missedRides} />}
          <p className="mt-1.5 text-xs text-slate-500">If the spacecraft is not ready, it waits 6 months for the next ride, and the team keeps getting paid.</p>
        </Section>
      )}
    </>
  )
}

function CommsPanel({ view }: { view: BaseView }) {
  const d = view.details
  if (!d) return null
  const inFlight = view.stage === 'transfer' || view.stage === 'orbit'
  return (
    <>
      <DecisionCard details={d} />
      <Section title={`${MISSION_NAME}: link`}>
        <Row label="Ground station" value={d.station} />
        {d.contactHours !== null && <Row label="Contact" value={`${d.contactHours} h a day`} />}
        <Row label="Phase" value={inFlight ? (view.stage === 'orbit' ? 'Science orbit' : 'Transfer') : 'Not launched yet'} />
      </Section>
      {inFlight && (
        <Section title="Science so far">
          <Row label="Ice map" value={`${d.coverage.toFixed(0)}% of 70%`} />
          <Bar value={d.coverage / 70} tone="bg-sky-500" />
          <div className="mt-1.5" />
          <Row label="Data home" value={`${Math.round(d.dataMb)} of ${d.dataTarget} MB`} />
          <Bar value={d.dataMb / d.dataTarget} tone="bg-sky-500" />
          <div className="mt-1.5" />
          <Row label="Months in orbit" value={d.turnsInOrbit} />
          <Row label="Fuel left" value={`${Math.round(d.fuelMs)} m/s`} />
          <Row label="Mission budget left" value={`$${d.moneyLeft.toFixed(1)}M`} />
        </Section>
      )}
      {d.recentNotes.length > 0 && (
        <Section title="Latest from the spacecraft">
          <ul className="space-y-0.5 text-xs text-slate-600">
            {d.recentNotes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        </Section>
      )}
      <OpenMissionButton />
    </>
  )
}

function ResearchPanel() {
  const r = useAgencyStore((s) => s.research)
  const backlog = Math.max(0, r.received - r.processed)
  const started = new Set(r.papers.map((p) => p.id))
  return (
    <>
      <Section title="Data">
        <Row label="Received from missions" value={`${Math.round(r.received)} MB`} />
        <Row label="Processed" value={`${Math.round(r.processed)} MB`} />
        <Bar value={r.received ? r.processed / r.received : 0} tone="bg-teal-500" />
        <p className="mt-1.5 text-xs text-slate-500">
          The team works through {research.processingPerDay} MB a day{backlog > 0 ? `; ${Math.ceil(backlog / research.processingPerDay)} days of work waiting` : ''}.
        </p>
      </Section>
      <Section title="Papers">
        {r.papers.length === 0 && <p className="text-sm text-slate-500">No papers yet. The first comes once mission data arrives.</p>}
        <ul className="space-y-2">
          {r.papers.map((p) => (
            <li key={p.id} className="text-sm">
              <div className="font-medium text-slate-800">{p.title}</div>
              {p.publishedDay !== null ? (
                <div className="text-xs text-emerald-700">
                  Published day {p.publishedDay} · +${p.money}M · +{p.popularity}% popularity
                </div>
              ) : (
                <>
                  <Bar value={paperProgress(r, p)} tone="bg-teal-500" />
                  <div className="text-xs text-slate-500">Writing · {Math.round(paperProgress(r, p) * 100)}%</div>
                </>
              )}
            </li>
          ))}
        </ul>
        {lunarPapers.some((s) => !started.has(s.id)) && (
          <div className="mt-2 border-t border-slate-100 pt-1.5 text-xs text-slate-500">
            Still to come:{' '}
            {lunarPapers
              .filter((s) => !started.has(s.id))
              .map((s) => (s.trigger.kind === 'coverage' ? `${s.trigger.percent}% ice map` : `first ${s.trigger.mb} MB`))
              .join(', ')}
          </div>
        )}
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Panel frame                                                         */
/* ------------------------------------------------------------------ */

export function BuildingPanel({
  target,
  view,
  onClose,
  onNewMission,
}: {
  target: MapTarget
  view: BaseView
  onClose: () => void
  onNewMission: () => void
}) {
  const b = target === 'locked' ? null : buildings.find((x) => x.id === target)!
  const name = b ? b.name : lockedPlot.name
  const about = b ? b.about : lockedPlot.about

  let content: React.ReactNode = null
  switch (target) {
    case 'hq':
      content = <HeadquartersPanel view={view} onNewMission={onNewMission} />
      break
    case 'factory':
      content = <FactoryPanel view={view} />
      break
    case 'test-facility':
      content = <TestPanel view={view} />
      break
    case 'launch-site':
      content = <LaunchPanel view={view} />
      break
    case 'comms-center':
      content = <CommsPanel view={view} />
      break
    case 'research-lab':
      content = <ResearchPanel />
      break
  }

  return (
    <div className="absolute bottom-3 right-3 top-20 z-30 flex w-[min(380px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl bg-[#fbf8f2] text-slate-800 shadow-2xl">
      <div className="flex items-start gap-3 bg-[#14213d] px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold">{name}</h2>
          {b && view.active === b.id && view.stage !== 'none' && (
            <span className="text-xs font-semibold text-orange-300">{MISSION_NAME} is here now</span>
          )}
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white">
          <Icon name="close" />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <p className="text-sm text-slate-600">{about}</p>
        {content}
      </div>
    </div>
  )
}
