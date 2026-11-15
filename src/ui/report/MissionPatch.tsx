import { useId } from 'react'
import { orbitPoint, type InstrumentGlyph, type PatchSpec } from '../../world/debrief/patch'

/**
 * The mission patch, drawn as SVG from `patchSpec` (vision §3.5: procedural, no AI art).
 * Embroidered-badge look: a ring band with the mission and astronaut name, the Moon's
 * dark south pole, the player's orbit and their CubeSat with its own wings and engine.
 */

const RING: Record<PatchSpec['outcome'], string> = {
  success: 'var(--color-kapton)',
  partial: 'var(--color-caution)',
  failed: 'var(--color-nogo)',
  planned: 'var(--color-paper-faint)',
}

/** One small mark per instrument, drawn as a beam from the craft toward the pole */
function Beam({ glyph, i, n }: { glyph: InstrumentGlyph; i: number; n: number }) {
  const spread = (i - (n - 1) / 2) * 9
  const stroke = glyph === 'neutron' ? 'var(--color-paper-dim)' : glyph === 'camera' ? 'var(--color-paper)' : 'var(--color-ice)'
  const dash = glyph === 'neutron' ? '1.2 2' : glyph === 'ir' ? '3 1.5' : undefined
  const width = glyph === 'neutron' ? 4 : glyph === 'laser' ? 0.9 : 1.6
  return <line x1={0} y1={4} x2={spread} y2={22} stroke={stroke} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" opacity={0.85} />
}

function Craft({ spec }: { spec: PatchSpec }) {
  const p = orbitPoint(spec.orbit, spec.craftAt)
  const wing = (side: -1 | 1) => (
    <g transform={`translate(${side * 5} 0)`}>
      <rect x={side > 0 ? 0 : -12} y={-2.4} width={12} height={4.8} fill="var(--color-ink-3)" stroke="var(--color-ice)" strokeWidth={0.6} />
      {[3, 6, 9].map((d) => (
        <line key={d} x1={side * d} y1={-2.4} x2={side * d} y2={2.4} stroke="var(--color-ice)" strokeWidth={0.35} />
      ))}
    </g>
  )
  const plume =
    spec.plume === 'ion' ? (
      <path d="M -2 -5 L 0 -16 L 2 -5 Z" fill="var(--color-ice)" opacity={0.7} />
    ) : spec.plume === 'chemical' ? (
      <path d="M -3 -5 Q 0 -18 3 -5 Z" fill="var(--color-kapton)" opacity={0.85} />
    ) : spec.plume === 'cold-gas' ? (
      <g fill="var(--color-paper-dim)" opacity={0.7}>
        <circle cx={0} cy={-8} r={1.2} />
        <circle cx={-1.5} cy={-11} r={0.9} />
        <circle cx={1.4} cy={-13} r={0.7} />
      </g>
    ) : null
  return (
    // The craft points its instruments down at the Moon; the engine fires behind it
    <g transform={`translate(${p.x} ${p.y}) rotate(${p.angle - 90})`} data-testid="patch-craft">
      {spec.instruments.map((g, i) => (
        <Beam key={`${g}-${i}`} glyph={g} i={i} n={spec.instruments.length} />
      ))}
      {plume}
      {spec.wings >= 1 && wing(1)}
      {spec.wings >= 2 && wing(-1)}
      <rect x={-5} y={-5} width={10} height={10} fill="var(--color-paper)" stroke="var(--color-ink-0)" strokeWidth={0.6} />
      {Array.from({ length: spec.cells }, (_, i) => (
        <rect key={i} x={-3.6 + i * 2.6} y={-1.5} width={1.8} height={3} fill="var(--color-go)" />
      ))}
      {spec.band && (
        <>
          <line x1={0} y1={-5} x2={4} y2={-9} stroke="var(--color-paper)" strokeWidth={0.6} />
          <circle cx={4} cy={-9} r={1} fill="var(--color-paper)" />
        </>
      )}
    </g>
  )
}

export function MissionPatch({ spec, className = '', title = 'Mission patch' }: { spec: PatchSpec; className?: string; title?: string }) {
  const id = useId().replace(/:/g, '')
  const ring = RING[spec.outcome]
  const o = spec.orbit
  const dim = spec.outcome === 'failed'
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={`${title}: ${spec.title}, ${spec.name}, ${spec.number}`} className={className} data-testid="mission-patch">
      <defs>
        <path id={`${id}-top`} d="M 30 100 A 70 70 0 0 1 170 100" />
        <path id={`${id}-bottom`} d="M 26 100 A 74 74 0 0 0 174 100" />
        <clipPath id={`${id}-sky`}>
          <circle cx={100} cy={100} r={62} />
        </clipPath>
        <radialGradient id={`${id}-moon`} cx="30%" cy="30%" r="80%">
          <stop offset="0%" stopColor="var(--color-paper)" />
          <stop offset="70%" stopColor="var(--color-paper-faint)" />
          <stop offset="100%" stopColor="var(--color-ink-3)" />
        </radialGradient>
      </defs>

      {/* Ring band: stitched edge, the mission title on top, the astronaut at the bottom */}
      <circle cx={100} cy={100} r={97} fill="var(--color-ink-0)" stroke={ring} strokeWidth={4} />
      <circle cx={100} cy={100} r={91} fill="none" stroke={ring} strokeWidth={0.6} strokeDasharray="2 2" />
      <circle cx={100} cy={100} r={64} fill="none" stroke={ring} strokeWidth={2} />
      <text fill="var(--color-paper)" fontSize={13} fontWeight={700} letterSpacing={2.4} textAnchor="middle" className="fp-display">
        <textPath href={`#${id}-top`} startOffset="50%">
          {spec.title}
        </textPath>
      </text>
      <text fill={ring} fontSize={11} fontWeight={700} letterSpacing={2} textAnchor="middle" dominantBaseline="hanging" className="fp-display">
        <textPath href={`#${id}-bottom`} startOffset="50%">
          {spec.name}
        </textPath>
      </text>
      <circle cx={30} cy={100} r={2.2} fill={ring} />
      <circle cx={170} cy={100} r={2.2} fill={ring} />

      {/* Inner disc: the sky, the Moon and the player's orbit */}
      <g clipPath={`url(#${id}-sky)`} opacity={dim ? 0.55 : 1}>
        <rect x={0} y={0} width={200} height={200} fill="var(--color-ink-2)" />
        {spec.stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="var(--color-paper)" opacity={0.8} />
        ))}
        <circle cx={o.cx} cy={o.cy} r={30} fill={`url(#${id}-moon)`} />
        {/* The south pole: craters whose floors never see the Sun, with a glint of ice */}
        <ellipse cx={o.cx + 2} cy={o.cy + 22} rx={11} ry={4} fill="var(--color-ink-0)" opacity={0.85} />
        <ellipse cx={o.cx - 9} cy={o.cy + 17} rx={5} ry={2} fill="var(--color-ink-0)" opacity={0.75} />
        <ellipse cx={o.cx + 3} cy={o.cy + 22} rx={4} ry={1.3} fill="var(--color-ice)" opacity={dim ? 0.25 : 0.8} />
        <ellipse
          cx={o.cx}
          cy={o.cy}
          rx={o.rx}
          ry={o.ry}
          transform={`rotate(${o.tilt} ${o.cx} ${o.cy})`}
          fill="none"
          stroke="var(--color-ice)"
          strokeWidth={1}
          strokeDasharray={o.shape === 'halo' ? '4 2' : undefined}
          opacity={0.8}
        />
        <Craft spec={spec} />
      </g>

      {/* Mission number and radio band, small, like the thread code on a real patch */}
      <text x={100} y={52} fill="var(--color-paper-faint)" fontSize={6} textAnchor="middle" letterSpacing={1} className="fp-data">
        {spec.number}
        {spec.band ? ` · ${spec.band}-BAND` : ''}
      </text>
    </svg>
  )
}
