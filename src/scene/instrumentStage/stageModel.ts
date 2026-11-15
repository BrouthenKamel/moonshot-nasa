/**
 * What the Research Lab simulator shows, worked out from the logic core.
 * Pure: every number comes from computeBudgets and the catalogues; the 3D
 * scene and the overlays only draw what this returns.
 */
import type { Difficulty } from '../../data/brief'
import { lunarIceMapperBrief } from '../../data/brief'
import { getOrbitById } from '../../data/orbits'
import { getPartById, instruments as catalogue, type AttitudePart, type InstrumentPart } from '../../data/parts'
import { computeBudgets } from '../../sim/budgets'
import type { Design } from '../../sim/types'
import { computeSynergies } from '../../viz/synergies'

export const COVERAGE_TARGET = 70
export const MAX_INSTRUMENTS = 2
const VERY_WEAK = 0.2
const FALLBACK_ALTITUDE_KM = 15

export const INSTRUMENT_COLORS: Record<string, string> = {
  // FLIGHT PLAN: cyan only for what sees ice (laser, neutron); the rest Kapton and paper
  'inst-laser': '#5ee6f0',
  'inst-ir-spec': '#e8a33d',
  'inst-neutron': '#a9e4e8',
  'inst-camera': '#d8cfbc',
}

export const INSTRUMENT_SHORT_NAMES: Record<string, string> = {
  'inst-laser': 'Laser',
  'inst-ir-spec': 'IR spectrometer',
  'inst-neutron': 'Neutron spectrometer',
  'inst-camera': 'Camera',
}

/** Add or remove an instrument; a third one pushes out the oldest. */
export function toggleInstrument(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((i) => i !== id) : [...current, id].slice(-MAX_INSTRUMENTS)
}

export interface InstrumentView {
  id: string
  name: string
  color: string
  strength: number // 0-1, the core's quality
  outOfRange: boolean
  veryWeak: boolean
  shaky: boolean
  poweredShare: number // 0-1, share of the time there is power to run
  seesShadow: boolean
  countsAs: 'ice' | 'context' | 'outreach'
  footprint: number
  iceRatePerTurn: number // share of the unmapped ice region per turn; 0 unless it counts as ice
  problems: string[]
  heightIsCause: boolean
}

export interface StageForecast {
  coverage: number
  context: number
  dataMB: number
  outreachMB: number
  passesPerTurn: number
  meetsTarget: boolean
  reasons: string[]
}

export interface StageModel {
  altitudeKm: number
  instruments: InstrumentView[]
  forecast: StageForecast
}

/** The lab tests the instruments at the design's own orbit and pointing: those are decided in their own steps. */
export function stageModel(design: Design, difficulty: Difficulty): StageModel {
  const b = computeBudgets(design, difficulty)
  const orbit = getOrbitById(design.orbit)
  const altitudeKm = orbit?.altitude ?? FALLBACK_ALTITUDE_KM
  const duty = b.scienceDuty
  const precise = (getPartById(design.attitude) as AttitudePart | undefined)?.precise ?? false

  const chosen = design.instruments
    .map((id) => catalogue.find((c) => c.id === id))
    .filter((p): p is InstrumentPart => p !== undefined)

  const views = chosen.map((p): InstrumentView => {
    const strength = b.quality[p.id] ?? 0
    const heightIsCause = p.maxAltitudeKm !== null && altitudeKm > p.maxAltitudeKm
    const shaky = !precise && p.qualityWithoutPrecisePointing < 1
    const problems: string[] = []
    if (heightIsCause) problems.push(`too high at ${altitudeKm} km: works below ${p.maxAltitudeKm} km`)
    if (shaky) problems.push('shaky aim: needs precise pointing')
    if (duty < 0.999) problems.push(`power for only ${Math.round(duty * 100)}% of the time`)
    return {
      id: p.id,
      name: INSTRUMENT_SHORT_NAMES[p.id] ?? p.name,
      color: INSTRUMENT_COLORS[p.id] ?? '#b9b2a3',
      strength,
      outOfRange: strength === 0,
      veryWeak: strength > 0 && strength < VERY_WEAK,
      shaky,
      poweredShare: duty,
      seesShadow: p.seesShadow,
      countsAs: p.kind,
      footprint: p.footprint,
      iceRatePerTurn: p.kind === 'ice' ? (b.coverageRate[p.id] ?? 0) : 0,
      problems,
      heightIsCause,
    }
  })

  const turns = lunarIceMapperBrief.missionDurationTurns
  const reasons: string[] = []
  if (b.captureDeltaV === null || b.upkeepTurns <= 0) {
    reasons.push(
      'This craft cannot reach and hold this orbit, so nothing is mapped. Engine: Factory. Orbit and ride: Launch Site.'
    )
  } else if (b.upkeepTurns < turns) {
    reasons.push(`Propellant holds this orbit for ${Math.floor(b.upkeepTurns)} of ${turns} months.`)
  }
  if (b.projectedLost > 0.5) {
    reasons.push(
      `The link is full: ${Math.round(b.projectedLost)} MB never gets home, and its coverage is lost with it. Link: Comms Center.`
    )
  } else if (b.downlinkPerTurn + 0.5 < b.dataPerTurn) {
    // Coverage only counts once its data is home: a slow link cuts it even when storage loses nothing.
    reasons.push(
      `The link is too slow: ${Math.round(b.dataPerTurn)} MB a turn is made, ${Math.round(b.downlinkPerTurn)} MB gets home, and coverage only counts once its data is home. Link: Comms Center.`
    )
  }
  // The Synergy strip on this step already says it, and names the fix, when it shows the 'shadow-blind'
  // conflict card: that card is the one source, so the panel repeats the cause only when no card covers it.
  const shadowCardShown = computeSynergies(design, b).some((c) => c.id === 'shadow-blind' && c.steps.includes('instruments'))
  if (!chosen.some((p) => p.kind === 'ice') && !shadowCardShown) reasons.push('Nothing aboard sees into shadow: no ice is mapped.')

  return {
    altitudeKm,
    instruments: views,
    forecast: {
      coverage: b.projectedCoverage,
      context: b.projectedContext,
      dataMB: b.projectedData,
      outreachMB: b.projectedOutreach,
      passesPerTurn: orbit?.passesPerTurn ?? 0,
      meetsTarget: b.projectedCoverage >= COVERAGE_TARGET,
      reasons,
    },
  }
}

/** The orbit's passes as the catalogue gives them (4.5 stays 4.5). */
export function passesText(passes: number): string {
  return `${Number.isInteger(passes) ? passes : passes.toFixed(1)} passes over the pole per month`
}

/** What the instrument is doing at this moment of the pass, in words. */
export function activityText(view: InstrumentView, overShadow: boolean): string {
  if (view.outOfRange) return 'Out of range at this height'
  if (view.veryWeak) return view.heightIsCause ? 'Very weak at this height' : 'Very weak'
  if (overShadow && !view.seesShadow) return 'Blind right now: no sunlight down there'
  if (overShadow) return 'Reading the dark crater floor'
  return view.countsAs === 'outreach' ? 'Taking pictures' : view.countsAs === 'context' ? 'Mapping sunlit ground' : 'Reading sunlit ground'
}

/** 0..1 visibility of cyan ice glints inside shadowed craters over the shadowed craters. */
export function iceSparkleStrength(views: readonly InstrumentView[]): number {
  return views.reduce((best, v) => (v.seesShadow && !v.outOfRange ? Math.max(best, v.strength) : best), 0)
}
