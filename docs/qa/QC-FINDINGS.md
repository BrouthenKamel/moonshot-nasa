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
| 2 | Info | The default craft says "Go" although it cannot see shadowed ice (deliberate: Science is never red). Make the headline say it cannot succeed? | C5 | go: yes (18:35) | round-2 builder |
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
| 20 | High | At 375x812 the design screens are unusable | C2 | no: laptop only (18:35) | — |
| 21 | Med | Keyboard and screen readers: the base buildings are not focusable; the canvas has no name; play/pause buttons have no labels | A | waits-jakob | Integration |
| 22 | Low | Difficulty is invisible; "+ New mission" uses a native confirm() | B5/B4 | Difficulty moot (removed); confirm() goes with B4 | design/round-2 |
| 23 | Info | Console is clean (only three.js deprecation warnings) | — | info | — |
| 24 | High | Reloading mid-flight silently destroys the flight (the flight state is not saved) | C1 | go: keep the flight across a reload (18:35) | round-2 builder |
| 25 | Med | No routing: the browser Back button leaves the game; nothing can be deep-linked | C4 | go (read as yes to the question; 18:35), after round 2 | Integration |
| 26 | Low | A planning mission's card shows a 100% bar; the bar means different things in different states | A | waits-jakob | Integration |
| 27 | Low | Base map is blank for a moment on load with no loader (1-2 s on a production build, see #34) | A | waits-jakob | Integration |
| 28 | Low | Copy numbers: "508 turns of upkeep" for a 12-turn mission; the ride capture burn is written three ways | A | waits-jakob | Integration (orbit) / Ride & Transfer (ride) |
| 29 | Low | Ride/comms key numbers are text lists; a made-vs-carried bar would teach the data-loss lesson | C6 | go (read as yes to the question; 18:35), after round 2 | Integration |
| 30 | Info | Keep: "What this choice changed" strip, per-orbit ice line, real-mission references | — | info | — |
| 31 | High-ish | The game is silent: Kamel's audio pipeline exists but nothing uses it | C3 | go: sound + mute (18:35) | sound builder (feat/game-sound) |
| 32 | High | The base map has no WebGL check or error boundary. Confirmed by Ride & Transfer: with WebGL off, the whole app is a white page | A | waits-jakob (recommended first) | Integration |
| 33 | Info | At 1440x900 the labels do not overlap (#7 only matters on small screens) | — | info | — |
| 34 | Info | The long blank map was the dev server; production shows the map in 1-2 s | — | info | — |
| 35 | Med | The report says "Emergency tracking did not find the craft" when the player chose to give up (src/sim/evaluate.ts whyNoCapture) | A | waits-jakob | Integration |
| 36 | Med | A lost mission (0/1000) shows COMPLETE 100% on the base | B2 | go (with #15) | design/round-2 |
| 37 | Info | Keep: the lost-mission report ties the cause back to the player's decision | — | info | — |
| 38 | Low | After a loss the calendar jumps months in one click; a short "8 months passed" line would explain it | A | waits-jakob | Integration |
| 39 | Med | Replay says "Choice: Give up the search - failed"; the report tells a different story (same root as #35) | A | waits-jakob | Integration |
| 40 | Low | Replay timeline buttons have no aria-label | A | waits-jakob | Integration |
| 41 | Med | The replay is the least dramatic screen; nothing visual happens at the loss | C6 | go (read as yes to the question; 18:35), after round 2 | Integration |
| 42 | Info | Keep: replay timeline colours, event marks and per-turn numbers | — | info | — |
| 43 | Low-Med | The event card is not a dialog: no role, no focus, Escape does nothing | A | waits-jakob | Integration |
| 44 | Info | Keep: picking a ride updates the dashboard and Go/No-Go instantly, with the reason | — | info | — |
| 45 | Low | "Build effort 37 points = 4 turns" is jargon; say "4 months of building" | A | waits-jakob | Integration |
| 46 | Info | Rapid clicks: no duplicate launch, no duplicate feed entries | — | info | — |

## Deletion candidates (batch 12)

QC tested group D1 in its own worktree: removing it keeps typecheck, 224/224 tests and the build green.

| # | Group | What | Status | Owner |
|---|-------|------|--------|-------|
| D1 | dead code (~720 lines) | src/ui/TeamMode.tsx, src/ui/screens/TitleScreen.tsx, src/scene/SpacecraftView.tsx, src/ui/Tooltip.tsx + src/data/glossary.ts, src/data/reference.ts, and their barrel export lines | waits-jakob | Integration (after design/round-2 merges) |
| D2 | probably dead | src/data/sources.ts (may be the record of where the numbers come from); unused barrels src/{assets,data,scene,sim,ui,viz}/index.ts; nine helpers with no callers (getEventsForPhase, searchGlossary, getPartsByCategory, generateComparison, getReferenceMissionById, getNextRide, getCompatibleTransfers, getOutcomeEmoji, getGrade) | waits-jakob | Integration |
| D3 | dead team mode | gameStore mode/players/setMode/setPlayers/sign-offs (persisted); the "Roles" legend in src/ui/StepRail.tsx | waits-jakob | Integration |
| D4 | visible UI | "+ BUILD coming soon" placeholder on the map; funds and support shown twice; "New Game" next to "Agency base" in the design header; "Reset demo to day 112" once the demo missions go | waits-jakob | Integration |
| D5 | repo weight | docs/resources (3.9 MB of PDFs), assets-src/concepts (5.6 MB of PNGs), the asset lab dev tool | waits-jakob | Kamel / Jakob |

## Batch 13 (audit of main bcff375)

| # | Sev | Finding | Group | Status | Owner / PR |
|---|-----|---------|-------|--------|------------|
| 47 | Info | Keep: the new Orbit step (3D Moon, three orbits, time-lapse, a verdict per orbit) is the best screen | — | info | — |
| 48 | Med | The 3D orbit scene only shows when the window is at least about 1050 px wide; otherwise plain cards. Demo machine must run full width | demo note | waits-jakob | Jakob (demo setup) |
| 49 | Low | The orbit panel's red heading "INTO THE RESERVE WITH THIS ORBIT" reads as a verdict on the ice number | A | waits-jakob | Integration (orbit view, merged) |
| 50 | Low | The Resource Dashboard on other steps still shows cap-based "+0.9 margin" (same as #1) | A | waits-jakob | Integration |
| 51 | Low | The Factory tray colours the flight computer and attitude control cyan, which is reserved for ice (CubeSatDiagram.tsx:19, trayOptions.ts:36) | A | waits-jakob | SpaceCraft Design |
| 52 | Info | Ride, Comms, Go/No-Go and the Brief have no title line or dark-room treatment yet | — | info (Ride & Transfer in progress) | — |
| 53 | Low | The sidebar "Roles" legend is still shown (same as D3) | D3 | waits-jakob | Integration |
| 54 | Choice | Tooltip.tsx + glossary.ts (20 plain-language entries for delta-v, eclipse, Wh, ADCS…) are unused. Either wire the tooltips into the dashboard and step labels, or delete both | E1 | waits-jakob | Integration |
| 55 | Info | Keep: the Planning room's knob and slider are labelled range inputs, with instant feedback | — | info | — |
| 56 | Low | The long Go/No-Go advice line is cut off at the right edge of the Planning board (1280 px) | A | waits-jakob | Integration (planning room) |
| 57 | Low | No "recommended" marker on the reserve slider; mark 10% (CubeSat 101 advice) | A | waits-jakob | Integration (planning room) |

**Jakob, 18:38:**
- A list: yes.
- Deletions D1-D4: yes. D5 (repo weight) is not part of it.
- Tooltips (#54): wire them in.

All of these are being built on branch fix/qc-round-3 (round-3 builder), except the A items that depend on round 2 (#13 badge, #19, #26, #38), which come after round 2 merges.

## Batch 15: balance (headless simulation runs)

| # | Sev | Finding | Group | Status | Owner |
|---|-----|---------|-------|--------|-------|
| 58 | High | About 2 winning recipes: 6000 perturbations collapse into 8 winning combos (laser+halo+chemical+1-wing, or neutron/laser+elliptical+ion+2-wing) | F1 | waits-jakob | — |
| 59 | Med | ~10 of ~35 options never win (UHF, cold gas, 100 km orbit, GTO, direct transfer, large chemical, X-band, body solar, 20% reserve, any two instruments). Traps with a lesson, or trim? | F1 | waits-jakob | — |
| 60 | Med | Flight Director is unwinnable with the reference designs (moot once difficulty is removed) | — | info | — |
| 61 | Med | The Planning dials do little: test turns 0→2 moves success 82%→88%, and a reserve above 4% changes nothing | F2 | waits-jakob | — |
| 62 | Low | Best win rate is 88%, but the player is never told the odds; add "chance of success ~85%" in Go/No-Go | F2 | waits-jakob | — |

## Batch 16: decisions in flight

| # | Sev | Finding | Group | Status | Owner |
|---|-----|---------|-------|--------|-------|
| 63 | High | The 12 science turns have no player decision, although the sim supports them (TurnAction mode full/reduced/safe, buyExtraPass, useReserve; nothing in the UI sets them). Add a "this month" panel, or delete that code | F3 | waits-jakob | — |
| 64 | Med | Only 3 of 8 events offer a choice; the 5 orbit events are notifications only | F3 | waits-jakob | — |
| 65 | Low | The thruster card doesn't show what "accept" means for the player's own engine | A2 | waits-jakob | — |
| 66 | Low | The build-delay card's "x1.4 → x2" reads as hand-waving; show the success percentage | F2 | waits-jakob | — |

## Batch 17: text contrast (measured at 1280x800)

| # | Sev | Finding | Group | Status | Owner |
|---|-----|---------|-------|--------|-------|
| 67 | Med | 35-45% of text on the plain step screens fails WCAG AA (4.5:1); the grey 12 px captions carrying rules sit at 1.9-3.1:1. Cheapest fix: one shared caption colour (slate-500 → slate-300) | G | waits-jakob | — |
| 68 | Med | "Fix at the Factory (Spacecraft)" under each red/yellow Go/No-Go row is 12 px at 2.8:1; make it the brightest line, ideally a button to that building | G | waits-jakob | — |
| 69 | Low | Visited steps in the sidebar are struck through in dim grey (3.25:1) | G | waits-jakob | — |

## Sound (C3)

PR #24 adds music on the base (Kamel's theme.mp3) and a mute button. The five flight cues (launch, event, capture, success, failure) are wired up but silent, because no sound-effect files exist yet.
