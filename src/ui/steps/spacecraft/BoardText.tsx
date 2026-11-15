import type { BayView } from '../../../viz/spacecraft/bayView'
import { Eng, StepHeader } from '../../kit'
import { FlySheet } from './FlySheet'

/** The wall board as plain text: the step without WebGL, and in tests. */
export function BoardText({ view }: { view: BayView }) {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 pt-16 pb-4">
      <StepHeader step="spacecraft" title="Spacecraft" kicker="Factory · Lunar Ice Mapper" />
      <FlySheet view={view} />
      <Eng as="p" className="fp-data text-xs text-paper-dim">
        Parts ${view.partsCost.toFixed(1)}M. Inside the box, bottom to top:{' '}
        {view.stack.map((s) => `${s.name} (${s.volume} U${s.readOnly ? `, ${s.sub}` : ''})`).join(', ')}.
      </Eng>
      <Eng as="p" className="fp-data text-xs text-paper-dim">
        {view.status.lines}
      </Eng>
    </div>
  )
}
