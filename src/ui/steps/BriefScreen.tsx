import { useGameStore } from '../../state/gameStore'
import { lunarIceMapperBrief, difficultyPresets } from '../../data/brief'
import { Btn, LineItem, Sheet, StepHeader, STEP_QUESTION, nextLabel, stepNumber } from '../kit'
import { STEP_NAMES, buildingName, firstStop } from '../../viz/missionMap'
import { audio } from '../../assets/audio'

const N = stepNumber('brief')

/** Step 0: The NASA Mission Dossier. */
export function BriefScreen() {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const difficulty = useGameStore((s) => s.difficulty)
  const preset = difficultyPresets[difficulty]
  const brief = lunarIceMapperBrief
  const stop = firstStop()

  const limits = `${brief.constraints.maxVolume}U CubeSat · ${brief.constraints.maxMass} kg maximum · $${preset.budgetCap}M budget cap`
  const timeline = `Build and test in months 0–${brief.defaultRideTurn} · ride leaves in month ${brief.defaultRideTurn} · ${brief.missionDurationTurns} months of ice mapping`

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-16">
      <StepHeader step="brief" kicker="Comms Center" title={`${STEP_NAMES.brief}: ${brief.name}`} />

      <Sheet className="space-y-6 p-6 sm:p-8 rounded-2xl border border-rule/80 bg-ink-1/90 shadow-2xl backdrop-blur-md">
        {/* Cinematic Directive Header */}
        <div className="border-l-4 border-kapton pl-4 py-1">
          <p className="text-base sm:text-lg leading-relaxed text-paper font-sans">
            {brief.objective}
          </p>
        </div>

        {/* First stop tactical hint */}
        <div
          className="rounded-xl border border-kapton/40 bg-kapton/10 p-4 text-sm text-paper-dim flex items-center gap-3"
          data-testid="brief-first-stop"
        >
          <div>
            {/* Read from the step order, so the brief, the map's lit sign and the mission panel name the same stop */}
            <span className="font-bold text-paper">
              {`Your first stop: ${STEP_NAMES[stop.step]} at the ${buildingName(stop.building)}.`}
            </span>{' '}
            {STEP_QUESTION[stop.step]}
          </div>
        </div>

        {/* Mission Objectives / Requirements */}
        <section>
          <div className="border-b border-rule/80 pb-2">
            <LineItem n={`${N}.1`} label="Requirements" />
          </div>

          <ol className="mt-2 divide-y divide-rule/50">
            {brief.requirements.map((req) => (
              <li key={req.id} className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 py-3 hover:bg-ink-2/40 px-2 rounded-lg transition-colors">
                <div className="flex items-baseline gap-3">
                  <div>
                    <span className="text-sm font-bold text-paper block sm:inline">{req.name}</span>
                    <span className="block text-xs text-paper-dim mt-0.5">{req.description}</span>
                  </div>
                </div>
                <div className="sm:text-right shrink-0 font-mono text-xs text-kapton font-semibold">
                  Target: {req.id === 'data' ? preset.dataTarget : req.target} {req.unit}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Limits and schedule: one line each */}
        <section className="space-y-1.5 text-sm text-paper-dim">
          <p>
            <span className="fp-label mr-2 text-paper">Limits</span>
            {limits}
          </p>
          <p>
            <span className="fp-label mr-2 text-paper">Schedule</span>
            {timeline}. The mission clock counts months from month 0, when the mission starts. Be ready before your ride leaves.
          </p>
        </section>
      </Sheet>

      <div className="flex justify-end pt-2">
        <Btn
          variant="primary"
          type="button"
          onClick={() => {
            audio.play('sfx.select')
            setDesignStep('planning')
          }}
          className="shadow-xl shadow-kapton/20 px-6 py-3 text-sm font-bold tracking-wider uppercase font-mono"
        >
          {nextLabel('brief')}
        </Btn>
      </div>
    </div>
  )
}
