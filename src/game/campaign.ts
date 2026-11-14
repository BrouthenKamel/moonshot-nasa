/**
 * Campaign progress shown at Headquarters: three phases from a tiny agency
 * to a base on Mars. The demo starts with phase 1 done.
 */
import type { World } from './world'

export interface CampaignGoal {
  label: string
  state: 'done' | 'active' | 'locked'
}

export interface CampaignPhase {
  id: string
  name: string
  goals: CampaignGoal[]
}

export function campaign(world: World): CampaignPhase[] {
  const day = world.day
  const lunar = world.mission
  const mapped = !!lunar?.last.ended && lunar.last.outcome === 'success'
  const lunarState: CampaignGoal['state'] = mapped ? 'done' : 'active'

  return [
    {
      id: 'earth',
      name: '1. Earth orbit',
      goals: [
        { label: 'First satellite in orbit (Aurora-1)', state: day >= 41 ? 'done' : 'active' },
        { label: 'First mission beyond Earth orbit (Relay Pathfinder)', state: day >= 70 ? 'done' : 'active' },
      ],
    },
    {
      id: 'moon',
      name: '2. The Moon',
      goals: [
        { label: 'Lunar relay in orbit (Relay Pathfinder)', state: day >= 190 ? 'done' : 'active' },
        { label: 'Map water ice at the south pole (Lunar Ice Mapper)', state: lunarState },
        { label: 'Crewed landing', state: 'locked' },
      ],
    },
    {
      id: 'mars',
      name: '3. Mars base',
      goals: [
        { label: 'Survey Mars with a probe', state: 'locked' },
        { label: 'Send cargo ahead', state: 'locked' },
        { label: 'Crewed landing', state: 'locked' },
        { label: 'Build the base', state: 'locked' },
      ],
    },
  ]
}

export function phaseProgress(phase: CampaignPhase): number {
  return phase.goals.filter((g) => g.state === 'done').length / phase.goals.length
}
