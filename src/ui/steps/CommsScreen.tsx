import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'
import { useDragStore } from '../interaction/dragStore'
import { useDesignPreview } from '../useDesignPreview'
import { DesignDeltaLine, SynergyStrip } from '../../viz/DesignDeltaLine'
import { difficultyPresets } from '../../data/brief'
import { getPartById } from '../../data/parts'
import { getGroundStationById } from '../../data/ground'
import { useEffect, useRef, useState } from 'react'
import { LinkConsole, LinkRibbon } from './comms/LinkConsole'
import { RadioTray } from './comms/RadioTray'
import { StationTray } from './comms/StationTray'
import { hoursAfterSwitch } from './comms/hours'
import { ContactSlider } from './comms/ContactSlider'
import { Btn, Details, StepHeader } from '../kit'

function hoveredChoiceId(target: EventTarget | null): string | null {
  return target instanceof Element ? target.closest<HTMLElement>('[data-choice-id]')?.dataset.choiceId ?? null : null
}

/**
 * Step 7 at the Communications Center: the comms console. The link budget sits on top as a
 * signal path and a gauge (a slim copy stays on top while scrolling, so every pick shows its effect), then the radio and the
 * ground station as card trays. The console holds the controls: the radio slot, the dish aim and the contact hours. Every number is from
 * computeBudgets / goNoGo; this step writes only radio, groundStation and contactHours.
 */
export function CommsScreen() {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const setPreviewPatch = useUiStore((s) => s.setPreviewPatch)
  const { budgets, checks: goNoGo, previewBudgets, previewChecks, previewPatch } = useDesignPreview()
  const activeBudgets = previewBudgets ?? budgets
  const activeGoNoGo = previewChecks ?? goNoGo

  useEffect(() => () => setPreviewPatch(null), [setPreviewPatch])

  const checks = activeGoNoGo.checks
  const radioId = previewPatch?.radio ?? design.radio
  const stationId = previewPatch?.groundStation ?? design.groundStation
  const radio = getPartById(radioId)
  const station = getGroundStationById(stationId)
  const maxHours = station?.contactHoursPerDay ?? 1
  const commsCheck = checks.find((c) => c.resource === 'Comms')
  const dataCheck = checks.find((c) => c.resource === 'Data Link')
  const dataTarget = (difficultyPresets[difficulty] ?? difficultyPresets.engineer).dataTarget

  // Show the slim link ribbon once the full console has scrolled out of view
  const consoleRef = useRef<HTMLDivElement>(null)
  const [consoleOut, setConsoleOut] = useState(false)
  useEffect(() => {
    const el = consoleRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setConsoleOut(!e.isIntersecting && e.boundingClientRect.top < 0), {
      root: el.closest('main'),
      threshold: 0,
      rootMargin: '-120px 0px 0px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div className="mx-auto max-w-5xl pb-6">
      <LinkRibbon budgets={activeBudgets} data={dataCheck} visible={consoleOut} />
      <div className="space-y-5">
        <StepHeader step="comms" kicker="Comms Center" title="Communications" />
        <p className="max-w-2xl px-1 text-sm text-paper-dim">
          Only data that reaches the ground counts. The Moon is a thousand times farther than low Earth orbit, so the radio and the ground
          station decide how much gets home.
        </p>

        <div ref={consoleRef}>
          <LinkConsole
            budgets={activeBudgets}
            comms={commsCheck}
            data={dataCheck}
            radioId={radioId}
            radioName={radio?.name ?? 'No radio'}
            stationId={stationId}
            stationName={station?.name ?? 'No station'}
            dataTarget={dataTarget}
            onPickRadio={(id) => updateDesign({ radio: id })}
            onPickStation={(id) => {
              const s = getGroundStationById(id)
              if (s) updateDesign({ groundStation: s.id, contactHours: hoursAfterSwitch(design, s) })
            }}
            contact={
              <ContactSlider
                hours={activeBudgets.contactHours}
                maxHours={maxHours}
                stationName={station?.name ?? 'The station'}
                costPerMonth={activeBudgets.groundCostPerTurn}
                onChange={(h) => updateDesign({ contactHours: h })}
              />
            }
            onPreviewStation={(id) => {
              if (!id) {
                setPreviewPatch(null)
                return
              }
              const s = getGroundStationById(id)
              if (s) setPreviewPatch({ groundStation: s.id, contactHours: hoursAfterSwitch(design, s) })
            }}
          />
        </div>

        <SynergyStrip step="comms" />
        <DesignDeltaLine />

        <div
          onMouseOver={(e) => {
            if (useDragStore.getState().held) return
            const id = hoveredChoiceId(e.target)
            setPreviewPatch(id ? { radio: id } : null)
          }}
          onMouseLeave={() => {
            if (!useDragStore.getState().held) setPreviewPatch(null)
          }}
          onFocus={(e) => {
            const id = hoveredChoiceId(e.target)
            if (id) setPreviewPatch({ radio: id })
          }}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !useDragStore.getState().held) setPreviewPatch(null)
          }}
        >
          <RadioTray design={design} difficulty={difficulty} onPick={(id) => updateDesign({ radio: id })} />
        </div>

        <div
          onMouseOver={(e) => {
            if (useDragStore.getState().held) return
            const id = hoveredChoiceId(e.target)
            const s = id ? getGroundStationById(id) : undefined
            setPreviewPatch(s ? { groundStation: s.id, contactHours: hoursAfterSwitch(design, s) } : null)
          }}
          onMouseLeave={() => {
            if (!useDragStore.getState().held) setPreviewPatch(null)
          }}
          onFocus={(e) => {
            const id = hoveredChoiceId(e.target)
            const s = id ? getGroundStationById(id) : undefined
            if (s) setPreviewPatch({ groundStation: s.id, contactHours: hoursAfterSwitch(design, s) })
          }}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !useDragStore.getState().held) setPreviewPatch(null)
          }}
        >
          {/* The dish-size track in the console is the one control by default; the cards compare the stations in full */}
          <Details id="comms-stations" label="Compare ground stations" openLabel="Hide ground stations">
            <div className="pt-3">
              <StationTray
                design={design}
                difficulty={difficulty}
                onPick={(s) => updateDesign({ groundStation: s.id, contactHours: hoursAfterSwitch(design, s) })}
              />
            </div>
          </Details>
        </div>

        <div className="flex justify-end">
          <Btn variant="primary" type="button" onClick={() => setDesignStep('go-nogo')}>
            Go/No-Go review →
          </Btn>
        </div>
      </div>
    </div>
  )
}
