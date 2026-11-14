/**
 * Flight Lab (dev only): http://localhost:5173/flight-lab.html?stage=orbit&cov=0.6&orbit=orbit-halo
 * Shows the space view for a hand-made FlightShot, to check each state without flying a mission.
 * Query: stage (ground|transfer|orbit), t (0..1), cov (0..1), orbit, inst (comma list), burn, down, sci, end.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../index.css'
import { FlightView } from '../../scene/flight/FlightView'
import { createDefaultDesign } from '../../sim/budgets'
import type { FlightShot } from '../../viz/flight/flightDirector'

const q = new URLSearchParams(location.search)
const design = { ...createDefaultDesign(), orbit: q.get('orbit') ?? 'orbit-elliptical' }
if (q.get('inst')) design.instruments = q.get('inst')!.split(',')
if (q.get('prop')) design.propulsion = q.get('prop')!
const shot: FlightShot = {
  stage: (q.get('stage') as FlightShot['stage']) ?? 'orbit',
  transferT: Number(q.get('t') ?? 0.5),
  coverage: Number(q.get('cov') ?? 0.5),
  orbitId: design.orbit,
  instruments: design.instruments,
  burn: q.has('burn'),
  downlink: q.has('down'),
  science: q.has('sci'),
  cues: [],
  ending: (q.get('end') as FlightShot['ending']) ?? null,
  turn: 1,
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="relative h-screen w-screen bg-black">
      <FlightView design={design} shot={shot} />
    </div>
  </StrictMode>,
)
