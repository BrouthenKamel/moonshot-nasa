import { useGameStore } from '../../state/gameStore'
import {
  BriefScreen,
  PlanningScreen,
  InstrumentsScreen,
  SpacecraftScreen,
  OrbitScreen,
  RideScreen,
  CommsScreen,
  GoNoGoScreen,
} from '../steps'

export function DesignScreen() {
  const designStep = useGameStore((s) => s.designStep)

  switch (designStep) {
    case 'brief':
      return <BriefScreen />
    case 'planning':
      return <PlanningScreen />
    case 'instruments':
      return <InstrumentsScreen />
    case 'spacecraft':
      return <SpacecraftScreen />
    case 'orbit':
      return <OrbitScreen />
    case 'ride':
      return <RideScreen />
    case 'comms':
      return <CommsScreen />
    case 'go-nogo':
      return <GoNoGoScreen />
    default:
      return <BriefScreen />
  }
}
