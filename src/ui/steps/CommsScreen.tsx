import { useGameStore } from '../../state/gameStore'
import { getPartById } from '../../data/parts'
import { getGroundStationById } from '../../data/ground'
import { useEffect, useRef, useState } from 'react'
import { LinkConsole, LinkRibbon } from './comms/LinkConsole'
import { RadioTray } from './comms/RadioTray'
import { StationTray } from './comms/StationTray'
import { hoursAfterSwitch } from './comms/hours'
import { ContactSlider } from './comms/ContactSlider'

/**
 * Step 6 at the Communications Center: the comms console. The link budget sits on top as a
 * signal path and a gauge (a slim copy stays on top while scrolling, so every pick shows its effect), then the radio and the
 * ground station as card trays, then the contact-time slider. Every number is from
 * computeBudgets / goNoGo; this step writes only radio, groundStation and contactHours.
 */
export function CommsScreen() {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const getBudgets = useGameStore((s) => s.getBudgets)
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)

  const budgets = getBudgets()
  const checks = getGoNoGo().checks
  const radio = getPartById(design.radio)
  const station = getGroundStationById(design.groundStation)
  const maxHours = station?.contactHoursPerDay ?? 1
  const commsCheck = checks.find((c) => c.resource === 'Comms')
  const dataCheck = checks.find((c) => c.resource === 'Data Link')

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
      <LinkRibbon budgets={budgets} data={dataCheck} visible={consoleOut} />
      <div className="space-y-6">
        <header className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#0b1226] to-[#03050a] px-6 pb-5 pt-6">
          <div className="font-mono text-xs tracking-[0.25em] text-blue-400">COMMS CENTER · LUNAR ICE MAPPER · COMMUNICATIONS</div>
          <h1 className="mt-3 font-display text-3xl font-bold text-white">6. Communications</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Only data that reaches the ground counts. The Moon is a thousand times farther than low Earth orbit, so the radio and the
            ground station decide how much gets home.
          </p>
        </header>

        <div ref={consoleRef}>
          <LinkConsole
            budgets={budgets}
            comms={commsCheck}
            data={dataCheck}
            radioId={design.radio}
            radioName={radio?.name ?? 'No radio'}
            stationId={design.groundStation}
            stationName={station?.name ?? 'No station'}
          />
        </div>

        <RadioTray design={design} difficulty={difficulty} onPick={(id) => updateDesign({ radio: id })} />

        <StationTray
          design={design}
          difficulty={difficulty}
          onPick={(s) => updateDesign({ groundStation: s.id, contactHours: hoursAfterSwitch(design, s) })}
        />

        <ContactSlider
          hours={budgets.contactHours}
          maxHours={maxHours}
          stationName={station?.name ?? 'The station'}
          costPerMonth={budgets.groundCostPerTurn}
          onChange={(h) => updateDesign({ contactHours: h })}
        />

        <div className="flex justify-between">
          <button
            onClick={() => setDesignStep('ride')}
            className="rounded-xl bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10"
          >
            ← Back
          </button>
          <button
            onClick={() => setDesignStep('go-nogo')}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(59,130,246,0.45)] hover:bg-blue-500"
          >
            Go/No-Go Review →
          </button>
        </div>
      </div>
    </div>
  )
}
