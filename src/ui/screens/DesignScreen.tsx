import { useGameStore } from '../../state/gameStore'
import { DesignDiagramPanel } from '../../viz/DesignDiagramPanel'
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

function StepScreen({ designStep }: { designStep: string }) {
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

export function DesignScreen() {
  const designStep = useGameStore((s) => s.designStep)

  return (
    <>
      <DesignDiagramPanel step={designStep} />
      <StepScreen designStep={designStep} />
    </>
  )
}
