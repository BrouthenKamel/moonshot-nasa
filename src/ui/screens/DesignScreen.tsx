import { useGameStore } from '../../state/gameStore'
import { DesignDiagramPanel } from '../../viz/DesignDiagramPanel'
import type { DesignStep } from '../../sim/types'
import {
  BriefScreen,
  PlanningScreen,
  InstrumentsScreen,
  RocketScreen,
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
    case 'rocket':
      return <RocketScreen />
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

/** Steps that draw their own full view instead of the shared diagram panel. */
const STEPS_WITHOUT_DIAGRAM: DesignStep[] = ['planning', 'instruments', 'rocket', 'spacecraft', 'orbit', 'ride', 'comms', 'go-nogo']

export function DesignScreen() {
  const designStep = useGameStore((s) => s.designStep)

  return (
    <>
      {!STEPS_WITHOUT_DIAGRAM.includes(designStep) && <DesignDiagramPanel step={designStep} />}
      <StepScreen designStep={designStep} />
    </>
  )
}
