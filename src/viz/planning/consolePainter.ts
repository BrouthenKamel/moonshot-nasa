import { knobAngle, KNOB_VALUES, FADER_VALUES, faderX } from './controlMath'
import { turnConstants } from '../../data/brief'
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

/**
 * Panel z of the console's printed rows, top to bottom: the column titles (TITLE_Z), the recommended-reserve
 * note, the value scale. The 3D handle (z ±0.14 around the fader) and the value lamps (fader + 0.2)
 * sit below the scale, so nothing on the desk ever covers the note.
 */
export const TITLE_Z = -0.27
export const RECOMMENDED_Z = -0.17
export const FADER_SCALE_Z = CONSOLE.fader.z - 0.2

export const STEP_LAMPS = ['1 PLAN', '2 INSTRUMENTS', '3 SPACECRAFT', '4 ORBIT', '5 RIDE', '6 COMMS', '7 GO / NO-GO']

const FONT = '"Archivo", "Helvetica Neue", Arial, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const px = (x: number) => (x / CONSOLE.width + 0.5) * CONSOLE.canvasW
const pz = (z: number) => (z / CONSOLE.depth + 0.5) * CONSOLE.canvasH

export function paintConsole(ctx: CanvasRenderingContext2D, view: PlanningView): void {
  const { knob, fader, meter } = CONSOLE
  ctx.save()
  ctx.fillStyle = '#1a1f2b'
  ctx.fillRect(0, 0, CONSOLE.canvasW, CONSOLE.canvasH)
  ctx.strokeStyle = '#22252d'
  ctx.lineWidth = 3
  for (const x of [-0.72, 0.62]) {
    ctx.beginPath(); ctx.moveTo(px(x), pz(-0.36)); ctx.lineTo(px(x), pz(0.54)); ctx.stroke()
  }
  ctx.beginPath(); ctx.moveTo(px(-2.25), pz(-0.36)); ctx.lineTo(px(2.25), pz(-0.36)); ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.font = `700 19px ${FONT}`
  STEP_LAMPS.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? '#9fb5d6' : '#827c70'
    ctx.fillText(s, px(CONSOLE.lampX0 + i * CONSOLE.lampStep), pz(-0.41))
  })

  const title = (text: string, x: number, color: string) => {
    ctx.font = `800 32px ${FONT}`
    ctx.fillStyle = color
    ctx.fillText(text, px(x), pz(TITLE_Z))
  }
  // With an odds line (chance of full success now and at the neighbouring settings) the box grows downwards
  const readout = (text: string, x: number, color: string, odds?: string) => {
    const top = pz(0.47) - 24
    const h = odds ? 66 : 48
    ctx.fillStyle = '#07090d'
    ctx.fillRect(px(x) - 225, top, 450, h)
    ctx.strokeStyle = '#22252d'
    ctx.lineWidth = 2
    ctx.strokeRect(px(x) - 225, top, 450, h)
    ctx.font = `700 28px ${MONO}`
    ctx.fillStyle = color
    ctx.fillText(text, px(x), pz(0.472) - (odds ? 4 : 0))
    if (odds) {
      ctx.font = `700 21px ${MONO}`
      ctx.fillStyle = '#ddd5c4'
      ctx.fillText(odds, px(x), top + h - 15, 440)
    }
  }

  // Test time knob scale
  title('TEST TIME', knob.x, '#d9b98a')
  for (const v of KNOB_VALUES) {
    const a = knobAngle(v)
    ctx.font = `700 34px ${FONT}`
    ctx.fillStyle = v === view.testTurns ? '#ede6d6' : '#827c70'
    ctx.fillText(String(v), px(knob.x - Math.sin(a) * 0.42), pz(knob.z - Math.cos(a) * 0.38))
  }
  readout(view.readouts.test, knob.x, '#d9b98a', view.readouts.testOdds)

  // Build time meter (read-only)
  title('BUILD TIME', meter.x, '#9fb5d6')
  const cx = px(meter.x), cy = pz(meter.z + 0.1), R = 120
  ctx.fillStyle = '#07090d'
  ctx.beginPath(); ctx.arc(cx, cy, R + 16, Math.PI, 0); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = '#3a3c42'
  ctx.lineWidth = 4
  ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 0); ctx.stroke()
  for (let v = 1; v <= METER_MAX; v++) {
    const a = Math.PI + ((v - 1) / (METER_MAX - 1)) * Math.PI
    ctx.font = `700 24px ${FONT}`
    ctx.fillStyle = v === view.meterValue ? '#e6e0d2' : '#827c70'
    ctx.fillText(String(v), cx + Math.cos(a) * (R - 26), cy + Math.sin(a) * (R - 26))
  }
  const na = Math.PI + ((view.meterValue - 1) / (METER_MAX - 1)) * Math.PI
  ctx.strokeStyle = '#7c9cc9'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(na) * (R - 48), cy + Math.sin(na) * (R - 48)); ctx.stroke()
  ctx.lineCap = 'butt'
  ctx.fillStyle = '#7c9cc9'
  ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill()
  readout(view.readouts.build, meter.x, '#9fb5d6')

  // Reserve fader scale
  const fx = (fader.x0 + fader.x1) / 2
  title('BUDGET RESERVE', fx, '#f0c070')
  for (const v of FADER_VALUES) {
    const x = faderX(v, fader.x0, fader.x1)
    const recommended = v === turnConstants.recommendedReservePercent
    ctx.font = `700 28px ${FONT}`
    ctx.fillStyle = v === view.reservePercent ? '#f2e3c2' : '#827c70'
    ctx.fillText(String(v), px(x), pz(FADER_SCALE_Z))
    ctx.fillStyle = recommended ? '#e8a33d' : '#3a3c42'
    ctx.fillRect(px(x) - (recommended ? 4 : 2), pz(fader.z - 0.13), recommended ? 8 : 4, 18)
  }
  // The recommended reserve (CubeSat 101 advice, QC #57), above the fader: between the title and
  // the scale, centred on the fader. Under the fader it sat on the row of value lamps and in the
  // handle's path, which hid letters at every setting (Ideas round 22). The amber tick marks the value.
  ctx.font = `700 22px ${FONT}`
  ctx.fillStyle = '#e8a33d'
  ctx.fillText(`${turnConstants.recommendedReservePercent}% RECOMMENDED (CUBESAT 101)`, px(fx), pz(RECOMMENDED_Z), px(fader.x1 + 0.1) - px(fader.x0 - 0.1))
  readout(view.readouts.reserve, fx, '#f0c070', view.readouts.reserveOdds)
  ctx.restore()
}
