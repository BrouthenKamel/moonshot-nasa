import type { BuildingId } from '../../data/agency'
import type { CheckResult, Role } from '../../sim/types'
import { buildingForStep } from '../missionMap'

/**
 * The Go / No-Go poll: the four stations of the board's roles, each answering for the checks
 * that are fixed in its building. Pure: grouping only, every status comes from goNoGo().
 */
export interface Station {
  role: Role
  title: string
  building: string
  status: 'green' | 'yellow' | 'red'
  checks: CheckResult[]
}

export const ROLE_INFO: Record<Role, { title: string; building: BuildingId; buildingName: string; color: string }> = {
  ground: { title: 'Ground', building: 'comms-center', buildingName: 'Communications Center', color: '#3b82f6' },
  science: { title: 'Science', building: 'research-lab', buildingName: 'Research Lab', color: '#22c55e' },
  space: { title: 'Spacecraft', building: 'factory', buildingName: 'Factory', color: '#a855f7' },
  launch: { title: 'Launch', building: 'launch-site', buildingName: 'Launch Site', color: '#f97316' },
}

export const POLL_ORDER: Role[] = ['ground', 'science', 'space', 'launch']

const ROLE_OF_BUILDING: Record<BuildingId, Role> = {
  'comms-center': 'ground',
  'research-lab': 'science',
  factory: 'space',
  'launch-site': 'launch',
}

export function stations(checks: CheckResult[]): Station[] {
  return POLL_ORDER.map((role) => {
    const mine = checks.filter((c) => (c.fixStep ? ROLE_OF_BUILDING[buildingForStep(c.fixStep)] : 'ground') === role)
    const status = mine.some((c) => c.status === 'red') ? 'red' : mine.some((c) => c.status === 'yellow') ? 'yellow' : 'green'
    return { role, title: ROLE_INFO[role].title, building: ROLE_INFO[role].buildingName, status, checks: mine }
  })
}
