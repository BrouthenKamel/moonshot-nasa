import type { StripTone } from './orbitView'

/**
 * Paints the south polar cap of the orbit view: dark craters where ice may be,
 * one strip per pass through the pole, and bright ice where an in-range pass
 * has crossed a crater. Plain 2D canvas calls (no Path2D), so it runs in tests.
 */

export const ICE_SIZE = 512
export const ICE_GLOW = '#e0fbff'

export interface IcePaint {
  strips: number
  tone: StripTone
  angle0: number // radians: direction of the first strip
}

const GOLDEN_ANGLE = 2.39996
const STRIP_FILL: Record<StripTone, string> = {
  ice: 'rgba(103,232,249,.13)',
  blind: 'rgba(251,191,36,.18)',
  none: 'rgba(148,163,184,.14)',
}

interface Crater {
  x: number
  y: number
  r: number
  squash: number
  tilt: number
}

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Permanently shadowed craters, the same every time. Unit coordinates around the cap centre. */
const CRATERS: Crater[] = (() => {
  const r = seeded(42)
  const out: Crater[] = []
  for (let i = 0; i < 26; i++) {
    const d = Math.sqrt(r()) * 0.86
    const a = r() * Math.PI * 2
    out.push({ x: 0.5 + 0.5 * d * Math.cos(a), y: 0.5 + 0.5 * d * Math.sin(a), r: 0.018 + r() * 0.05, squash: 0.6 + r() * 0.8, tilt: r() * Math.PI })
  }
  return out
})()

function craterPath(ctx: CanvasRenderingContext2D, c: Crater) {
  ctx.beginPath()
  ctx.ellipse(c.x * ICE_SIZE, c.y * ICE_SIZE, c.r * ICE_SIZE, c.r * ICE_SIZE * c.squash, c.tilt, 0, Math.PI * 2)
}

function stripsPath(ctx: CanvasRenderingContext2D, n: number, angle0: number, width: number) {
  const mid = ICE_SIZE / 2
  const h = ICE_SIZE * 0.6
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const a = angle0 + i * GOLDEN_ANGLE
    const cx = Math.cos(a)
    const sy = Math.sin(a)
    const wx = (-sy * width) / 2
    const wy = (cx * width) / 2
    ctx.moveTo(mid - cx * h + wx, mid - sy * h + wy)
    ctx.lineTo(mid + cx * h + wx, mid + sy * h + wy)
    ctx.lineTo(mid + cx * h - wx, mid + sy * h - wy)
    ctx.lineTo(mid - cx * h - wx, mid - sy * h - wy)
    ctx.closePath()
  }
}

export function paintIce(ctx: CanvasRenderingContext2D, p: IcePaint): void {
  const mid = ICE_SIZE / 2
  const strips = Math.max(0, Math.floor(p.strips))
  const width = p.tone === 'ice' ? 8 : 2
  ctx.clearRect(0, 0, ICE_SIZE, ICE_SIZE)

  ctx.save()
  ctx.beginPath()
  ctx.arc(mid, mid, mid - 2, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = 'rgba(8,15,35,.5)'
  ctx.fillRect(0, 0, ICE_SIZE, ICE_SIZE)

  for (const c of CRATERS) {
    craterPath(ctx, c)
    ctx.fillStyle = 'rgba(3,7,22,.92)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(125,211,252,.45)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  if (strips > 0) {
    stripsPath(ctx, strips, p.angle0, width)
    ctx.fillStyle = STRIP_FILL[p.tone]
    ctx.fill()

    if (p.tone === 'ice') {
      ctx.save()
      stripsPath(ctx, strips, p.angle0, width)
      ctx.clip()
      ctx.shadowColor = '#22d3ee'
      ctx.shadowBlur = 14
      for (const c of CRATERS) {
        craterPath(ctx, c)
        ctx.fillStyle = ICE_GLOW
        ctx.fill()
      }
      ctx.restore()
    }
  }
  ctx.restore()

  ctx.strokeStyle = 'rgba(125,211,252,.7)'
  ctx.lineWidth = 3
  ctx.setLineDash([10, 8])
  ctx.beginPath()
  ctx.arc(mid, mid, mid - 3, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
}
