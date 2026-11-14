# Lunar Mapper 6U CubeSat kit

51 GLB parts for a clean-room assembly scene of a 6U lunar-mapper CubeSat and its launch integration. Includes an assembled reference build, an explode/deploy demo and a checker. One script (`build_spacecraft_kit.py`) regenerates everything in about 8 seconds.

Designs are generic. Inspiration came from Lunar IceCube, LunaH-Map, Lunar Flashlight, CAPSTONE, the Iris transponder, the BIT-3 iodine thruster, small reaction wheels and star trackers. There are no logos, brand names or readable text anywhere.

## Files

| file | what |
|---|---|
| `*.glb` | 51 parts, glTF 2.0 binary, PBR metallic-roughness, no Draco, no external files |
| `parts.json` | per part: id, label, tier, subsystem, origin, size, bounds, triangles, bytes, mount points, animation hooks |
| `assembly_6u.json` | reference build: position + Euler rotation per instance, explode direction + distance, hidden nodes |
| `assembly_demo.html` / `gallery.html` | three.js viewer (same page, two modes): explode slider, deploy slider, spin wheels, envelope box / per-part inspector |
| `contact_sheet.png`, `renders/` | hero renders of every part + assembly screenshots (stowed, no panels, exploded, deployed) |
| `checker_output.txt` | output of `check_kit.py` on this exact kit (RESULT: PASS) |
| `build_spacecraft_kit.py` | regenerates all GLBs + JSON. `pip install trimesh numpy scipy shapely mapbox-earcut manifold3d pillow` |
| `check_kit.py` | budgets, envelope, interpenetration > 1 mm, visible z-fighting. Exit code 1 on failure |
| `render_kit.py`, `make_contact_sheet.py` | headless multi-angle renders (Playwright + Chrome + three.js) and the contact sheet |

The HTML pages fetch the GLBs, so serve the folder over HTTP (for example `python3 -m http.server`) rather than opening the file directly.

## Conventions

- **Units:** 1 unit = 1 m. Y up, +Z = instrument end, -Z = engine end.
- **6U envelope:** 0.2263 x 0.100 x 0.366 m, centred on the origin. Rails sit in the four X/Y corners. The ±Y face panels are inset 8 mm so the stowed wings fit inside the envelope.
- **Origins:** each part's origin is its natural mounting point; the text is in `parts.json` under `origin`. Empty nodes named `mount_*` mark attachment points: rail ends, stack sockets, harness connectors, deployer footprints, the stand cradle, sling ends and so on.
- **Deployables** export in the DEPLOYED pose. A hinge node carries `extras.stowed = [x, y, z]`: the node's local Euler rotation (XYZ, radians) in the stowed pose. The exported rotation is the deployed one.
  - wings: `hinge_1..3`, accordion fold
  - UHF tapes: `element_a/b`
  - dish: `arm_hinge`
  - deployer door: `door`
  - case lid, laptop lid, witness cover: `lid` / `cover`

  The closed deployer's door also carries `extras.deployed`.
- **Non-rotational moves** use translation extras: `released_offset_m` (switch and spring plungers), `removed_offset_m` (RBF pin), `stowed_z_m` / `deployed_z_m` (deployer pusher plate).
- **Animation hooks:**
  - `spin_*` pivots spin about local +Y: `spin_wheel` and `spin_x/y/z` in the cluster.
  - Reserved materials: `led_glow`, `ion_glow` (grid plasma + neutralizer), `laser_emitter`, `iodine` (crystals under the tank's sight window).
  - The wheel housings have removable `cover_*` nodes so the rotors can be shown.
- **Colour:** no cyan or teal anywhere. Subsystem accents are small anodised bands: avionics green, power red, attitude orange, propulsion yellow, payload violet, comms blue, thermal gold.

## Reference build (assembly_6u.json)

The reference build has 28 instances:
- **Left bay:** narrow-angle camera at the front, avionics stack (backplane, EPS, OBC, transceiver), battery on the second socket, magnetorquers, IMU.
- **Right bay:** IR spectrometer at the front, reaction-wheel cluster over the Iris-style transponder, star tracker looking out of +X, iodine ion engine firing through the -Z end frame.
- **Between the bays:** a harness channel with three braided bundles from the backplane micro-Ds to the PPU, transponder, spectrometer and camera.
- **Outside:**
  - two 3-panel wings stowed on ±Y (the -Y one is the mirror-stacked variant, so both arrays face +Y when deployed)
  - the -X radiator replacing `panel_nx`, with the UHF dipole stowed along it
  - S-band patch and sun sensor on +X
  - RBF/umbilical access port on -Z
  - deployment switches and separation springs in the rail ends

Checks run in the **stowed** pose. Deepest contact between any two instances is 0.09 mm; nothing pokes outside the envelope.

## Parts

| tier | id | label | size mm | tris | KB | origin |
|---|---|---|---|---|---|---|
| T1 | `frame_6u` | 6U frame: hard-anodised rails, rail ends, end frames, panel flanges, tie-rods | 226 x 100 x 366 | 9,960 | 350 | geometric centre of the 6U envelope |
| T1 | `face_panels` | Removable face panels (+-X, +-Y, +-Z) with apertures and fasteners | 215 x 86 x 354 | 14,060 | 455 | geometric centre of the 6U envelope; one child node per panel (local +Y = outward) |
| T1 | `deploy_switch` | Rail-end deployment (separation) switch, plunger shown depressed | 5 x 5 x 9 | 528 | 20 | centre of the rail-end face, plunger axis = +Z (outward) |
| T1 | `separation_spring` | Rail-end separation spring plunger | 5 x 5 x 9 | 1,632 | 50 | centre of the rail-end face, push axis = +Z (outward) |
| T1 | `fasteners_kit` | Standoffs and fasteners kit in a sorting tray | 140 x 17 x 90 | 5,680 | 226 | tray bottom centre |
| T1 | `obc_board` | On-board computer (PC/104): rad-tolerant SoC, memories, oscillator, debug connector | 90 x 26 x 96 | 4,720 | 299 | board bottom face centre; stack pitch 15.24 mm along +Y |
| T1 | `eps_board` | Electrical power system board (PC/104): MPPT converters, toroids, MOSFETs, array terminals | 90 x 30 x 96 | 8,908 | 495 | board bottom face centre; stack pitch 15.24 mm along +Y |
| T1 | `battery_pack` | Battery pack: 4 x 18650 Li-ion cells in a machined holder, protection board, heater | 92 x 39 x 96 | 7,796 | 390 | carrier board bottom face centre; plugs into the stack like a PC/104 board |
| T1 | `transceiver_board` | UHF/S-band transceiver board (PC/104): RF shield cans, SMA jacks, coax pigtails | 90 x 27 x 96 | 6,648 | 370 | board bottom face centre; stack pitch 15.24 mm along +Y |
| T1 | `backplane` | Avionics backplane / motherboard: two stack sockets, harness micro-D connectors | 92 x 14 x 200 | 6,684 | 346 | board bottom face centre; stack A centre at z=+0.012, stack B at z=-0.088 (board frame) |
| T1 | `transponder` | Iris-style deep-space X-band transponder: stacked slices, SMA ports, micro-D, thermal fins | 86 x 40 x 105 | 4,248 | 196 | base flange centre (bottom face) |
| T1 | `reaction_wheel` | Single reaction wheel in housing (rotor on spin pivot, removable cover) | 56 x 27 x 50 | 4,660 | 160 | base flange bottom centre; spin axis +Y |
| T1 | `rw_cluster` | 3-axis reaction-wheel cluster on a machined bracket with drive electronics | 64 x 36 x 64 | 10,128 | 440 | bracket base bottom centre; wheels spin about part X, Y, Z |
| T1 | `star_tracker` | Star tracker: electronics housing, lens, conical baffle with internal vanes | 45 x 74 x 31 | 4,380 | 154 | mounting face centre; boresight +Y |
| T1 | `sun_sensor` | Fine sun sensor: quadrant photodiode under a pinhole mask, gold housing | 22 x 18 x 28 | 476 | 24 | mounting face centre; boresight +Y |
| T1 | `magnetorquer_set` | Magnetorquer set: two ferrite-core torque rods + air-core coil on a bracket | 80 x 14 x 80 | 7,940 | 207 | bracket base bottom centre |
| T1 | `imu_box` | Inertial measurement unit: machined black housing, flanges, micro-D | 42 x 20 x 33 | 1,428 | 65 | base flange bottom centre |
| T1 | `narrow_angle_camera` | Narrow-angle camera: detector housing with fins, 5-element lens stack, focus ring, sunshade | 57 x 58 x 120 | 9,240 | 315 | optical axis at rear face of detector housing; boresight +Z |
| T1 | `ir_spectrometer` | IR point spectrometer: gold optical bench, square telescope baffle, Stirling cryocooler | 90 x 62 x 111 | 8,668 | 391 | optical axis at rear face of the bench; boresight +Z |
| T1 | `laser_reflectometer` | Laser reflectometer: central receiver telescope with spider, ring of four emitters | 90 x 90 x 68 | 5,328 | 184 | rear mounting plate centre; boresight +Z |
| T1 | `neutron_spectrometer` | Neutron spectrometer: 2x4 bank of scintillator tubes with PMT bases + electronics box | 84 x 60 x 106 | 7,660 | 254 | electronics box bottom centre |
| T1 | `cold_gas_module` | Cold-gas propulsion module: two spherical Ti tanks, manifold, 4 valves, 4 canted nozzles | 96 x 52 x 106 | 14,036 | 421 | base plate bottom centre; nozzles fire toward -Z |
| T1 | `green_monoprop_module` | Green-monopropellant module: propellant tank, He pressurant COPV, latch valve, fill ports, 1 N thruster | 90 x 60 x 171 | 10,464 | 324 | base plate bottom centre; thruster fires toward -Z |
| T1 | `ion_engine` | Iodine ion engine module (BIT-3 style): iodine tank with sight window, finned PPU, RF thruster head with grid, neutralizer | 97 x 74 x 125 | 12,188 | 507 | thruster axis at the -Z end-frame inner face; module extends +Z, thrust exhaust -Z |
| T1 | `solar_wing` | Deployable solar wing: 3 hinged panels of triple-junction cells, spring hinges, burn-wire hold-downs | 776 x 9 x 330 | 7,356 | 301 | root hinge axis (Z) at panel mid-thickness; deployed panels extend +X, cells face +Y; stows toward +Y |
| T1 | `solar_wing_mirror` | Deployable solar wing, mirror-stacked variant (stows toward -Y, cells still face +Y deployed) | 776 x 9 x 330 | 7,356 | 301 | root hinge axis (Z) at panel mid-thickness; deployed panels extend +X, cells face +Y; stows toward -Y |
| T1 | `patch_antenna` | S-band patch antenna: ceramic patch on ground plane, SMA feed | 50 x 14 x 50 | 960 | 43 | ground-plane back face centre; boresight +Y |
| T1 | `dish_antenna` | Deployable X-band dish (150 mm): ribbed reflector, gold feed horn on struts, hinge arm | 152 x 130 x 152 | 6,188 | 188 | hinge base mounting face centre; dish deployed facing +Y |
| T1 | `uhf_antenna` | Deployable UHF dipole: tape-spring elements with burn-wire release, stowed flat along the panel | 376 x 16 x 22 | 812 | 45 | mounting face centre; local +Y outward, elements deploy along +-X |
| T1 | `mli_blanket` | MLI blanket: crinkled aluminised-Kapton outer layer, sewn binding, Velcro tabs, grounding strap | 106 x 95 x 134 | 12,556 | 347 | inside bottom-front corner of the blanket (wraps a 95 x 80 x 130 mm box) |
| T1 | `radiator_panel` | Radiator panel (-X face): white-painted area, UHF mount, inner copper heat straps and heaters | 83 x 10 x 351 | 3,640 | 152 | panel inner-face centre (same frame as face_panels/panel_nx); local +Y outward |
| T1 | `heater_pads` | Kapton film heaters (set of 3) with lead wires and connectors, on a release liner | 110 x 4 x 86 | 884 | 50 | release-liner bottom centre |
| T1 | `access_port_rbf` | Access port: remove-before-flight inhibit pin socket + umbilical charge/test connector | 32 x 20 x 32 | 1,688 | 66 | outer face of the -Z panel at the port cutout centre; local +Y = outward |
| T1 | `harness` | Spacecraft harness: braided bundles with micro-D plugs, backshells, lacing ties (built for assembly_6u) | 85 x 44 x 252 | 4,904 | 164 | spacecraft centre (same frame as frame_6u); routes match assembly_6u.json |
| T2 | `deployer_6u_closed` | 6U CubeSat deployer, door closed, pusher spring compressed | 274 x 128 x 427 | 10,688 | 459 | centre of the 6U payload volume (drop the CubeSat at the origin) |
| T2 | `deployer_6u_open` | 6U CubeSat deployer, door open (deployed pose), pusher plate ejected | 363 x 128 x 659 | 10,688 | 459 | centre of the 6U payload volume (drop the CubeSat at the origin) |
| T2 | `separation_ring` | Motorised separation ring (15-inch class): upper/lower rings, latch housings, springs, connectors | 416 x 75 x 416 | 9,336 | 364 | separation plane centre; ring axis +Y |
| T2 | `payload_adapter_plate` | Payload adapter plate: isogrid-machined aluminium, two deployer footprints, LV bolt pattern | 560 x 37 x 420 | 10,220 | 420 | top surface centre; deployer footprints at mount_deployer_a/b |
| T2 | `fairing_half` | Payload fairing half (1.2 m class), cutaway: composite shell, acoustic blankets, frangible rails | 1225 x 2105 x 611 | 9,464 | 312 | base of the fairing on the split plane, axis +Y; half occupies z >= 0 |
| T2 | `lv_mount_plate` | Launch-vehicle mounting plate: round machined plate with radial ribs, bolt circle and harness brackets | 900 x 105 x 900 | 9,372 | 365 | top surface centre; LV interface on the underside |
| T3 | `assembly_stand` | Rotation assembly stand: levelling base, uprights, rotating cradle clamping the 6U rails, handwheel, lock pin | 832 x 657 x 782 | 8,072 | 270 | floor centre; spacecraft centre at mount_spacecraft (0, 0.55, 0), CubeSat Z along stand Z |
| T3 | `crane_hook` | Overhead crane hook block with swivel hook, safety latch, 4-leg round-sling set and shackles | 600 x 1784 x 440 | 5,028 | 146 | hook load point (bowl of the hook); sling ends at mount_load_* |
| T3 | `esd_workbench` | ESD workbench: steel frame, laminate top, blue ESD mat with ground snap and wrist strap, shelf, light bar | 1500 x 1630 x 896 | 6,524 | 216 | floor centre; work surface at y = 0.90 |
| T3 | `torque_wrench` | 1/4-inch click torque wrench: ratchet head, knurled grip, scale window (no markings), lock knob | 310 x 26 x 30 | 3,184 | 100 | square-drive centre; handle along +X |
| T3 | `screwdriver` | Precision ESD hex driver: dissipative handle with swivel cap, chrome shaft, hex tip | 19 x 158 x 19 | 1,328 | 33 | tip point; handle along +Y |
| T3 | `shipping_container` | Rugged shipping container: shell, hinged lid (opens), latches, wheels, purge valve, foam with 6U cut-out | 828 x 758 x 697 | 3,112 | 94 | floor centre under the case; lid hinge along X at the back top edge |
| T3 | `flight_covers` | Non-flight protective covers (red): camera cap, IR aperture cover, thruster cap, star-tracker cap | 191 x 73 x 367 | 2,056 | 67 | spacecraft centre (same frame as assembly_6u); each cover is a node at its instrument |
| T3 | `rbf_tag` | Remove-before-flight streamer (red, no text) with grommet, split ring, lanyard and T-handle pin | 96 x 431 x 52 | 1,428 | 43 | split-ring centre (attach point); streamer hangs toward -Y |
| T3 | `laptop_cart` | Test laptop on a two-shelf cart with GSE power supply and cables | 653 x 1103 x 548 | 7,608 | 350 | floor centre under the cart |
| T3 | `witness_plate` | Particle fall-out witness plate: polished wafer on a stand with a hinged clear cover | 120 x 246 x 130 | 1,244 | 41 | stand base centre |
| T3 | `gse_umbilical_cable` | GSE umbilical test cable: coiled lead with micro-D plug for the access port and a bench connector | 500 x 17 x 186 | 4,212 | 124 | centre of the coil lying on the bench |

## Parts I added beyond the minimum list (and why)

| part | reason |
|---|---|
| `solar_wing_mirror` | A rigid rotation of one wing can't put a second wing on -Y with its cells facing the same way as the +Y wing when deployed. This variant stacks toward -Y but keeps the cells on +Y. |
| `harness` | Built in spacecraft coordinates for this exact layout, with plugs that mate to the real connector positions. A generic harness would float. |
| `access_port_rbf` | Every flight CubeSat has an inhibit/RBF and charge/test access port. It gives the red RBF pin and the umbilical a real place on the spacecraft. |
| `witness_plate` | Particle fall-out witness plates are standard clean-room furniture next to open flight hardware. It instantly signals "clean room". |
| `gse_umbilical_cable` | Connects the laptop cart to the access port, so the test setup tells a story. |
| `fasteners_kit` (sorting tray) | The brief asked for a standoffs and fasteners kit; a sorting tray makes it a believable bench prop rather than loose screws. |
| `deployer_6u_open` / `_closed` as separate files | The open one is in the deployed pose (door open, pusher ejected); the closed one is the integration state. Both carry the door hinge extras. |

Also in the kit but not in the reference build, as alternative mission configurations: the single reaction wheel, cold-gas and green-monoprop modules, laser reflectometer, neutron spectrometer, deployable dish, MLI blanket and heater pads.

## Checker (check_kit.py)

1. **Budgets.** Each part is checked against 30,000 triangles and 600 KB; the whole kit against 12 MB. It also checks for Draco, external URIs and images over 1024 px.
2. **Envelope and interpenetration.** The assembly is posed stowed (`extras.stowed` applied, `hidden_nodes` removed). Every vertex must sit inside the envelope with zero tolerance. Each part is split into closed shells. Shell pairs whose bounds overlap by more than 1 mm on every axis are intersected with exact booleans (manifold3d); the check fails if any intersection's smallest extent exceeds 1 mm. A shell that isn't closed is replaced by its convex hull, which is conservative.
   - Negative test: moving the camera 10 mm into the avionics stack and the IMU through the +Y panel makes it FAIL, as expected.
3. **Visible z-fighting.** It looks for same-facing coplanar triangles from different shells that overlap by more than 0.5 mm² in their shared plane. A pair is only reported if BOTH faces are visible. A generalised winding-number probe 0.05 mm in front of each face throws out faces that rest against, or are buried inside, another solid. Result: 0.

## What I could not do at this quality, and why

- **The 600 KB per-part cap binds long before 30,000 triangles.** Core glTF stores 32-bit float positions and normals, plus UVs on textured materials, so a part tops out at about 16k triangles. I stayed in core glTF and did not use quantization or meshopt, so it loads anywhere. The cost:
  - cap screws, washers and nuts are 8-sided
  - thread forms are 6-sided
  - edges under 6 mm get a single chamfer instead of a fillet
  - passive component counts on boards were thinned

  The kit is 11.90 MB against the 12 MB cap, so there is little headroom for more detail without quantization.
- **No true anisotropic brushed metal, glass transmission or clear-coat.** Those need glTF extensions. Brushing is faked with a streaked roughness texture, glass is a dark low-roughness material with a violet AR tint, and the PCB is texture art on a flat skin (pads and traces are not geometry).
- **No readable markings.** Per the brief, there are no labels, scale numbers or connector IDs anywhere. Real hardware is covered in them, so close-ups look slightly too clean.
- **I could not see your existing `cubesat-6u.glb`.** It wasn't attached, so I inferred the `stowed` convention from the brief: local Euler XYZ in radians on the hinge node. Check it matches before merging. If yours stores it differently, it's one place in `build_wing`, `b_uhf`, `b_dish` and `build_deployer`.
- **Fit was verified, structural support was not.** Some internals hang in space with no bracket to the frame: the camera, IMU and magnetorquer bracket. A mechanical engineer would add brackets.
- **The wing hold-downs stay on the body when deployed.** The posts are body-mounted, so in the deployed part view they look like stray bits beside the root.
- **The fairing half is a simplified cutaway.** It has the shell, acoustic blanket bands, frangible rails, a door outline and vents, but no internal ring frames, venting ducts or ordnance detail.
- **No LODs, and no collision meshes beyond what the checker derives.**
- **Renders were checked in three.js only**, under room-environment lighting. Other engines will shade the same PBR values slightly differently.
