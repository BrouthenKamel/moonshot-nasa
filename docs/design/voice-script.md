# Ice Hunters voice script: Flight Director Reyes

Mentor and CAPCOM. Warm, calm, a little dry humour, plain English for a 14-year-old, never condescending. Max two short sentences per line.

Voice: ElevenLabs **Geoffrey** (`vkK1T9IuJtW2TI3SYGaw`), model `eleven_v3`. Files: `public/assets/audio/voice/ih/<cue-id>.mp3`. Registered in `src/assets/manifest.ts`; play room lines with `sayRoom` from `src/assets/ihVoice.ts`, others with `audio.say('<cue-id>')`.

44 lines.

## Opening

| Cue id | Caption |
|---|---|
| `ih.open.crater` | Sunlight hasn't touched the floor of this crater in two billion years. We think there's ice down there. |
| `ih.open.mission` | Rookie, we need you to prove it. Build a small spacecraft, fly it, and find the water. |
| `ih.open.wake` | Rise and shine. Coffee's terrible, but the view is worth it. |
| `ih.open.name` | Tell me your name and pick your stripe color. Flight likes to know who's on the loop. |

## Campus nudges

| Cue id | Caption |
|---|---|
| `ih.campus.next` | Next stop is glowing on your map. Follow the lit-up door. |
| `ih.campus.locked` | That door's locked for now. Finish the room before it, and it'll open. |
| `ih.campus.cart` | Your CubeSat rides on that cart. Every room you finish, it gets a little more real. |

## Briefing Room

| Cue id | Caption |
|---|---|
| `ih.room.briefing.intro` | Welcome to the Briefing Room. Drag the Sun around the Moon and find the craters that never see daylight. |
| `ih.room.briefing.hint` | Look near the poles. If a crater stays dark all the way around, tag it. |
| `ih.room.briefing.success` | Three permanently shadowed craters. That's where the ice could hide. |

## Science Lab

| Cue id | Caption |
|---|---|
| `ih.room.science-lab.intro` | Science Lab. Pick up each instrument and aim it over the crater, and see what it can find. |
| `ih.room.science-lab.hint` | A camera needs light, and that crater's pitch black. Try an instrument that brings its own. |
| `ih.room.science-lab.success` | Nice work. Now you know what each instrument can really see, and what it costs in power. |

## Clean Room

| Cue id | Caption |
|---|---|
| `ih.room.clean-room.intro` | Clean Room, gloves on. Every part has a size and a weight, and the frame holds only six units. |
| `ih.room.clean-room.hint` | If a part won't fit, it really doesn't fit. Check the scale, and watch the power wires. |
| `ih.room.clean-room.success` | Packed tight and wired right. That's a spacecraft. |

## Thermal-Vac Chamber

| Cue id | Caption |
|---|---|
| `ih.room.thermal-vac.intro` | Thermal-Vac Chamber. We're about to put your craft through an orbit's worth of sunshine and shadow. |
| `ih.room.thermal-vac.hint` | In eclipse, the battery does all the work. Switch off what you don't need. |
| `ih.room.thermal-vac.success` | It survived the dark. Better here than up there, right? |

## Flight Dynamics

| Cue id | Caption |
|---|---|
| `ih.room.flight-dynamics.intro` | Flight Dynamics. Shape the orbit, and watch how much of the pole you can cover. |
| `ih.room.flight-dynamics.hint` | Low orbits see more detail but burn more fuel. Higher orbits are gentler, but they see less. |
| `ih.room.flight-dynamics.success` | Orbit locked in. Now the Moon will come to you. |

## Ground Station

| Cue id | Caption |
|---|---|
| `ih.room.ground-station.intro` | Ground Station. Your craft is a tiny dot, so keep the dish pointed right at it. |
| `ih.room.ground-station.hint` | Stay on the blip. The tape only fills while you're locked on. |
| `ih.room.ground-station.success` | Strong signal, full tape. Home will hear every word. |

## Launch Hangar

| Cue id | Caption |
|---|---|
| `ih.room.launch-hangar.intro` | Launch Hangar. Rockets leave on their own schedule, so pick a ride you can actually catch. |
| `ih.room.launch-hangar.hint` | Check the weight and the date. Miss either one, and you wait. |
| `ih.room.launch-hangar.success` | You're on the manifest. Your CubeSat has a seat. |

## Mission Control

| Cue id | Caption |
|---|---|
| `ih.room.mission-control.intro` | Mission Control. Four consoles, four go or no-go calls, and you're the Launch Director. |
| `ih.room.mission-control.hint` | A red console can't say go. Walk over and I'll show you what to fix. |
| `ih.room.mission-control.success` | All stations are go. Hands on the launch key. |

## Launch

| Cue id | Caption |
|---|---|
| `ih.launch.poll` | All stations, this is Flight. Give me a go or no-go for launch. |
| `ih.launch.hold` | Wind's picking up. We can hold a day, or press on and take the risk. Your call. |
| `ih.launch.countdown` | T-minus ten. Hold the key down. Let go, and we scrub. |
| `ih.launch.liftoff` | Ignition, and liftoff! Go get that ice. |
| `ih.launch.deploy` | Fairing's open. Your CubeSat is free, and the solar wings are unfolding. |
| `ih.launch.hello` | We have a signal. That little beep is your spacecraft saying hello. |

## Flight

| Cue id | Caption |
|---|---|
| `ih.flight.burn` | Burn window's coming up. Hold to fire, and let go inside the green. |
| `ih.flight.eclipse` | Long eclipse ahead. Same drill as the chamber, so protect that battery. |
| `ih.flight.lost-signal` | We've lost signal. Remember the Ground Station, and steady on the dish. |
| `ih.flight.first-ice` | Look at that. First ice detected. Two billion years in the dark, and you found it. |

## Debrief

| Cue id | Caption |
|---|---|
| `ih.debrief.success` | Mission accomplished. You mapped the ice, and the whole team is proud of you. |
| `ih.debrief.partial` | Not everything we hoped for, but real data came home. Fix one room, and fly again. |
| `ih.debrief.fail` | We lost her. Every agency has, and the best engineers learn from it and rebuild. |
