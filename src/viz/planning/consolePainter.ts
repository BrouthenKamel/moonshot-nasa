import { knobAngle, KNOB_VALUES, FADER_VALUES, faderX } from './controlMath'
import { METER_MAX, type PlanningView } from './planningView'

/**
 * Layout of the player's console (panel-local units, x right, z toward the
 * player) and the painter for its printed surface: titles, scales, readouts.
 */
export const CONSOLE = {
  width: 4.6,
  depth: 1.15,
  canvasW: 2048,
  canvasH: 512,
  knob: { x: -1.38, z: 0.2 },
  fader: { x0: 0.88, x1: 1.88, z: 0.12 },
  meter: { x: 0, z: 0.2 },
  lampZ: -0.47,
  lampX0: -1.95,
  lampStep: 0.65,
} as const

export const STEP_LAMPS = ['1 PLAN', '2 INSTRUMENTS', '3 SPACECRAFT', '4 ORBIT', '5 RIDE', '6 COMMS', '7 GO / NO-GO']

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const px = (x: number) => (x / CONSOLE.width + 0.5) * CONSOLE.canvasW
const pz = (z: number) => (z / CONSOLE.depth + 0.5) * CONSOLE.canvasH

export function paintConsole(ctx: CanvasRenderingContext2D, view: PlanningView): void {
  const { knob, fader, meter } = CONSOLE
  ctx.save()
  ctx.fillStyle = '#172238'
  ctx.fillRect(0, 0, CONSOLE.canvasW, CONSOLE.canvasH)
  ctx.strokeStyle = '#1e2a44'
  ctx.lineWidth = 3
  for (const x of [-0.72, 0.62]) {
    ctx.beginPath(); ctx.moveTo(px(x), pz(-0.36)); ctx.lineTo(px(x), pz(0.54)); ctx.stroke()
  }
  ctx.beginPath(); ctx.moveTo(px(-2.25), pz(-0.36)); ctx.lineTo(px(2.25), pz(-0.36)); ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.font = `700 19px ${FONT}`
  STEP_LAMPS.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? '#7dd3fc' : '#64748b'
    ctx.fillText(s, px(CONSOLE.lampX0 + i * CONSOLE.lampStep), pz(-0.41))
  })

  const title = (text: string, x: number, color: string) => {
    ctx.font = `800 32px ${FONT}`
    ctx.fillStyle = color
    ctx.fillText(text, px(x), pz(-0.27))
  }
  const readout = (text: string, x: number, color: string) => {
    ctx.fillStyle = '#020617'
    ctx.fillRect(px(x) - 225, pz(0.47) - 24, 450, 48)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2
    ctx.strokeRect(px(x) - 225, pz(0.47) - 24, 450, 48)
    ctx.font = `700 28px ${MONO}`
    ctx.fillStyle = color
    ctx.fillText(text, px(x), pz(0.472))
  }

  // Test time knob scale
  title('TEST TIME', knob.x, '#c4b5fd')
  for (const v of KNOB_VALUES) {
    const a = knobAngle(v)
    ctx.font = `700 34px ${FONT}`
    ctx.fillStyle = v === view.testTurns ? '#ede9fe' : '#64748b'
    ctx.fillText(String(v), px(knob.x - Math.sin(a) * 0.42), pz(knob.z - Math.cos(a) * 0.38))
  }
  readout(view.readouts.test, knob.x, '#c4b5fd')

  // Build time meter (read-only)
  title('BUILD TIME', meter.x, '#93c5fd')
  const cx = px(meter.x), cy = pz(meter.z + 0.1), R = 120
  ctx.fillStyle = '#020617'
  ctx.beginPath(); ctx.arc(cx, cy, R + 16, Math.PI, 0); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 4
  ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 0); ctx.stroke()
  for (let v = 1; v <= METER_MAX; v++) {
    const a = Math.PI + ((v - 1) / (METER_MAX - 1)) * Math.PI
    ctx.font = `700 24px ${FONT}`
    ctx.fillStyle = v === view.meterValue ? '#dbeafe' : '#64748b'
    ctx.fillText(String(v), cx + Math.cos(a) * (R - 26), cy + Math.sin(a) * (R - 26))
  }
  const na = Math.PI + ((view.meterValue - 1) / (METER_MAX - 1)) * Math.PI
  ctx.strokeStyle = '#60a5fa'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(na) * (R - 48), cy + Math.sin(na) * (R - 48)); ctx.stroke()
  ctx.lineCap = 'butt'
  ctx.fillStyle = '#60a5fa'
  ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill()
  readout(view.readouts.build, meter.x, '#93c5fd')

  // Reserve fader scale
  const fx = (fader.x0 + fader.x1) / 2
  title('BUDGET RESERVE', fx, '#fcd34d')
  for (const v of FADER_VALUES) {
    const x = faderX(v, fader.x0, fader.x1)
    ctx.font = `700 28px ${FONT}`
    ctx.fillStyle = v === view.reservePercent ? '#fef3c7' : '#64748b'
    ctx.fillText(String(v), px(x), pz(fader.z - 0.2))
    ctx.fillStyle = '#334155'
    ctx.fillRect(px(x) - 2, pz(fader.z - 0.13), 4, 18)
  }
  readout(view.readouts.reserve, fx, '#fcd34d')
  ctx.restore()
}
