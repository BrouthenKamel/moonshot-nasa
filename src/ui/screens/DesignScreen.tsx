import { useEffect } from 'react'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'
import { DesignDiagramPanel } from '../../viz/DesignDiagramPanel'
import type { DesignStep } from '../../sim/types'
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
    // The rocket is explained inside the Craft step now; an old save on 'rocket' opens the craft
    case 'rocket':
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
const STEPS_WITHOUT_DIAGRAM: DesignStep[] = ['brief', 'planning', 'instruments', 'rocket', 'spacecraft', 'orbit', 'ride', 'comms', 'go-nogo']

/** The hint ladder's note on the step the Fix button opened; it goes when the player leaves that step */
function FixHintBanner({ designStep }: { designStep: DesignStep }) {
  const hint = useUiStore((s) => s.fixHint)
  const setFixHint = useUiStore((s) => s.setFixHint)
  useEffect(() => {
    if (hint && hint.step !== designStep) setFixHint(null)
  }, [hint, designStep, setFixHint])
  if (!hint || hint.step !== designStep) return null
  return (
    <div role="note" data-testid="fix-hint" className="border-b border-kapton/40 bg-kapton/10 px-4 py-1.5 text-xs text-paper">
      <span className="fp-label mr-2 text-kapton">Fix this here</span>
      {hint.why}
    </div>
  )
}

export function DesignScreen() {
  const designStep = useGameStore((s) => s.designStep)

  return (
    <>
      <FixHintBanner designStep={designStep} />
      {!STEPS_WITHOUT_DIAGRAM.includes(designStep) && <DesignDiagramPanel step={designStep} />}
      <StepScreen designStep={designStep} />
    </>
  )
}
