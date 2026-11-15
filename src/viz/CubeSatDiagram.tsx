import type { PartCategory } from '../data/parts'
import type { Design } from '../sim/types'
import { buildSlots } from './cubesatSlots'

export type CraftHighlight = 'instruments' | 'bus' | 'all' | null

interface CubeSatDiagramProps {
  design: Design
  failing?: boolean
  highlight?: CraftHighlight
  /** Slot groups marked red: payload = instruments, bus = everything else. */
  failingGroups?: { payload?: boolean; bus?: boolean }
}

/** Muted drawing tints, one per subsystem (cyan stays reserved for ice) */
const CATEGORY_COLOR: Record<PartCategory, string> = {
  instrument: '#a394cc',
  battery: '#7f9c74',
  radio: '#7c9cc9',
  computer: '#a08a9a',
  attitude: '#b3a46e',
  propulsion: '#b88a68',
  solar: '#9a6b26',
  structure: '#827c70',
}

// Drawing colours from the FLIGHT PLAN palette
const INK = '#0b0e14'
const RULE = '#3a4254'
const PAPER = '#ede6d6'
const PAPER_DIM = '#b9b2a3'
const NOGO = '#d0533f'
const KAPTON = '#e8a33d'

const BUS_X = 50
const BUS_Y = 30
const BUS_H = 60
const BUS_W = 160

/** 6U cutaway: slot widths are proportional to the part volume, so the picture is the volume budget. */
export function CubeSatDiagram({ design, failing = false, highlight = null, failingGroups }: CubeSatDiagramProps) {
  const layout = buildSlots(design)
  const scale = layout.limitU > 0 ? BUS_W / layout.limitU : 0
  const deployed = layout.solar === 'deployable'
  const dimmed = (category: PartCategory) =>
    highlight === 'instruments' ? category !== 'instrument' : highlight === 'bus' ? category === 'instrument' : false

  const cells = layout.slots.map((slot, i) => {
    const cursor = layout.slots.slice(0, i).reduce((sum, s) => sum + s.volume, 0)
    const x = BUS_X + cursor * scale
    const w = Math.max(0, slot.volume * scale)
    const overflow = cursor + slot.volume > layout.limitU + 1e-9
    const groupFailing = slot.category === 'instrument' ? failingGroups?.payload : failingGroups?.bus
    const red = overflow || groupFailing
    const tint = red ? NOGO : CATEGORY_COLOR[slot.category]
    return (
      <g key={`${slot.partId}-${i}`} opacity={dimmed(slot.category) ? 0.3 : 1}>
        <title>{`${slot.name}: ${slot.volume} U`}</title>
        <rect
          x={x + 1}
          y={BUS_Y + 3}
          width={Math.max(0, w - 2)}
          height={BUS_H - 6}
          fill={tint}
          fillOpacity={red ? 0.4 : 0.22}
          stroke={tint}
          strokeWidth={0.75}
        />
        <text
          x={x + w / 2}
          y={BUS_Y + BUS_H / 2 + 2.5}
          textAnchor="middle"
          className="fp-label"
          fill={PAPER}
          style={{ fontSize: 6.5 }}
        >
          {slot.volume >= 0.5 ? slot.category.slice(0, 4) : ''}
        </text>
      </g>
    )
  })

  const wingStyle = {
    transformBox: 'fill-box' as const,
    transformOrigin: 'center',
    transform: deployed ? 'scaleY(1)' : 'scaleY(0.08)',
    transition: 'transform 500ms ease',
  }
  const dimY = BUS_Y + BUS_H + 34
  const over = failing || layout.overLimit

  return (
    <svg
      viewBox="0 0 260 136"
      className="h-full w-full"
      role="img"
      aria-label={`CubeSat cutaway, ${layout.usedU.toFixed(1)} of ${layout.limitU} U used`}
    >
      {/* Solar wings, folded flat against the bus or unfolded: Kapton-dim hatching on a hairline */}
      {layout.solar !== 'none' && (
        <g style={wingStyle}>
          <rect x={BUS_X + 30} y={2} width={100} height={26} fill={CATEGORY_COLOR.solar} fillOpacity={0.25} stroke={KAPTON} strokeWidth={0.75} />
          <rect
            x={BUS_X + 30}
            y={BUS_Y + BUS_H + 2}
            width={100}
            height={26}
            fill={CATEGORY_COLOR.solar}
            fillOpacity={0.25}
            stroke={KAPTON}
            strokeWidth={0.75}
          />
        </g>
      )}
      {layout.solar === 'body' && (
        <rect x={BUS_X - 2} y={BUS_Y - 2} width={BUS_W + 4} height={BUS_H + 4} fill="none" stroke={KAPTON} strokeWidth={1} strokeDasharray="4 2" />
      )}
      <rect
        x={BUS_X}
        y={BUS_Y}
        width={BUS_W}
        height={BUS_H}
        fill={INK}
        stroke={over ? NOGO : highlight === 'all' ? PAPER : PAPER_DIM}
        strokeWidth={over ? 1.5 : 1}
      />
      {cells}

      {/* Dimension line: how much of the 6U volume is used */}
      <g stroke={over ? NOGO : RULE} strokeWidth={0.75}>
        <line x1={BUS_X} y1={dimY - 4} x2={BUS_X} y2={dimY + 4} />
        <line x1={BUS_X + BUS_W} y1={dimY - 4} x2={BUS_X + BUS_W} y2={dimY + 4} />
        <line x1={BUS_X} y1={dimY} x2={BUS_X + BUS_W} y2={dimY} />
      </g>
      <text x={BUS_X} y={dimY + 12} className="fp-data" style={{ fontSize: 8 }} fill={layout.overLimit ? NOGO : PAPER_DIM}>
        {layout.usedU.toFixed(1)} / {layout.limitU} U{layout.overLimit ? ' (over limit)' : ''}
      </text>
      <text x={BUS_X + BUS_W} y={dimY + 12} textAnchor="end" className="fp-label" style={{ fontSize: 7 }} fill={PAPER_DIM}>
        solar: {layout.solar === 'deployable' ? 'unfolded' : layout.solar === 'body' ? 'body-mounted' : 'none'}
      </text>
    </svg>
  )
}
