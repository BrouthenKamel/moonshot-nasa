# Map–game bridge (short design)

*14 Nov 2026. Approach chosen by Jakob from browser mockups: C, the map as a menu.*

## Intent
The agency map (Balazs's base screen, PR #4) is the visual direction of the game. For the one mission we have, the Lunar Ice Mapper, the map should be where the player goes to make every decision, and all logic must come from the logic core (`src/sim`, `src/data`). Buildings, economy and publicity on the base stay placeholders to be filled in later.

## Goals
- Each building leads to the decisions of its role: Comms Center (Ground) to 1 Planning, 6 Comms and 7 Go / No-Go; Research Lab (Science) to 2 Instruments; Factory (Space) to 3 Spacecraft; Launch Site (Launch) to 4 Orbit and 5 Ride.
- Free order with a hint: any building can be opened at any time; the next suggested step's building is highlighted.
- Building labels show the mission's live state from the core (for example the Factory: "12.8 / 14 kg · 2 warnings"; a building whose step has a red Go / No-Go bar is marked).
- The flight plays on the base: turn controls, event cards over the island, events in the activity feed, mission card progress from the core.
- One clock: once the mission is launched, the base day follows the mission turns (one turn = 30 days). The ride day shown on the base comes from the core (the chosen ride), not a hard-coded day 240.

## Non-goals
- Agency economy, publicity, building levels or unlocks affecting the mission.
- Restyling the step screens (they open full page, as today).
- More than one mission.

## Anti-goals
- Any second copy of mission maths in the base code. The base only reads `computeBudgets`, `goNoGo` and the flight state.
- Breaking the existing step flow, tests or replay.

## Approaches considered
- **A. Building drawers** reusing the step screens over the island. Keeps the player on the map; not chosen.
- **B. New game-style panels** per building. Most cohesive look; too much rebuilding before the pitch; not chosen.
- **C. Map as a menu (chosen).** A building click opens the existing full-page step screen; "← Agency base" returns. Least work, reuses tested screens; the trade-off is that the player leaves the map while deciding.

## Decided by Jakob
- Approach C. Flight on the base, as shown in the mockup.
- Logic only from the core; the map drives the decisions.

## Calls I made (correct if wrong)
- Before a mission is started the base clock keeps running on its own, as Balazs built it. From launch on, it is driven by the mission turns.
- Go / No-Go "Fix in step" and the red-bar hints name the building as well as the step.
- After Go / No-Go, "Launch" returns to the base and the flight runs there; the report and replay keep their current screens, reachable from the mission card.
- Work happens on branch `map-game-bridge` from `main`.

## Left to the builder
- Exact label wording and highlight style; how the craft is drawn on the island during transfer and orbit.
