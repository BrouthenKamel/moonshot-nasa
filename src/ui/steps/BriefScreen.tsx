import { useGameStore } from '../../state/gameStore'
import { lunarIceMapperBrief, difficultyPresets, modelConstants } from '../../data/brief'
import { computeBudgets } from '../../sim/budgets'
import { STEP_QUESTION, nextLabel } from '../kit'
import { STEP_NAMES, buildingName, firstStop } from '../../viz/missionMap'
import { audio } from '../../assets/audio'

/**
 * Step 0 · the mission brief, on one screen: the objective, the five things that count as success,
 * the limits the craft must fit, the schedule, and the first stop. Nothing scrolls.
 */

/** A requirement's target as a short headline: a number, or a word for the yes/no ones */
function target(req: (typeof lunarIceMapperBrief.requirements)[number], dataTarget: number): { value: string; unit: string } {
  switch (req.id) {
    case 'capture':
      return { value: 'Orbit', unit: 'reached' }
    case 'budget':
      return { value: 'Within', unit: 'budget' }
    case 'data':
      return { value: String(dataTarget), unit: req.unit }
    default:
      return { value: String(req.target), unit: req.unit }
  }
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-rule bg-ink-1/70 px-4 py-3">
      <div className="fp-label text-[0.62rem] tracking-[0.14em] text-paper-faint">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold leading-none text-paper">{value}</div>
      {sub && <div className="mt-1 truncate text-[0.72rem] text-paper-dim">{sub}</div>}
    </div>
  )
}

export function BriefScreen() {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const difficulty = useGameStore((s) => s.difficulty)
  const preset = difficultyPresets[difficulty] ?? difficultyPresets.engineer
  const brief = lunarIceMapperBrief
  const stop = firstStop()
  // The schedule of the craft on the drawing board: when its ride leaves and how long its trip takes
  const design = useGameStore((s) => s.design)
  const b = computeBudgets(design, difficulty)
  const ride = b.rideTurn
  const mapping = brief.missionDurationTurns
  const trip = b.transferTurns ?? modelConstants.cruiseTurns
  const total = ride + Math.max(trip, 0.5) + mapping

  return (
    <div className="mx-auto flex h-full min-h-[560px] max-w-6xl flex-col gap-5 overflow-hidden px-6 py-5">
      {/* The objective */}
      <div className="shrink-0">
        <div className="fp-label text-[0.68rem] tracking-[0.18em] text-kapton">Mission brief · {brief.name}</div>
        <p className="mt-2 max-w-4xl font-display text-[1.65rem] font-bold leading-snug text-paper">{brief.objective}</p>
      </div>

      {/* What counts as success */}
      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <h2 className="fp-label text-[0.7rem] tracking-[0.16em] text-paper">To succeed, the mission must</h2>
        <ol className="grid min-h-0 flex-1 grid-cols-5 gap-3">
          {brief.requirements.map((req, i) => {
            const t = target(req, preset.dataTarget)
            return (
              <li key={req.id} className="flex min-w-0 flex-col rounded-lg border border-rule bg-ink-1/70 p-4">
                <span className="fp-data text-[0.7rem] text-paper-faint">{String(i + 1).padStart(2, '0')}</span>
                <span className="mt-1 text-sm font-bold text-paper">{req.name}</span>
                <span className="my-auto py-3">
                  <span className="font-display text-3xl font-bold leading-none text-kapton">{t.value}</span>
                  <span className="ml-1.5 fp-data text-xs text-paper-dim">{t.unit}</span>
                </span>
                <span className="mt-2 line-clamp-3 text-[0.74rem] leading-snug text-paper-dim" title={req.description}>
                  {req.description}
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      {/* Limits and schedule */}
      <section className="grid shrink-0 grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,2fr)] gap-3">
        <Fact label="Spacecraft" value={`${brief.constraints.maxVolume}U CubeSat`} sub="10 × 20 × 30 cm" />
        <Fact label="Mass limit" value={`${brief.constraints.maxMass} kg`} sub="fuelled, at launch" />
        <Fact label="Budget" value={`$${preset.budgetCap}M`} sub="hold some back for surprises" />
        <div className="min-w-0 rounded-lg border border-rule bg-ink-1/70 px-4 py-3">
          <div className="fp-label text-[0.62rem] tracking-[0.14em] text-paper-faint">Schedule, in months</div>
          <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full">
            <div className="bg-paper-dim/60" style={{ width: `${(ride / total) * 100}%` }} title="Build and test" />
            <div className="bg-kapton" style={{ width: `${(Math.max(trip, 0.5) / total) * 100}%` }} title="The trip to the Moon" />
            <div className="bg-ice" style={{ width: `${(mapping / total) * 100}%` }} title="Mapping the ice" />
          </div>
          <div className="mt-1.5 flex justify-between gap-2 text-[0.72rem] text-paper-dim">
            <span>Build &amp; test: months 0–{ride}</span>
            <span className="text-kapton">
              Ride: month {ride} ·{' '}
              {b.transferTurns === null ? 'no way to the Moon yet' : `trip ${trip === 0 ? 'a few days' : `${trip} month${trip === 1 ? '' : 's'}`}`}
            </span>
            <span className="text-ice">{mapping} months mapping</span>
          </div>
        </div>
      </section>

      {/* The way on */}
      <div className="flex shrink-0 items-center justify-between gap-4 rounded-lg border border-kapton/40 bg-kapton/10 px-5 py-3" data-testid="brief-first-stop">
        <p className="min-w-0 text-sm text-paper-dim">
          {/* Read from the step order, so the brief, the map's lit sign and the mission panel name the same stop */}
          <span className="font-bold text-paper">{`Your first stop: ${STEP_NAMES[stop.step]} at the ${buildingName(stop.building)}.`}</span>{' '}
          {STEP_QUESTION[stop.step]}
        </p>
        <button
          type="button"
          onClick={() => {
            audio.play('sfx.select')
            setDesignStep('planning')
          }}
          className="tactical-btn-next shrink-0 whitespace-nowrap px-6"
        >
          {nextLabel('brief')}
        </button>
      </div>
    </div>
  )
}
