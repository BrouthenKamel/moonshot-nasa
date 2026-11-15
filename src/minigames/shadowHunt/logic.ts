import type { Insight, MinigameResult } from '../contract'
import type { Design } from '../../sim/types'

/**
 * Shadow Hunt rules, pure. The Sun circles the Moon's equator and, because the Moon's axis is
 * tilted only ~1.5 degrees, never climbs far above the horizon near the south pole.
 * A site is lit when the Sun's elevation there clears the walls around it.
 * Horizon angles are game values (one effective wall height per site), not survey data.
 */

/** The Moon's axial tilt: how far north or south of the equator the Sun can wander */
export const AXIAL_TILT_DEG = 1.5
/** The Sun's angular radius seen from the Moon */
export const SUN_RADIUS_DEG = 0.27
/** PSRs the player must tag to finish */
export const PSR_GOAL = 3
/** Longitude bins the sweep must cover (18 degrees each) */
export const SWEEP_BINS = 20

export type SiteKind = 'crater' | 'rim' | 'peak'

export interface Site {
  id: string
  name: string
  kind: SiteKind
  /** Degrees from the south pole (real: 90 minus the south latitude) */
  colatDeg: number
  /** East longitude, degrees */
  lonDeg: number
  /** How high the Sun must climb to clear the walls; negative = stands above the horizon */
  horizonDeg: number
  /** Designed answer: true when the site never sees the Sun (verified against the sweep in tests) */
  psr: boolean
  /** One plain-English line for the close-up */
  line: string
  /** Optional real number for the close-up, only when confident */
  fact?: string
}

export const SITES: readonly Site[] = [
  {
    id: 'shackleton',
    name: 'Shackleton',
    kind: 'crater',
    colatDeg: 0.3,
    lonDeg: 0,
    horizonDeg: 22,
    psr: true,
    line: 'A bowl so deep that the Sun, always skimming the horizon, can never look inside.',
    fact: 'About 21 km wide and 4 km deep.',
  },
  {
    id: 'shackleton-rim',
    name: 'Shackleton rim',
    kind: 'rim',
    colatDeg: 1.2,
    lonDeg: 0,
    horizonDeg: 0.4,
    psr: false,
    line: 'The rim sits up in the light. Sunshine for most of the lunar day.',
  },
  {
    id: 'haworth',
    name: 'Haworth',
    kind: 'crater',
    colatDeg: 2.5,
    lonDeg: -5,
    horizonDeg: 7,
    psr: true,
    line: 'Its floor lies in the shadow of its own walls, year after year.',
    fact: 'About 51 km across.',
  },
  {
    id: 'faustini',
    name: 'Faustini',
    kind: 'crater',
    colatDeg: 2.7,
    lonDeg: 77,
    horizonDeg: 7,
    psr: true,
    line: 'Deep and narrow: the Sun slides along its rim and never reaches the floor.',
    fact: 'About 39 km across.',
  },
  {
    id: 'shoemaker',
    name: 'Shoemaker',
    kind: 'crater',
    colatDeg: 1.9,
    lonDeg: 45,
    horizonDeg: 6,
    psr: true,
    line: 'Named for Gene Shoemaker, who dreamed of walking on the Moon. Its floor is among the coldest places known.',
    fact: 'Floors like this stay colder than -230 degrees C.',
  },
  {
    id: 'de-gerlache',
    name: 'de Gerlache',
    kind: 'crater',
    colatDeg: 1.5,
    lonDeg: -87,
    horizonDeg: 6,
    psr: true,
    line: 'Right next to the pole: the Sun can only graze the tops of its walls.',
    fact: 'About 32 km across.',
  },
  {
    id: 'cabeus',
    name: 'Cabeus',
    kind: 'crater',
    colatDeg: 5.1,
    lonDeg: -35,
    horizonDeg: 9,
    psr: true,
    line: 'In 2009 NASA crashed a probe into this dark floor and the plume held water.',
    fact: 'LCROSS saw about 5.6% water in the plume.',
  },
  {
    id: 'malapert',
    name: 'Malapert Mountain',
    kind: 'peak',
    colatDeg: 4.1,
    lonDeg: 3,
    horizonDeg: -2,
    psr: false,
    line: 'A mountain above the horizon: nearly always in sunlight, a great place for solar panels.',
  },
  {
    id: 'leibnitz',
    name: 'Leibnitz Beta plateau',
    kind: 'peak',
    colatDeg: 6,
    lonDeg: 32,
    horizonDeg: -1,
    psr: false,
    line: 'A high plateau that catches the Sun for much of the lunar day.',
  },
]

export const siteById = (id: string): Site | undefined => SITES.find((s) => s.id === id)

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export const clampLat = (latDeg: number) => Math.max(-AXIAL_TILT_DEG, Math.min(AXIAL_TILT_DEG, latDeg))
/** Wrap a longitude to [0, 360) */
export const wrapLon = (lon: number) => ((lon % 360) + 360) % 360
/** Signed shortest angle from a to b, in (-180, 180] */
export const lonDelta = (a: number, b: number) => {
  const d = wrapLon(b - a)
  return d > 180 ? d - 360 : d
}

/** Elevation of the Sun's centre above the flat ground at a site, degrees (negative = below the horizon) */
export function sunElevationDeg(site: Site, sunLonDeg: number, sunLatDeg: number): number {
  const th = rad(site.colatDeg)
  const b = rad(clampLat(sunLatDeg))
  const dl = rad(sunLonDeg - site.lonDeg)
  const s = Math.sin(th) * Math.cos(b) * Math.cos(dl) - Math.cos(th) * Math.sin(b)
  return deg(Math.asin(Math.max(-1, Math.min(1, s))))
}

/** True when any of the Sun's disc clears the walls */
export function isLit(site: Site, sunLonDeg: number, sunLatDeg: number): boolean {
  return sunElevationDeg(site, sunLonDeg, sunLatDeg) + SUN_RADIUS_DEG > site.horizonDeg
}

export interface SweepSummary {
  everLit: boolean
  /** Highest the Sun gets over the walls' horizon anywhere in the sweep, degrees (flat-ground elevation) */
  maxElevationDeg: number
  /** A sun longitude where the site is lit, or null */
  litLonDeg: number | null
  /** The sun latitude at that moment */
  litLatDeg: number | null
}

/** Sweep every longitude and every allowed latitude: the full-lunar-day test */
export function sweepSite(site: Site, lonStep = 2, latStep = 0.25): SweepSummary {
  let max = -90
  let litLon: number | null = null
  let litLat: number | null = null
  for (let lat = -AXIAL_TILT_DEG; lat <= AXIAL_TILT_DEG + 1e-9; lat += latStep) {
    for (let lon = 0; lon < 360; lon += lonStep) {
      const e = sunElevationDeg(site, lon, lat)
      if (e > max) max = e
      if (litLon === null && isLit(site, lon, lat)) {
        litLon = lon
        litLat = lat
      }
    }
  }
  return { everLit: litLon !== null, maxElevationDeg: max, litLonDeg: litLon, litLatDeg: litLat }
}

/** Computed from the sweep (what the rules say), as opposed to the designed `psr` flag */
export const isPsr = (site: Site) => !sweepSite(site).everLit

/* ------------------------------ sweeping the Sun ------------------------------ */

export const emptySweep = (): boolean[] => Array.from({ length: SWEEP_BINS }, () => false)

const binOf = (lon: number) => Math.floor(wrapLon(lon) / (360 / SWEEP_BINS)) % SWEEP_BINS

/** Mark every bin on the shortest arc from one sun longitude to the next */
export function markArc(bins: readonly boolean[], fromLon: number, toLon: number): boolean[] {
  const out = bins.slice()
  const d = lonDelta(fromLon, toLon)
  const n = Math.max(1, Math.ceil(Math.abs(d) / 3))
  for (let i = 0; i <= n; i++) out[binOf(fromLon + (d * i) / n)] = true
  return out
}

export const sweepCoverage = (bins: readonly boolean[]) => bins.filter(Boolean).length / bins.length
export const sweepComplete = (bins: readonly boolean[]) => bins.every(Boolean)

/** Which sites have been seen in sunlight so far (the sweep memory the view paints) */
export function updateSeenLit(seen: readonly string[], lon: number, lat: number): string[] {
  const add = SITES.filter((s) => !seen.includes(s.id) && isLit(s, lon, lat)).map((s) => s.id)
  return add.length ? [...seen, ...add] : (seen as string[])
}

/* ---------------------------------- tagging ---------------------------------- */

export interface TagState {
  tagged: string[]
  wrong: string[]
  swept: boolean[]
}

export const initialTagState = (): TagState => ({ tagged: [], wrong: [], swept: emptySweep() })

export type TagOutcome = 'correct' | 'wrong' | 'already' | 'early' | 'unknown'

export interface TagResult {
  state: TagState
  outcome: TagOutcome
  message: string
  done: boolean
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString()

/** Why a lit site is not a PSR, in the player's words */
export function whyNotPsr(site: Site): string {
  const s = sweepSite(site)
  const where = s.litLonDeg === null ? '' : ` when the Sun was near ${Math.round(s.litLonDeg)} degrees longitude`
  return `${site.name} saw sunlight${where}. A permanently shadowed region must stay dark all the way round.`
}

/** Try to tag a site as a PSR. Pure: returns the next state and the line to show. */
export function tagSite(state: TagState, id: string): TagResult {
  const site = siteById(id)
  if (!site) return { state, outcome: 'unknown', message: '', done: false }
  if (state.tagged.includes(id)) {
    return { state, outcome: 'already', message: `${site.name} is already tagged.`, done: state.tagged.length >= PSR_GOAL }
  }
  if (!sweepComplete(state.swept)) {
    return {
      state,
      outcome: 'early',
      message: 'Swing the Sun all the way around first. You cannot call it dark until you have watched a full day.',
      done: false,
    }
  }
  if (isPsr(site)) {
    const next = { ...state, tagged: [...state.tagged, id] }
    return {
      state: next,
      outcome: 'correct',
      message: `${site.name}: the Sun never got in. Max ${fmt(sweepSite(site).maxElevationDeg)} degrees, and the walls are higher. Tagged.`,
      done: next.tagged.length >= PSR_GOAL,
    }
  }
  const next = state.wrong.includes(id) ? state : { ...state, wrong: [...state.wrong, id] }
  return { state: next, outcome: 'wrong', message: whyNotPsr(site), done: false }
}

/* ---------------------------------- reserve ---------------------------------- */

export const RESERVE_STEP = 5
export const RESERVE_MAX = 20
export const RESERVE_COINS = RESERVE_MAX / RESERVE_STEP
export const clampCoins = (n: number) => Math.max(0, Math.min(RESERVE_COINS, Math.round(n)))
export const reservePercentFromCoins = (coins: number) => clampCoins(coins) * RESERVE_STEP
export const coinsFromPercent = (percent: number) => clampCoins(percent / RESERVE_STEP)
export const reserveAmountM = (budgetCapM: number, percent: number) => (budgetCapM * percent) / 100
/** Money that can still buy parts: the reserve is locked away */
export const spendableM = (budgetCapM: number, percent: number) => budgetCapM - reserveAmountM(budgetCapM, percent)

/* ---------------------------------- result ---------------------------------- */

export interface ShadowHuntOutcome {
  state: TagState
  reservePercent: number
  budgetCapM: number
  durationS: number
}

export function buildResult(design: Design, o: ShadowHuntOutcome): MinigameResult {
  const found = o.state.tagged.map((id) => siteById(id)?.name ?? id)
  const first = o.state.tagged[0] ? siteById(o.state.tagged[0]) : undefined
  const insights: Insight[] = []
  if (found.length > 0) {
    insights.push({
      id: 'psr-found',
      room: 'briefing',
      text:
        found.length === 1 || !first
          ? `${found[0]}'s floor never saw the Sun in a full lunar day.`
          : `${first.name}'s floor never saw the Sun in a full lunar day, and neither did ${found.slice(1).join(' or ')}.`,
      metric: { label: 'PSRs found', value: found.length, unit: '' },
    })
  }
  if (o.state.tagged.includes('cabeus')) {
    insights.push({
      id: 'psr-water',
      room: 'briefing',
      text: 'Cabeus is where the LCROSS probe found water in the dark in 2009.',
      metric: { label: 'Water in LCROSS plume', value: 5.6, unit: '%' },
    })
  }
  insights.push({
    id: 'reserve-set',
    room: 'briefing',
    text:
      o.reservePercent === 0
        ? 'You kept no reserve: any surprise in flight has nothing to pay for it.'
        : `You locked ${fmt(reserveAmountM(o.budgetCapM, o.reservePercent))} M (${o.reservePercent}%) away for surprises. Parts can only use ${fmt(spendableM(o.budgetCapM, o.reservePercent))} M.`,
    metric: { label: 'Reserve', value: o.reservePercent, unit: '%' },
  })
  return {
    patch: { planning: { ...design.planning, reservePercent: o.reservePercent } },
    insights,
    durationS: Math.round(o.durationS),
  }
}
