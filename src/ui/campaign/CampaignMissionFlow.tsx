import { useEffect, useRef, useState, type ReactNode } from 'react'
import { missionById, pickedOption, planOf, type CampaignMission } from '../../campaign/missions'
import { outcomeOdds } from '../../campaign/flight'
import { agencyShare, canAfford } from '../../campaign/ledger'
import { useCampaignStore, type ActiveMission } from '../../state/campaignStore'
import { useWorldStore } from '../../state/worldStore'
import { LiftoffShow } from '../../campaign/scenes/LiftoffShow'
import { PayoffShow } from '../../campaign/scenes/PayoffShow'
import type { Outcome } from '../../campaign/scenes/types'
import { audio } from '../../assets/audio'
import { Stamp } from '../kit'
import { MissionArt } from './MissionArt'
import { DetailsPanel, DetailsToggle } from '../kit'

/*
 * One campaign mission (missions 2-4), full screen: brief, one screen per design
 * choice, Go, then the liftoff show, the cruise, the payoff and the result.
 * Screen budget on every screen: one decision, at most three numbers, one main action,
 * the rest behind "Details".
 */

const money = (m: number) => `$${m.toFixed(m >= 100 ? 0 : 1)}M`
const pct = (x: number) => `${Math.round(x * 100)}%`

const THEME: Record<CampaignMission['id'], string> = {
  'ice-mapper': 'campaign-theme-moon',
  'moon-landing': 'campaign-theme-moon',
  'moon-base': 'campaign-theme-base',
  'mars-base': 'campaign-theme-mars',
}

function Frame({
  mission,
  step,
  title,
  kicker,
  children,
  numbers,
  action,
  back,
  details,
  outcome,
}: {
  outcome?: Outcome
  mission: CampaignMission
  step: string
  title: string
  kicker?: string
  children?: ReactNode
  numbers?: { label: string; value: string; tone?: string }[]
  action: { label: string; onClick?: () => void; why?: string }
  back?: () => void
  details?: ReactNode
}) {
  const abandon = useCampaignStore((s) => s.abandon)
  return (
    <div className={`campaign-backdrop ${THEME[mission.id]} fixed inset-0 z-40 overflow-y-auto text-paper`} role="dialog" aria-modal="true" aria-label={title}>
      <MissionArt id={mission.id} outcome={outcome} stage={step === 'Brief' ? 'brief' : step === 'Result' ? 'result' : 'design'} />
      <div className="relative mx-auto flex min-h-full max-w-3xl flex-col px-4 py-6">
        <header className="flex items-center justify-between gap-3">
          <div className="fp-label text-[0.65rem] text-kapton">
            Mission {mission.n} · {mission.name} · {step}
          </div>
          <button type="button" onClick={abandon} className="fp-btn-ghost !py-1 text-xs">
            Back to the campaign
          </button>
        </header>
        <div key={title} className="campaign-enter mt-6 flex-1">
          {kicker && <div className="fp-label text-[0.62rem] text-paper-faint">{kicker}</div>}
          <h1 className="fp-display mt-1 text-3xl text-paper">{title}</h1>
          <div className="mt-5">{children}</div>
        </div>
        <footer className="sticky bottom-0 mt-6 border-t border-rule bg-ink-0/90 pb-2 pt-3 backdrop-blur">
          {numbers && numbers.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {numbers.slice(0, 3).map((n) => (
                <div key={n.label} className="border border-rule bg-ink-1 px-3 py-2">
                  <div className="fp-label text-[0.58rem] text-paper-faint">{n.label}</div>
                  <div className={`fp-data text-lg font-semibold ${n.tone ?? 'text-paper'}`}>{n.value}</div>
                </div>
              ))}
            </div>
          )}
          {action.why && <p className="mt-2 text-xs text-nogo">{action.why}</p>}
          <div className="mt-3 flex items-center gap-2">
            {back && (
              <button type="button" onClick={back} className="fp-btn-secondary">
                ← Back
              </button>
            )}
            {details && <DetailsToggle id={`campaign-${mission.id}-${step}`} />}
            <button
              type="button"
              disabled={!action.onClick}
              onClick={action.onClick}
              className="fp-btn-primary ml-auto min-w-48 justify-center disabled:cursor-not-allowed disabled:opacity-40"
            >
              {action.label}
            </button>
          </div>
          {details && (
            <DetailsPanel id={`campaign-${mission.id}-${step}`}>
              <div className="mt-3 max-h-60 overflow-y-auto border-t border-rule pt-3 text-xs text-paper-dim">{details}</div>
            </DetailsPanel>
          )}
        </footer>
      </div>
    </div>
  )
}

function Brief({ a, mission }: { a: ActiveMission; mission: CampaignMission }) {
  const goTo = useCampaignStore((s) => s.goTo)
  const fact = mission.choices.flatMap((c) => c.options).find((o) => o.fact)?.fact ?? mission.facts[0]
  return (
    <Frame
      mission={mission}
      step="Brief"
      kicker="Objective"
      title={mission.objective}
      action={{ label: 'Start the design →', onClick: () => goTo({ kind: 'choice', index: 0 }) }}
      details={
        <ul className="space-y-1">
          {mission.choices.map((c) => (
            <li key={c.id}>· {c.question}</li>
          ))}
          <li className="text-paper-faint">Rocket: {mission.rocketName}. Flight time on the agency clock: {mission.months} months.</li>
        </ul>
      }
    >
      <p className="max-w-xl text-lg text-paper-dim">{mission.brief}</p>
      {fact && (
        <p className="mt-6 max-w-xl border-l-2 border-ice/60 pl-3 text-sm text-paper-dim">
          {fact.text} <span className="text-paper-faint">({fact.source})</span>
        </p>
      )}
      <p className="sr-only">{a.missionId}</p>
    </Frame>
  )
}

function Choice({ a, mission, index }: { a: ActiveMission; mission: CampaignMission; index: number }) {
  const goTo = useCampaignStore((s) => s.goTo)
  const pick = useCampaignStore((s) => s.pick)
  const choice = mission.choices[index]
  const picked = pickedOption(choice, a.picks)
  const plan = planOf(mission, a.picks)
  const last = index === mission.choices.length - 1
  return (
    <Frame
      mission={mission}
      step={`Design ${index + 1} of ${mission.choices.length}`}
      title={choice.question}
      numbers={[
        { label: 'Budget', value: money(plan.budget) },
        { label: 'Chance of success', value: pct(plan.success), tone: plan.success >= 0.7 ? 'text-go' : plan.success >= 0.5 ? 'text-caution' : 'text-nogo' },
        { label: 'Science', value: `${plan.science} pts`, tone: 'text-ice' },
      ]}
      back={() => goTo(index === 0 ? { kind: 'brief' } : { kind: 'choice', index: index - 1 })}
      action={{ label: last ? 'Review the launch →' : 'Next →', onClick: () => goTo(last ? { kind: 'go' } : { kind: 'choice', index: index + 1 }) }}
      details={
        <table className="w-full">
          <thead>
            <tr className="fp-label text-left text-[0.58rem] text-paper-faint">
              <th className="py-1">Option</th>
              <th>Cost</th>
              <th>Landing</th>
              <th>Science</th>
              <th>Popularity</th>
            </tr>
          </thead>
          <tbody className="fp-data">
            {choice.options.map((o) => (
              <tr key={o.id} className={o.id === picked.id ? 'text-paper' : ''}>
                <td className="py-0.5">{o.name}</td>
                <td>+{money(o.cost)}</td>
                <td>{o.reliability >= 0 ? '+' : '−'}{Math.abs(Math.round(o.reliability * 100))} pts</td>
                <td>{o.science}</td>
                <td>{o.hype >= 0 ? '+' : '−'}{Math.abs(o.hype)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="pt-2 text-paper-faint">
                All costs, chances and points are game values.
              </td>
            </tr>
            {choice.options
              .filter((o) => o.fact)
              .map((o) => (
                <tr key={`fact-${o.id}`}>
                  <td colSpan={5} className="pt-1">
                    Real: {o.fact!.text} <span className="text-paper-faint">({o.fact!.source})</span>
                  </td>
                </tr>
              ))}
          </tfoot>
        </table>
      }
    >
      <div className={`grid gap-3 ${choice.options.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {choice.options.map((o) => {
          const on = o.id === picked.id
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                pick(choice.id, o.id)
                audio.play('sfx.select')
              }}
              className={`campaign-option group flex flex-col border p-4 text-left transition-all ${
                on ? 'border-kapton bg-ink-2 shadow-[0_0_0_1px_var(--color-kapton)]' : 'border-rule bg-ink-1/80 hover:border-rule-strong hover:bg-ink-2'
              }`}
            >
              <span className={`fp-label text-[0.6rem] ${on ? 'text-kapton' : 'text-paper-faint'}`}>{on ? 'Selected' : 'Option'}</span>
              <span className="fp-display mt-1 text-lg text-paper">{o.name}</span>
              <span className="mt-1 text-sm text-paper-dim">{o.line}</span>
              {/* The real-world anchor shows on pick, not as a standing paragraph (screen budget) */}
              {on && o.fact && (
                <span className="mt-auto border-l-2 border-ice/50 pl-2 pt-3 text-[0.72rem] leading-snug text-paper-faint">
                  Real: {o.fact.text}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </Frame>
  )
}

function Go({ a, mission }: { a: ActiveMission; mission: CampaignMission }) {
  const goTo = useCampaignStore((s) => s.goTo)
  const launch = useCampaignStore((s) => s.launch)
  const funds = useWorldStore((s) => s.funds)
  const popularity = useWorldStore((s) => s.popularity)
  const plan = planOf(mission, a.picks)
  const share = agencyShare(plan, popularity)
  const ok = canAfford({ funds, popularity }, plan)
  const odds = outcomeOdds(mission, a.picks)
  return (
    <Frame
      mission={mission}
      step="Go / No-Go"
      kicker={mission.rocketName}
      title="Go for launch?"
      numbers={[
        { label: 'You pay at Go', value: money(share), tone: ok ? 'text-paper' : 'text-nogo' },
        { label: 'Chance of success', value: pct(plan.success), tone: plan.success >= 0.7 ? 'text-go' : plan.success >= 0.5 ? 'text-caution' : 'text-nogo' },
        { label: 'Milestone award', value: money(mission.award.first), tone: 'text-go' },
      ]}
      back={() => goTo({ kind: 'choice', index: mission.choices.length - 1 })}
      action={{
        label: 'Launch',
        onClick: ok
          ? () => {
              audio.play('sfx.go')
              launch()
            }
          : undefined,
        why: ok ? undefined : `You have ${money(funds)}. Fly a cheaper mission first, or choose cheaper options.`,
      }}
      details={
        <div className="space-y-1">
          <p>
            Budget {money(plan.budget)}. The government pays {money(plan.budget - share)} at {Math.round(popularity)}% popularity.
          </p>
          <p>
            Rocket reaches the {mission.id === 'mars-base' ? 'transfer' : 'Moon'}: {pct(mission.launchReliability)}. Landing works: {pct(plan.landing)}.
          </p>
          <p>
            Outcomes: success {pct(odds.success)}, partial {pct(odds.partial)}, failure {pct(odds.failed)}. A failure burns your share.
          </p>
          <p className="text-paper-faint">Game values.</p>
        </div>
      }
    >
      <ul className="space-y-2">
        {mission.choices.map((c) => (
          <li key={c.id} className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <span className="text-sm text-paper-faint">{c.question}</span>
            <span className="fp-display text-right text-base text-paper">{pickedOption(c, a.picks).name}</span>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

/** The trip, in a few seconds: an arc from Earth to the destination */
function Cruise({ a, mission }: { a: ActiveMission; mission: CampaignMission }) {
  const done = useCampaignStore((s) => s.cruiseDone)
  const [month, setMonth] = useState(0)
  const mars = mission.id === 'mars-base'
  const total = mission.months
  useEffect(() => {
    audio.play('sfx.whoosh')
    const per = 4200 / Math.max(1, total)
    const iv = setInterval(() => setMonth((m) => Math.min(total, m + 1)), per)
    const t = setTimeout(done, 4800)
    return () => {
      clearInterval(iv)
      clearTimeout(t)
    }
  }, [done, total])
  const arc = useRef<SVGPathElement>(null)
  const dot = useRef<SVGCircleElement>(null)
  useEffect(() => {
    const t0 = performance.now()
    let raf = 0
    const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
    const frame = (now: number) => {
      const k = ease(Math.min(1, (now - t0) / 4400))
      const p = arc.current
      if (p && dot.current) {
        const pt = p.getPointAtLength(k * p.getTotalLength())
        dot.current.setAttribute('cx', String(pt.x))
        dot.current.setAttribute('cy', String(pt.y))
      }
      if (k < 1) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])
  const cruiseLine = a.flight?.beats.find((b) => b.phase === 'cruise')?.line ?? ''
  return (
    <div className={`campaign-backdrop ${THEME[mission.id]} fixed inset-0 z-40 flex flex-col items-center justify-center text-paper`} role="dialog" aria-modal="true" aria-label="Cruise">
      <svg viewBox="0 0 1000 420" className="w-full max-w-5xl">
        <defs>
          <radialGradient id="cr-earth" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#8fd0ff" />
            <stop offset="60%" stopColor="#1c5a9a" />
            <stop offset="100%" stopColor="#0a1a30" />
          </radialGradient>
          <radialGradient id="cr-dest" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor={mars ? '#f0a070' : '#e0dbd0'} />
            <stop offset="60%" stopColor={mars ? '#b8532c' : '#8b877e'} />
            <stop offset="100%" stopColor={mars ? '#4a1d10' : '#2a2925'} />
          </radialGradient>
        </defs>
        <circle cx={150} cy={300} r={70} fill="url(#cr-earth)" />
        <circle cx={150} cy={300} r={75} fill="none" stroke="#7cc4ff" strokeOpacity={0.35} strokeWidth={4} />
        <circle cx={850} cy={mars ? 150 : 170} r={mars ? 60 : 40} fill="url(#cr-dest)" />
        <path ref={arc} d={`M 220 290 Q 500 ${mars ? -40 : 40} ${mars ? 790 : 810} ${mars ? 150 : 170}`} fill="none" stroke="#3a4254" strokeWidth={2} strokeDasharray="5 8" />
        <path d={`M 220 290 Q 500 ${mars ? -40 : 40} ${mars ? 790 : 810} ${mars ? 150 : 170}`} fill="none" stroke="#e8a33d" strokeWidth={3} pathLength={100} className="campaign-cruise-trail" />
        <circle ref={dot} r={7} cx={220} cy={290} fill="#fff4dc" className="campaign-cruise-dot" />
      </svg>
      <div className="fp-label text-[0.7rem] text-kapton">Month {month} of {total}</div>
      <p className="mt-2 text-lg text-paper">{cruiseLine}</p>
      <button type="button" onClick={done} className="fp-btn-ghost absolute right-4 top-4">
        Skip ▸
      </button>
    </div>
  )
}

const OUTCOME = {
  success: { stamp: 'Success', verdict: 'go', title: 'Mission complete' },
  partial: { stamp: 'Partial', verdict: 'caution', title: 'Partial success' },
  failed: { stamp: 'Failed', verdict: 'nogo', title: 'Mission failed' },
} as const

function Result({ a, mission }: { a: ActiveMission; mission: CampaignMission }) {
  const finish = useCampaignStore((s) => s.finish)
  const r = a.result!
  const look = OUTCOME[r.outcome]
  const line = a.flight!.failedAt === 'launch' ? a.flight!.beats[0].line : (a.flight!.beats.find((b) => b.phase === 'landing')?.line ?? '')
  useEffect(() => {
    audio.playMusic(r.outcome === 'failed' ? 'music.failure' : 'music.success', 800)
  }, [r.outcome])
  const signed = (x: number, f: (v: number) => string) => `${x >= 0 ? '+' : '−'}${f(Math.abs(x))}`
  return (
    <Frame
      mission={mission}
      step="Result"
      outcome={r.outcome}
      title={look.title}
      numbers={[
        { label: 'Money', value: signed(r.moneyNet, money), tone: r.moneyNet >= 0 ? 'text-go' : 'text-nogo' },
        { label: 'Popularity', value: signed(r.popularityNet, (v) => `${Math.round(v)}%`), tone: r.popularityNet >= 0 ? 'text-go' : 'text-nogo' },
        { label: 'Science', value: `${r.science} pts`, tone: 'text-ice' },
      ]}
      action={{ label: 'Back to the campaign →', onClick: finish }}
      details={
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Money', r.money, money],
            ['Popularity', r.popularity, (v: number) => `${Math.round(v)}%`],
          ].map(([title, rows, f]) => (
            <div key={title as string}>
              <div className="fp-label text-[0.58rem]">{title as string}</div>
              <ul className="fp-data">
                {(rows as { label: string; amount: number }[]).map((row) => (
                  <li key={row.label} className="flex justify-between border-b border-rule py-0.5">
                    <span className="text-paper-dim">{row.label}</span>
                    <span className={row.amount >= 0 ? 'text-go' : 'text-nogo'}>{signed(row.amount, f as (v: number) => string)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <ol className="col-span-2 space-y-0.5">
            {a.flight!.beats.map((b) => (
              <li key={b.phase} className={b.ok ? 'text-paper-dim' : 'text-nogo'}>
                {b.phase}: {b.line}
              </li>
            ))}
          </ol>
        </div>
      }
    >
      <div className="flex items-center gap-6">
        <Stamp verdict={look.verdict} animate size="lg">
          {look.stamp}
        </Stamp>
        <p className="text-lg text-paper-dim">{line}</p>
      </div>
    </Frame>
  )
}

export function CampaignMissionFlow() {
  const a = useCampaignStore((s) => s.active)
  const liftoffDone = useCampaignStore((s) => s.liftoffDone)
  const payoffDone = useCampaignStore((s) => s.payoffDone)
  if (!a) return null
  const mission = missionById(a.missionId)
  switch (a.stage.kind) {
    case 'brief':
      return <Brief a={a} mission={mission} />
    case 'choice':
      return <Choice a={a} mission={mission} index={a.stage.index} />
    case 'go':
      return <Go a={a} mission={mission} />
    case 'liftoff':
      return <LiftoffShow rocket={mission.rocket} missionName={mission.name} launchFails={a.flight?.failedAt === 'launch'} onDone={liftoffDone} />
    case 'cruise':
      return <Cruise a={a} mission={mission} />
    case 'payoff':
      return <PayoffShow kind={mission.payoff} outcome={a.flight!.outcome} onDone={payoffDone} />
    case 'result':
      return a.result ? <Result a={a} mission={mission} /> : null
  }
}
