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
  // The Science step anchors it to its own tray (ScienceDock); the others float it over the scene
  if (!hint || hint.step !== designStep || designStep === 'instruments') return null
  return (
    // Floats over the scene: a strip in the page flow pushed the tray and Next off a 800x600 screen
    <div className="pointer-events-none fixed inset-x-0 top-[10.5rem] z-40 flex justify-center px-4">
      <div role="note" data-testid="fix-hint" className="max-w-md border border-kapton/60 bg-ink-1/95 px-3 py-1.5 text-xs text-paper">
        <span className="fp-label mr-2 text-kapton">Fix this here</span>
        {hint.why}
      </div>
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
