import { useGameStore } from '../../state/gameStore'
import { lunarIceMapperBrief, difficultyPresets } from '../../data/brief'
import { Btn, LineItem, Sheet, StepHeader, stepNumber } from '../kit'

const N = stepNumber('brief')

/** Step 0: the flight-plan sheet. The targets are the brief, so they stay in view. */
export function BriefScreen() {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const difficulty = useGameStore((s) => s.difficulty)
  const preset = difficultyPresets[difficulty]
  const brief = lunarIceMapperBrief

  const constraints = [
    { label: 'CubeSat size', value: `${brief.constraints.maxVolume}U` },
    { label: 'Maximum mass', value: `${brief.constraints.maxMass} kg` },
    { label: 'Budget cap', value: `$${preset.budgetCap}M` },
  ]
  const stages = [
    { n: '01', name: 'Build & test', when: `Months 0–${brief.defaultRideTurn}` },
    { n: '02', name: `Ride (Month ${brief.defaultRideTurn})`, when: 'Launch & transfer' },
    { n: '03', name: `Lunar ops (${brief.missionDurationTurns} months)`, when: 'Ice mapping' },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <StepHeader step="brief" kicker="Comms Center · Lunar Ice Mapper" title={brief.name} />

      <Sheet className="space-y-5 p-5">
        <p className="text-[15px] leading-relaxed text-paper">{brief.objective}</p>

        {/* I5a: the starting IR spectrometer cannot see into the shadowed craters; send new players to the lesson first */}
        <div className="border-l-2 border-kapton pl-3 text-sm text-paper-dim" data-testid="brief-first-stop">
          <span className="font-semibold text-paper">Your first stop: the Research Lab.</span> Check whether your instrument can see into the
          dark craters.
        </div>

        <section>
          <LineItem n={`${N}.1`} label="Requirements" />
          <ol className="mt-1">
            {brief.requirements.map((req, i) => (
              <li key={req.id} className="flex items-baseline gap-3 border-b border-rule py-2">
                <span className="fp-data w-7 shrink-0 text-xs text-paper-faint">{`${N}.1.${i + 1}`}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold text-paper">{req.name}</span>
                  <span className="block text-xs text-paper-dim">{req.description}</span>
                </span>
                <span className="fp-data shrink-0 text-sm text-kapton">
                  Target: {req.id === 'data' ? preset.dataTarget : req.target} {req.unit}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <LineItem n={`${N}.2`} label="Envelope constraints" />
          <div className="mt-2 grid grid-cols-3 divide-x divide-rule border border-rule">
            {constraints.map((c) => (
              <div key={c.label} className="px-3 py-3 text-center">
                <div className="fp-data text-2xl text-paper">{c.value}</div>
                <div className="fp-label mt-1 text-[10px] text-paper-faint">{c.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <LineItem n={`${N}.3`} label="Mission timeline" />
          <ol className="mt-2 grid grid-cols-3 divide-x divide-rule border border-rule">
            {stages.map((s) => (
              <li key={s.n} className="px-3 py-2.5">
                <div className="fp-data text-[11px] text-paper-faint">Stage {s.n}</div>
                <div className="text-sm font-semibold text-paper">{s.name}</div>
                <div className="fp-data text-xs text-paper-dim">{s.when}</div>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-paper-dim">
            The mission clock counts months from month 0, when the mission starts. Be ready before your ride leaves.
          </p>
        </section>
      </Sheet>

      <div className="flex justify-end">
        <Btn variant="primary" type="button" onClick={() => setDesignStep('planning')}>
          Begin planning →
        </Btn>
      </div>
    </div>
  )
}
