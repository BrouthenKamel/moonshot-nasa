import type { InstrumentPart } from '../../data/parts'
import { Eng, Tag } from '../../ui/kit'
import { altitudeText } from './instrumentCards'

/**
 * Under an instrument card. Story view: the one thing that matters, as a tag
 * (cyan only when it sees into the shadowed craters). Engineer view: the numbers.
 */
export function InstrumentCardFoot({ inst, on, color }: { inst: InstrumentPart; on: boolean; color: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5 px-0.5">
      <Tag tone={inst.seesShadow ? 'ice' : 'neutral'}>{inst.seesShadow ? 'Sees into shadow' : 'Sunlit ground only'}</Tag>
      <Eng as="dl" className="grid w-full grid-cols-2 gap-x-2 gap-y-0.5 fp-data text-[10px] text-paper-dim">
        <dt className="text-paper-faint">Mass</dt>
        <dd className="text-right">{inst.mass} kg</dd>
        <dt className="text-paper-faint">Power</dt>
        <dd className="text-right">{Math.abs(inst.power)} W</dd>
        <dt className="text-paper-faint">Cost</dt>
        <dd className="text-right">${inst.cost}M</dd>
        <dt className="text-paper-faint">Data</dt>
        <dd className="text-right">{inst.dataPerTurn} MB/mo</dd>
        <dt className="text-paper-faint">Size</dt>
        <dd className="text-right">{inst.volume} U</dd>
        <dt className="text-paper-faint">Works</dt>
        <dd className="text-right">{altitudeText(inst)}</dd>
      </Eng>
      {/* Its beam colour, lit when aboard: the same colour as its beam and read-out on the stage */}
      <span aria-hidden className="h-[3px] w-full transition-opacity duration-300" style={{ background: color, opacity: on ? 0.9 : 0.2 }} />
    </div>
  )
}
