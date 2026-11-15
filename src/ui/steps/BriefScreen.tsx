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

  const constraints = [
    { label: 'CubeSat size', value: `${brief.constraints.maxVolume}U`, icon: '📐' },
    { label: 'Maximum mass', value: `${brief.constraints.maxMass} kg`, icon: '⚖️' },
    { label: 'Budget cap', value: `$${preset.budgetCap}M`, icon: '💰' },
  ]
  const stages = [
    { n: '01', name: 'Build & test', when: `Months 0–${brief.defaultRideTurn}`, icon: '🛠️' },
    { n: '02', name: `Ride (Month ${brief.defaultRideTurn})`, when: 'Launch & transfer', icon: '🚀' },
    { n: '03', name: `Lunar ops (${brief.missionDurationTurns} months)`, when: 'Ice mapping', icon: '❄️' },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-16">
      <StepHeader step="brief" kicker="Comms Center" title={`${STEP_NAMES.brief}: ${brief.name}`} />

      <Sheet className="space-y-6 p-6 sm:p-8 rounded-2xl border border-rule/80 bg-ink-1/90 shadow-2xl backdrop-blur-md">
        {/* Cinematic Directive Header */}
        <div className="border-l-4 border-kapton pl-4 py-1">
          <div className="font-mono text-xs text-kapton uppercase tracking-wider font-bold">
            Expedition Directive: Lunar Polar Reconnaissance
          </div>
          <p className="mt-1 text-base sm:text-lg leading-relaxed text-paper font-sans">
            {brief.objective}
          </p>
        </div>

        {/* First stop tactical hint */}
        <div
          className="rounded-xl border border-kapton/40 bg-kapton/10 p-4 text-sm text-paper-dim flex items-center gap-3"
          data-testid="brief-first-stop"
        >
          <span className="text-xl">⚠️</span>
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
          <div className="flex items-center justify-between border-b border-rule/80 pb-2">
            <LineItem n={`${N}.1`} label="Requirements" />
            <span className="font-mono text-xs text-paper-faint">5 Primary Metrics</span>
          </div>

          <ol className="mt-2 divide-y divide-rule/50">
            {brief.requirements.map((req, i) => (
              <li key={req.id} className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 py-3 hover:bg-ink-2/40 px-2 rounded-lg transition-colors">
                <div className="flex items-baseline gap-3">
                  <span className="fp-data w-8 shrink-0 text-xs font-mono text-paper-faint">{`${N}.1.${i + 1}`}</span>
                  <div>
                    <span className="text-sm font-bold text-paper block sm:inline">{req.name}</span>
                    <span className="block text-xs text-paper-dim mt-0.5">{req.description}</span>
                  </div>
                </div>
                <div className="sm:text-right shrink-0 font-mono text-xs text-kapton font-semibold pl-11 sm:pl-0">
                  Target: {req.id === 'data' ? preset.dataTarget : req.target} {req.unit}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Envelope constraints */}
        <section>
          <LineItem n={`${N}.2`} label="Envelope constraints" />
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {constraints.map((c) => (
              <div key={c.label} className="p-4 rounded-xl border border-rule/60 bg-ink-2/80 text-center shadow-md">
                <div className="text-xl mb-1">{c.icon}</div>
                <div className="fp-data text-2xl font-bold text-paper tracking-tight">{c.value}</div>
                <div className="fp-label mt-1 text-[11px] text-paper-faint uppercase font-mono">{c.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Mission timeline */}
        <section>
          <LineItem n={`${N}.3`} label="Mission timeline" />
          <ol className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {stages.map((s) => (
              <li key={s.n} className="p-4 rounded-xl border border-rule/60 bg-ink-2/80">
                <div className="flex items-center justify-between font-mono text-xs text-paper-faint">
                  <span>Stage {s.n}</span>
                  <span>{s.icon}</span>
                </div>
                <div className="mt-2 text-sm font-bold text-paper">{s.name}</div>
                <div className="fp-data text-xs text-paper-dim mt-0.5">{s.when}</div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs font-mono text-paper-dim">
            The mission clock counts months from month 0, when the mission starts. Be ready before your ride leaves.
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
