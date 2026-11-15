import { useEffect, useState } from 'react'
import { CAMPAIGN, type CampaignMission } from '../../campaign/missions'
import { buildUpMission, gateProgress, ladder, nextMission, type Rung } from '../../campaign/progress'
import { useCampaignStore } from '../../state/campaignStore'
import { useWorldStore } from '../../state/worldStore'
import { useGameStore } from '../../state/gameStore'
import { isSimComplete } from '../../sim/simulate'
import { Stamp } from '../kit'

/*
 * The campaign view (PROTOTYPE): the ladder from the ice map to a base on Mars, over the agency
 * base. Screen budget: one decision (what to fly next), the gate as two bars, one main action,
 * every other number behind "Details".
 */

const money = (m: number) => `$${Math.round(m)}M`

/** Where each rung sits on the trajectory drawing (viewBox 1000 × 300) */
const NODE = [
  { x: 190, y: 215, r: 26 },
  { x: 420, y: 115, r: 30 },
  { x: 650, y: 165, r: 34 },
  { x: 880, y: 90, r: 44 },
]
const BODY: Record<CampaignMission['id'], { fill: string; ring: string; label: string }> = {
  'ice-mapper': { fill: 'url(#cg-moon)', ring: '#5ee6f0', label: 'Lunar orbit' },
  'moon-landing': { fill: 'url(#cg-moon)', ring: '#ede6d6', label: 'Lunar surface' },
  'moon-base': { fill: 'url(#cg-moon)', ring: '#e8a33d', label: 'Lunar base' },
  'mars-base': { fill: 'url(#cg-mars)', ring: '#e07a4f', label: 'Mars' },
}

function Trajectory({ rungs, selected, onSelect }: { rungs: Rung[]; selected: number; onSelect: (i: number) => void }) {
  const path = `M 70 280 C 110 270, 150 240, ${NODE[0].x} ${NODE[0].y} S 300 110, ${NODE[1].x} ${NODE[1].y} S 560 180, ${NODE[2].x} ${NODE[2].y} S 820 70, ${NODE[3].x} ${NODE[3].y}`
  const nextIdx = rungs.findIndex((r) => r.state === 'next')
  const doneTo = nextIdx === -1 ? 3 : nextIdx
  return (
    <svg viewBox="0 0 1000 300" className="w-full overflow-visible" role="img" aria-label="Campaign trajectory">
      <defs>
        <radialGradient id="cg-moon" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#d9d4c8" />
          <stop offset="60%" stopColor="#8b877e" />
          <stop offset="100%" stopColor="#3a3833" />
        </radialGradient>
        <radialGradient id="cg-mars" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#f0a070" />
          <stop offset="55%" stopColor="#b8532c" />
          <stop offset="100%" stopColor="#4a1d10" />
        </radialGradient>
        <radialGradient id="cg-earth" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#8fd0ff" />
          <stop offset="55%" stopColor="#1c5a9a" />
          <stop offset="100%" stopColor="#0a1a30" />
        </radialGradient>
        <linearGradient id="cg-done" x1="0" x2="1">
          <stop offset="0%" stopColor="#6faf7a" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#6faf7a" />
        </linearGradient>
      </defs>
      {/* the whole route, dashed */}
      <path d={path} fill="none" stroke="#3a4254" strokeWidth={2} strokeDasharray="6 8" />
      {/* the part already flown, solid, drawn on */}
      <path
        d={path}
        fill="none"
        stroke="url(#cg-done)"
        strokeWidth={3}
        pathLength={100}
        strokeDasharray={`${[8, 36, 64, 100][doneTo]} 100`}
        className="campaign-draw"
      />
      {/* Earth at the start */}
      <circle cx={40} cy={285} r={30} fill="url(#cg-earth)" />
      <circle cx={40} cy={285} r={33} fill="none" stroke="#7cc4ff" strokeOpacity={0.35} strokeWidth={3} />
      <text x={40} y={334} textAnchor="middle" className="fill-paper-faint fp-label" fontSize={11}>
        Earth
      </text>
      {rungs.map((r, i) => {
        const n = NODE[i]
        const b = BODY[r.mission.id]
        const isNext = r.state === 'next'
        const sel = i === selected
        return (
          <g
            key={r.mission.id}
            role="button"
            tabIndex={0}
            aria-label={`${r.mission.name}: ${r.state}`}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(i)}
            className="cursor-pointer outline-none"
            opacity={r.state === 'locked' ? 0.45 : 1}
          >
            {isNext && (
              <circle cx={n.x} cy={n.y} r={n.r + 10} fill="none" stroke="#e8a33d" strokeWidth={2} className="campaign-pulse" style={{ transformOrigin: `${n.x}px ${n.y}px` }} />
            )}
            <circle cx={n.x} cy={n.y} r={n.r} fill={b.fill} />
            {r.mission.id === 'ice-mapper' && <circle cx={n.x} cy={n.y + n.r * 0.55} r={n.r * 0.35} fill="#5ee6f0" opacity={r.state === 'flown' ? 0.75 : 0.2} />}
            {r.mission.id === 'moon-base' && (
              <g opacity={r.state === 'flown' ? 1 : 0.5}>
                <rect x={n.x - 10} y={n.y - n.r - 9} width={20} height={9} rx={4} fill="#ede6d6" />
                <circle cx={n.x + 14} cy={n.y - n.r - 4} r={5} fill="#e8a33d" />
              </g>
            )}
            <circle cx={n.x} cy={n.y} r={n.r + 3} fill="none" stroke={sel ? '#e8a33d' : r.state === 'flown' ? '#6faf7a' : '#3a4254'} strokeWidth={sel ? 3 : 1.5} />
            {r.state === 'flown' && (
              <g transform={`translate(${n.x + n.r * 0.7}, ${n.y - n.r * 0.7})`}>
                <circle r={10} fill="#6faf7a" />
                <path d="M -5 0 L -1 4 L 5 -4" stroke="#07090d" strokeWidth={2.5} fill="none" />
              </g>
            )}
            {r.state === 'locked' && (
              <path
                transform={`translate(${n.x - 8}, ${n.y - 9}) scale(0.7)`}
                d="M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z"
                stroke="#ede6d6"
                strokeWidth={2.4}
                fill="#07090d"
                fillOpacity={0.6}
              />
            )}
            <text x={n.x} y={n.y + n.r + 24} textAnchor="middle" className="fill-paper fp-display" fontSize={17}>
              {r.mission.n}. {r.mission.name}
            </text>
            <text x={n.x} y={n.y + n.r + 42} textAnchor="middle" className="fill-paper-faint fp-label" fontSize={11}>
              {b.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function Bar({ label, value, target, share, fmt }: { label: string; value: number; target: number; share: number; fmt: (x: number) => string }) {
  const met = value >= target
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="fp-label text-[0.62rem] text-paper-dim">{label}</span>
        <span className={`fp-data text-sm font-semibold ${met ? 'text-go' : 'text-paper'}`}>
          {fmt(value)} <span className="text-paper-faint">/ {fmt(target)}</span>
        </span>
      </div>
      <div className="mt-1 h-2.5 border border-rule bg-ink-0">
        <div className={`hud-bar-segments h-full transition-[width] duration-700 ${met ? 'bg-go' : 'bg-kapton'}`} style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
    </div>
  )
}

const OUTCOME_STAMP = { success: ['Success', 'go'], partial: ['Partial', 'caution'], failed: ['Failed', 'nogo'] } as const

export function CampaignLadder() {
  const progress = useCampaignStore((s) => s.progress)
  const close = useCampaignStore((s) => s.closeLadder)
  const start = useCampaignStore((s) => s.startMission)
  const funds = useWorldStore((s) => s.funds)
  const popularity = useWorldStore((s) => s.popularity)
  const simState = useGameStore((s) => s.simState)
  const rungs = ladder(progress, funds, popularity)
  const next = nextMission(progress)
  const nextIdx = next ? next.n - 1 : 3
  const [picked, setPicked] = useState<{ idx: number; forNext: number } | null>(null)
  // The card follows the highlighted next step unless the player clicked another rung since it moved
  const selected = picked && picked.forNext === nextIdx ? picked.idx : nextIdx
  const setSelected = (idx: number) => setPicked({ idx, forNext: nextIdx })
  const [details, setDetails] = useState(false)
  const gate = gateProgress(progress, funds, popularity)
  const iceFlying = !!simState && !isSimComplete(simState)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const rung = rungs[selected]
  const m = rung.mission
  const isNext = rung.state === 'next'
  const buildUp = buildUpMission(progress, popularity)

  // The one main action for the selected rung
  let action: { label: string; onClick?: () => void; why?: string }
  if (m.id === 'ice-mapper' && iceFlying) action = { label: 'Back to the flight', onClick: close }
  else if (rung.open) action = { label: rung.state === 'flown' ? `Fly the ${m.name} again` : `Plan the ${m.name} →`, onClick: () => start(m.id) }
  else if (isNext && gate && gate.previousFlown)
    action = iceFlying
      ? { label: 'Back to the flight', onClick: close, why: 'The Ice Mapper is still flying.' }
      : { label: `Build up: fly the ${buildUp.name} again`, onClick: () => start(buildUp.id), why: 'Not enough yet. Another flight earns money and popularity; time also brings funding.' }
  else action = { label: 'Locked', why: `Fly the ${CAMPAIGN[m.n - 2]?.name ?? 'mission before'} first.` }

  return (
    <div className="campaign-backdrop fixed inset-0 z-40 overflow-y-auto text-paper" role="dialog" aria-modal="true" aria-label="Campaign">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="fp-label text-[0.65rem] text-kapton">Headquarters · Campaign</div>
            <h1 className="fp-display mt-1 text-3xl text-paper">From the ice to Mars</h1>
          </div>
          <button type="button" onClick={close} className="fp-btn-ghost">
            Close ✕
          </button>
        </header>

        <div className="mt-4">
          <Trajectory rungs={rungs} selected={selected} onSelect={setSelected} />
        </div>

        {/* The selected rung: one card, one action */}
        <section className={`campaign-card mx-auto mt-2 w-full max-w-xl border bg-ink-1/90 p-5 ${isNext ? 'border-kapton/70' : 'border-rule'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="fp-label text-[0.62rem] text-paper-faint">
                Mission {m.n} · {isNext ? 'Next step' : rung.state === 'flown' ? 'Flown' : 'Locked'}
              </div>
              <h2 className="fp-display mt-0.5 text-2xl text-paper">{m.name}</h2>
              <p className="mt-1 text-sm text-paper-dim">{m.objective}</p>
            </div>
            {rung.best && (
              <Stamp verdict={OUTCOME_STAMP[rung.best][1]} className="mt-1 shrink-0">
                {OUTCOME_STAMP[rung.best][0]}
              </Stamp>
            )}
          </div>

          {isNext && gate && (
            <div className="mt-4 space-y-3">
              <div className="fp-label text-[0.62rem] text-paper-faint">
                {gate.previousFlown ? `Unlocks at ${money(gate.gate.funds)} and ${gate.gate.popularity}% popularity` : `Opens after the ${CAMPAIGN[m.n - 2].name}, at`}
              </div>
              <Bar label="Funds" value={funds} target={gate.gate.funds} share={gate.fundsShare} fmt={money} />
              <Bar label="Popularity" value={popularity} target={gate.gate.popularity} share={gate.popularityShare} fmt={(x) => `${Math.round(x)}%`} />
            </div>
          )}
          {isNext && !gate && CAMPAIGN[m.n] && (
            <p className="mt-3 text-xs text-paper-faint">
              Then: the {CAMPAIGN[m.n].name} unlocks at {money(CAMPAIGN[m.n].gate!.funds)} and {CAMPAIGN[m.n].gate!.popularity}% popularity.
            </p>
          )}
          {!next && <p className="mt-3 text-sm text-go">Campaign complete: your agency has a base on Mars.</p>}

          {action.why && <p className="mt-4 text-xs text-paper-dim">{action.why}</p>}
          <button
            type="button"
            disabled={!action.onClick}
            onClick={action.onClick}
            className="fp-btn-primary mt-3 w-full justify-center disabled:cursor-not-allowed disabled:opacity-40"
          >
            {action.label}
          </button>

          <button type="button" onClick={() => setDetails(!details)} aria-expanded={details} className="fp-label mt-4 text-[0.65rem] text-paper-faint hover:text-paper">
            Details {details ? '▴' : '▾'}
          </button>
          {details && (
            <div className="mt-2 space-y-3 text-xs">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="fp-label text-left text-[0.58rem] text-paper-faint">
                    <th className="border-b border-rule py-1">Mission</th>
                    <th className="border-b border-rule py-1">Gate</th>
                    <th className="border-b border-rule py-1">Budget</th>
                    <th className="border-b border-rule py-1">Award</th>
                    <th className="border-b border-rule py-1">Flights</th>
                  </tr>
                </thead>
                <tbody className="fp-data">
                  {rungs.map((r) => (
                    <tr key={r.mission.id} className="text-paper-dim">
                      <td className="border-b border-rule py-1 text-paper">{r.mission.name}</td>
                      <td className="border-b border-rule py-1">{r.mission.gate ? `${money(r.mission.gate.funds)} · ${r.mission.gate.popularity}%` : 'open'}</td>
                      <td className="border-b border-rule py-1">from {money(r.mission.baseBudget)}</td>
                      <td className="border-b border-rule py-1">{money(r.mission.award.first)}</td>
                      <td className="border-b border-rule py-1">{r.flights}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-paper-faint">
                Budgets, gates and awards are game values. The government pays part of each budget (more when popular); you pay the rest at Go. A failure burns
                your share; a success pays a milestone award.
              </p>
              {m.facts.map((f) => (
                <p key={f.text} className="border-l-2 border-ice/60 pl-2 text-paper-dim">
                  {f.text} <span className="text-paper-faint">({f.source})</span>
                </p>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
