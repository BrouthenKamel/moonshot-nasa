/**
 * What the base screen shows, derived from the agency state and the mission.
 * One function decides where the mission is (the stage); everything else
 * (building labels, the mission card, which panel the banner opens) follows.
 */
import type { BuildingId, MissionCardView } from '../../data/agency'
import type { BuildingLabel } from '../../scene/BaseMap'
import type { AgencyState } from '../../state/agencyStore'
import { campaign, phaseProgress } from '../../game/campaign'
import { missionLaunchDay } from '../../game/world'
import { paperProgress } from '../../game/research'
import { MISSION_NAME, missionDetails, planningProgress, type MissionDetails } from '../../game/missionLink'

export type Stage = 'none' | 'planning' | 'build' | 'test' | 'wait' | 'transfer' | 'orbit' | 'ended'

export function stageOf(a: AgencyState): Stage {
  const m = a.mission
  const flying = !!m && !m.last.ended
  if (!flying && a.planningSinceDay !== null) return 'planning'
  if (!m) return 'none'
  if (m.last.ended) return 'ended'
  switch (m.last.phase) {
    case 'build':
      return 'build'
    case 'test':
      return 'test'
    case 'wait':
      return 'wait'
    case 'orbit':
      return 'orbit'
    default:
      return 'transfer'
  }
}

/** The building where the mission is right now */
export const stageBuilding: Record<Stage, BuildingId> = {
  none: 'hq',
  planning: 'factory',
  build: 'factory',
  test: 'test-facility',
  wait: 'launch-site',
  transfer: 'comms-center',
  orbit: 'comms-center',
  ended: 'hq',
}

export interface BaseView {
  stage: Stage
  active: BuildingId
  details: MissionDetails | null
  labels: Record<BuildingId, BuildingLabel>
  card: MissionCardView | null
  daysToRide: number | null
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function baseView(a: AgencyState): BaseView {
  const stage = stageOf(a)
  const active = stageBuilding[stage]
  const day = Math.floor(a.day)
  const m = a.mission
  const details = m && !m.last.ended ? missionDetails() : null
  const decision = !!m?.last.decisionTitle && !m.last.ended
  const launched = !!m?.last.launched
  const rideDay = m && !launched ? missionLaunchDay(m) : null
  const daysToRide = rideDay !== null ? Math.max(0, rideDay - day) : null
  const plan = planningProgress()

  const moon = campaign(a)[1]
  const r = a.research
  const writing = r.papers.find((p) => p.publishedDay === null)
  const backlog = Math.max(0, r.received - r.processed)

  const buildLeft = details ? details.stagesLeft.design + details.stagesLeft.build + details.stagesLeft.integration : 0

  const labels: Record<BuildingId, BuildingLabel> = {
    hq: {
      status: stage === 'ended' ? `${MISSION_NAME} report ready` : `Moon phase ${Math.round(phaseProgress(moon) * 100)}% done`,
      progress: phaseProgress(moon),
    },
    factory:
      stage === 'planning'
        ? { status: `Designing · ${plan.step} (${plan.index} of ${plan.total})`, progress: plan.index / plan.total }
        : stage === 'build'
          ? { status: `Building ${MISSION_NAME} · ${plural(buildLeft, 'month')} left` }
          : { status: 'Idle · ready to build a 6U' },
    'test-facility':
      stage === 'test' && details
        ? { status: `Testing · ${plural(details.stagesLeft.test, 'month')} left` }
        : { status: details && stage === 'build' ? `${plural(details.testTurns, 'test month')} booked` : 'No spacecraft in test' },
    'launch-site':
      daysToRide !== null && (stage === 'build' || stage === 'test' || stage === 'wait')
        ? { status: `Ride leaves in ${plural(daysToRide, 'day')}` }
        : launched && !m!.last.ended
          ? { status: `${MISSION_NAME} launched` }
          : { status: 'No ride booked' },
    'comms-center':
      stage === 'transfer'
        ? { status: `${MISSION_NAME} on the way to the Moon` }
        : stage === 'orbit' && details
          ? {
              status: `Mapping · ${details.coverage.toFixed(0)}% · ${Math.round(details.dataMb)} MB home`,
              progress: Math.min(1, details.coverage / 70),
            }
          : { status: 'Listening' },
    'research-lab': writing
      ? { status: `Writing: ${writing.title.slice(0, 34)}…`, progress: paperProgress(r, writing), active: true }
      : backlog > 0
        ? { status: `Processing ${Math.round(backlog)} MB of data`, active: true }
        : { status: r.papers.length ? `${plural(r.papers.length, 'paper')} published` : 'Waiting for mission data' },
  }
  labels[active] = { ...labels[active], active: true, attention: decision }

  return { stage, active, details, labels, card: missionCard(a, stage, details, daysToRide), daysToRide }
}

function missionCard(a: AgencyState, stage: Stage, d: MissionDetails | null, daysToRide: number | null): MissionCardView | null {
  const m = a.mission
  const base = { id: 'lunar-ice-mapper', name: MISSION_NAME, real: true }
  switch (stage) {
    case 'none':
      return null
    case 'planning': {
      const p = planningProgress()
      return { ...base, status: 'planning', progress: p.index / p.total, detail: `Planning · ${p.step}` }
    }
    case 'build':
    case 'test':
    case 'wait': {
      const turn = m!.last.turn
      const total = Math.max(1, m!.last.launchTurn)
      return {
        ...base,
        status: stage === 'build' ? 'building' : stage === 'test' ? 'testing' : 'waiting',
        progress: Math.min(1, turn / total),
        detail: `Ride in ${daysToRide ?? 0} days`,
      }
    }
    case 'transfer':
      return { ...base, status: 'transfer', progress: 0.5, detail: 'On the way to the Moon' }
    case 'orbit':
      return {
        ...base,
        status: 'in-orbit',
        progress: Math.min(1, (d?.coverage ?? 0) / 70),
        detail: `Ice map ${(d?.coverage ?? 0).toFixed(0)}% · ${Math.round(d?.dataMb ?? 0)} MB home`,
      }
    case 'ended':
      return {
        ...base,
        status: m!.last.outcome === 'failed' ? 'lost' : 'complete',
        progress: 1,
        detail:
          m!.last.outcome === 'success'
            ? 'Full success'
            : m!.last.outcome === 'partial'
              ? `Partial success · ${m!.last.coverage.toFixed(0)}% mapped`
              : 'Mission lost',
      }
  }
}
