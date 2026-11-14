# Quality control findings register

Kept by the Integration session, so nothing the "Game quality control" session finds gets lost.

**Rule (Jakob, 14 Nov):** nobody acts on or delegates a finding until Jakob has given his view on it.

**Status:** `waits-jakob` (not yet decided), `go` (Jakob agreed; owner and PR noted), `fixed` (merged into main), `no` (Jakob declined), `info` (a positive or a note; nothing to do).

**Groups in the questions to Jakob:**
- **A:** small bugs Integration proposes to just fix.
- **B1-B6:** design decisions; answered 14 Nov 18:29.
- **C1-C6:** design decisions, open.

| # | Sev | Finding | Group | Status | Owner / PR |
|---|-----|---------|-------|--------|------------|
| 1 | High | The Go/No-Go margin counts against the cap ("+0.1 margin"), while the text counts against what is spendable | A | Partly fixed: #21 makes the Budget bar red past the reserve. The margin number still counts against the cap: waits-jakob | Integration |
| 2 | Info | The default craft says "Go" although it cannot see shadowed ice (deliberate: Science is never red). Make the headline say it cannot succeed? | C5 | waits-jakob | Integration |
| 3 | High | Research Lab levels are not enforced (the neutron spectrometer can be picked at LV2) | B1 | go: enforce | Instrument Selection |
| 4 | Med | Agency funds and mission money never meet | B2 | go: failure just uses up the budget | round-2 builder (design/round-2) |
| 5 | Med | The base clock runs in real time while the player reads (it loses about a day a second on first load) | B3 | go: paused until the player acts | design/round-2 |
| 6 | Med | "+ New mission" opens the old step flow; three unrelated demo missions sit in the list | B4 | go: walk into the buildings; remove the demo missions | design/round-2 |
| 7 | Low | Building labels overlap; the instrument panel clips text (only at 800 px wide or less, see #33) | A | waits-jakob | Integration / Instrument Selection |
| 8 | High→ | "Fly until something happens" never stops (QC corrected this: it does stop at cards). The capture burn and the outcome of a chosen option are silent | (B round 1) | fixed: #21 plays turn by turn and stops at milestones | Integration |
| 9 | High | The first reasonable try wins; difficulty only changes a label | B5 | go: remove difficulty levels for now | design/round-2 |
| 10 | Med | The success report does not say what cost the missing points | B6 | go | design/round-2 |
| 11 | Med | Money does not close the loop; the funds chart goes flat after launch | B2 | go (with #4) | design/round-2 |
| 12 | Med | Go/No-Go rows: Budget margin vs text; Delta-v and Data Link show "+ margin" while NO-GO | A | waits-jakob | Integration |
| 13 | Low | Research Lab badge stays at LV2 after the upgrade; feed said "turn 3" vs the card's "turn 6"; the calendar moves after pausing | A | Feed numbering fixed by #21 (mission days). Badge waits-jakob; calendar goes with B3 | Integration |
| 14 | Low | Sidebar steps did not respond to coordinate clicks (programmatic clicks did); 3D board text is tiny at 800x600 | A | waits-jakob (verify first: may be the test tool) | Integration |
| 15 | Med-High | A failed mission shows a green COMPLETE 100% card, and funds rise | B2 | go | design/round-2 |
| 16 | Med | Event outcomes are silent (did emergency tracking work?) | A | waits-jakob | Integration |
| 17 | Low | Data Link caution says "less than 15% to spare" when the instruments make twice what the link carries | A | waits-jakob | Integration |
| 18 | Info | Orbit, ride and comms steps were plain cards | — | Orbit room merged (#18); ride room in progress (Ride & Transfer); comms open | Ride & Transfer |
| 19 | Low | "Retry with Changes" lands mid-page on the Brief; "Reset demo to day 112" label is stale | A | waits-jakob | Integration |
| 20 | High | At 375x812 the design screens are unusable | C2 | waits-jakob: do phones matter? | — |
| 21 | Med | Keyboard and screen readers: the base buildings are not focusable; the canvas has no name; play/pause buttons have no labels | A | waits-jakob | Integration |
| 22 | Low | Difficulty is invisible; "+ New mission" uses a native confirm() | B5/B4 | Difficulty moot (removed); confirm() goes with B4 | design/round-2 |
| 23 | Info | Console is clean (only three.js deprecation warnings) | — | info | — |
| 24 | High | Reloading mid-flight silently destroys the flight (the flight state is not saved) | C1 | waits-jakob | Integration |
| 25 | Med | No routing: the browser Back button leaves the game; nothing can be deep-linked | C4 | waits-jakob | — |
| 26 | Low | A planning mission's card shows a 100% bar; the bar means different things in different states | A | waits-jakob | Integration |
| 27 | Low | Base map is blank for a moment on load with no loader (1-2 s on a production build, see #34) | A | waits-jakob | Integration |
| 28 | Low | Copy numbers: "508 turns of upkeep" for a 12-turn mission; the ride capture burn is written three ways | A | waits-jakob | Integration (orbit) / Ride & Transfer (ride) |
| 29 | Low | Ride/comms key numbers are text lists; a made-vs-carried bar would teach the data-loss lesson | C6 | waits-jakob | — |
| 30 | Info | Keep: "What this choice changed" strip, per-orbit ice line, real-mission references | — | info | — |
| 31 | High-ish | The game is silent: Kamel's audio pipeline exists but nothing uses it | C3 | waits-jakob | — |
| 32 | High | The base map has no WebGL check or error boundary. Confirmed by Ride & Transfer: with WebGL off, the whole app is a white page | A | waits-jakob (recommended first) | Integration |
| 33 | Info | At 1440x900 the labels do not overlap (#7 only matters on small screens) | — | info | — |
| 34 | Info | The long blank map was the dev server; production shows the map in 1-2 s | — | info | — |
| 35 | Med | The report says "Emergency tracking did not find the craft" when the player chose to give up (src/sim/evaluate.ts whyNoCapture) | A | waits-jakob | Integration |
| 36 | Med | A lost mission (0/1000) shows COMPLETE 100% on the base | B2 | go (with #15) | design/round-2 |
| 37 | Info | Keep: the lost-mission report ties the cause back to the player's decision | — | info | — |
| 38 | Low | After a loss the calendar jumps months in one click; a short "8 months passed" line would explain it | A | waits-jakob | Integration |
| 39 | Med | Replay says "Choice: Give up the search - failed"; the report tells a different story (same root as #35) | A | waits-jakob | Integration |
| 40 | Low | Replay timeline buttons have no aria-label | A | waits-jakob | Integration |
| 41 | Med | The replay is the least dramatic screen; nothing visual happens at the loss | C6 | waits-jakob | — |
| 42 | Info | Keep: replay timeline colours, event marks and per-turn numbers | — | info | — |
| 43 | Low-Med | The event card is not a dialog: no role, no focus, Escape does nothing | A | waits-jakob | Integration |
| 44 | Info | Keep: picking a ride updates the dashboard and Go/No-Go instantly, with the reason | — | info | — |
| 45 | Low | "Build effort 37 points = 4 turns" is jargon; say "4 months of building" | A | waits-jakob | Integration |
| 46 | Info | Rapid clicks: no duplicate launch, no duplicate feed entries | — | info | — |

## Deletion candidates (batch 12)

QC tested group D1 in its own worktree: removing it keeps typecheck, 224/224 tests and the build green.

| # | Group | What | Status | Owner |
|---|-------|------|--------|-------|
| 47 | D1 dead code (~720 lines) | src/ui/TeamMode.tsx, src/ui/screens/TitleScreen.tsx, src/scene/SpacecraftView.tsx, src/ui/Tooltip.tsx + src/data/glossary.ts, src/data/reference.ts, and their barrel export lines | waits-jakob | Integration (after design/round-2 merges) |
| 48 | D2 probably dead | src/data/sources.ts (may be the record of where the numbers come from); unused barrels src/{assets,data,scene,sim,ui,viz}/index.ts; nine helpers with no callers (getEventsForPhase, searchGlossary, getPartsByCategory, generateComparison, getReferenceMissionById, getNextRide, getCompatibleTransfers, getOutcomeEmoji, getGrade) | waits-jakob | Integration |
| 49 | D3 dead team mode | gameStore mode/players/setMode/setPlayers/sign-offs (persisted); the "Roles" legend in src/ui/StepRail.tsx | waits-jakob | Integration |
| 50 | D4 visible UI | "+ BUILD coming soon" placeholder on the map; funds and support shown twice; "New Game" next to "Agency base" in the design header; "Reset demo to day 112" once the demo missions go | waits-jakob | Integration |
| 51 | D5 repo weight | docs/resources (3.9 MB of PDFs), assets-src/concepts (5.6 MB of PNGs), the asset lab dev tool | waits-jakob | Kamel / Jakob |
