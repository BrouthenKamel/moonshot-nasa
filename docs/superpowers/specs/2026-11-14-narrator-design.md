# Narrator: the storytelling layer (design, 14 Nov 2026)

Jakob, 14 Nov 18:55: "we need a proper story telling layer built into this, maybe we can have an astronaut character narrate in between steps." This is that layer. Branch `feat/narrator`.

## The character
**Commander Rosa Vega** (fictional), a retired astronaut who flew two long missions on the space station and is now the agency's mission mentor. She has seen missions fly and fail, she is warm and on the player's side, and she teaches by pointing at the one thing that matters right now.

Voice rules: plain English for a 15-year-old, one or two short sentences, says what a number means for the mission, names the real mission a lesson comes from (Lunar Flashlight, Lunar IceCube, LunaH-Map, LRO). Every number she says is read from `computeBudgets`, `goNoGo`, the flight state or the report; none is typed into a line.

## The arc
- **Why it matters:** the first crews to live on the Moon will need water, to drink, to breathe (oxygen) and to make rocket fuel. Ice may hide in craters at the south pole that have not seen the Sun for billions of years. Nobody has a good map of it yet.
- **The stakes:** one small, cheap spacecraft, one ride, one budget. Real CubeSats have tried this (Lunar Flashlight, Lunar IceCube, LunaH-Map) and most of them never reached their orbit. Every choice the player makes decides whether this one does.
- **The payoff:** an ice map that future crews will land by. The ending is honest about the outcome: success is celebrated, a partial map is still science, a failure is a lesson, a lost craft is mourned and learned from.

## The beats
Each beat has a stable `id` and a `text`, so recorded audio could map to it later (ElevenLabs TTS is an optional extension that needs Jakob's go; not in this branch). A beat shows once; the flight and ending beats show once per flight.

| id | When | Line (numbers in braces come from the logic core) |
|---|---|---|
| `start` | Base map, new mission, nothing opened yet | "Welcome to the team. I'm Rosa Vega. Somewhere in the dark craters at the Moon's south pole there may be ice, water for the first crews who live there. Let's go and map it. Start at the Comms Center." |
| `step-brief` | Comms Center, brief | Sees no shadow: "Our starting design carries an IR spectrometer, like Lunar IceCube. Before you launch, stop at the Research Lab and check whether it can see into the dark craters." Sees shadow: "The brief is short: map the ice, get the data home, stay in budget." |
| `step-planning` | Comms Center, planning | "You have {budgetCap} M. Money you hold back as a reserve, now {reserveAmount} M, is what pays for repairs in flight. With nothing held back, the first surprise can sink us." |
| `step-instruments` | Research Lab | Sees no shadow: "The IR spectrometer needs sunlight, and the ice hides where the Sun never shines. Lunar Flashlight brought its own lasers; LunaH-Map counted neutrons." Sees shadow: "{name} can see into the dark, like {flownOn}. It maps nothing above {maxAltitudeKm} km, so the orbit must take it low." |
| `step-spacecraft` | Factory | "Everything must fit in {volumeLimit}U and {massLimit} kg. You're at {totalMass} kg, and propellant counts too." |
| `step-orbit` | Launch Site, orbit | "Low passes see the ice best, but holding a low orbit burns {deltaVStationKeeping} m/s of fuel a month. LRO has mapped from low polar orbits for years." |
| `step-ride` | Launch Site, ride | "Your ride leaves in month {rideTurn}; the craft is ready in month {readyTurn}. Rides don't wait for anyone." (late: "...ready in month {readyTurn}, after it leaves. We'd miss it.") |
| `step-comms` | Comms Center, comms | "Ice only counts on the map once its data is home. You can send {downlinkPerTurn} MB a month; the instruments make {dataPerTurn} MB." |
| `go-nogo` | Comms Center, Go / No-Go | Go: "Every bar is clear of red. Projected ice coverage: {projectedCoverage}%. It's your call now." No go: "{n} red bars. We don't fly with red. Each one says what to fix." |
| `flight-build` | Flight on the map, before launch | "The Factory is building her now. Our ride leaves in month {launchTurn}." |
| `launch` | Transfer starts | "Liftoff! She's on her way to the Moon. Now we wait, and we watch." |
| `capture` | Capture burn | "Capture burn. If she slows down enough, the Moon catches her." |
| `orbit` | Mapping in orbit | "We're in orbit! The instruments are on, and the ice map starts now." |
| `event` | First event card of a flight | "Something has come up. Real missions faced this too{, like {realMission}}. Read the card and choose." |
| `end-success` | End, success | "We did it. {coverage}% of the ice mapped and {data} MB home. Future crews will land by your map." |
| `end-partial` | End, partial | "We mapped {coverage}% of the ice. Not the whole job, but real science. The report shows what held us back." |
| `end-failed` | End, failed (craft alive) | "She reached space, but the map came up short: {coverage}% of the ice. Every real team has had a day like this. The report shows why." |
| `end-lost` | End, craft lost | "We've lost her. It happened to real CubeSats too, Lunar Flashlight never reached its orbit. Read the report, then let's fly again." |

## Never blocking play
A small portrait with a speech bubble in the bottom-left corner, over the game. It never takes focus, never covers the flight buttons or event cards, and closes with ×, Escape or a click on the bubble. Its menu has "Don't show tips", remembered in localStorage (wrapped in try/catch); a small portrait button brings tips back. New lines are announced to screen readers with `aria-live="polite"`.

## Where it lives
- `src/ui/narrator/beats.ts`: the pure `pickBeat(state)` (screen, designStep, visitedSteps, sim phase and pending event, report outcome, plus the numbers) and the beat ids; tested in `beats.test.ts`.
- `src/ui/narrator/Narrator.tsx`, `Portrait.tsx`, `narratorPrefs.ts`: the overlay, original inline SVG art, the remembered choices.
- Mounted once in `src/App.tsx`, over both the base map and the Shell screens. No edits to `BaseScreen`, `BaseMap`, the top bar or `src/ui/flight`.
- I5a: the brief step also shows the hint in the page itself: "Your first stop: the Research Lab. Check whether your instrument can see into the dark craters."
