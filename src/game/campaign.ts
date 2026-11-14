/**
 * Campaign progress shown at Headquarters: three phases from a tiny agency
 * to a base on Mars. The demo starts mid-game: the satellite phase is done
 * and the agency is working on the Moon.
 */
import type { World } from './world'

export interface CampaignGoal {
  label: string
  state: 'done' | 'active' | 'locked'
  /** 0-1 for a goal under way */
  progress?: number
}

export interface CampaignPhase {
  id: 'satellites' | 'moon' | 'mars'
  name: string
  goals: CampaignGoal[]
}

/** How far the Lunar Ice Mapper has come: launched counts a third, the ice map the rest */
function iceMapperProgress(world: Pick<World, 'mission'>): number {
  const last = world.mission?.last
  if (!last) return 0
  if (last.ended) return last.outcome === 'success' ? 1 : last.outcome === 'partial' ? 0.6 : 0
  if (!last.launched) return 0.1
  return Math.min(0.95, 0.33 + (last.coverage / 70) * 0.62)
}

export function campaign(world: Pick<World, 'mission'>): CampaignPhase[] {
  const ice = iceMapperProgress(world)
  return [
    {
      id: 'satellites',
      name: 'Satellites',
      goals: [
        { label: 'Weather satellite in Earth orbit', state: 'done' },
        { label: 'Communications relay satellite', state: 'done' },
      ],
    },
    {
      id: 'moon',
      name: 'The Moon',
      goals: [
        { label: 'Lunar relay in orbit', state: 'done' },
        { label: 'Map water ice at the south pole', state: ice >= 1 ? 'done' : 'active', progress: ice },
        { label: 'Crewed landing', state: 'locked' },
      ],
    },
    {
      id: 'mars',
      name: 'Mars base',
      goals: [
        { label: 'Survey Mars with a probe', state: 'locked' },
        { label: 'Send cargo ahead', state: 'locked' },
        { label: 'Crewed landing', state: 'locked' },
        { label: 'Build the base', state: 'locked' },
      ],
    },
  ]
}

/** 0-1: done goals count fully, a goal under way counts its progress */
export function phaseProgress(phase: CampaignPhase): number {
  const sum = phase.goals.reduce((s, g) => s + (g.state === 'done' ? 1 : g.state === 'active' ? (g.progress ?? 0) : 0), 0)
  return sum / phase.goals.length
}
