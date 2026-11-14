# Rocket parts (GLB)

19 low-poly parts in 6 slots. Every part follows the same attachment rules, so swapping is just "remove old, add new at the same spot".

Units: the core body radius is 1.0. Y is up.

| Slot | Origin | Position it at |
|---|---|---|
| engine_* | top center, hangs down | y = 0 |
| stage1_* (core) | bottom center | y = 0 |
| fins_*, boosters_* | same origin as stage1 | y = 0 |
| stage2_* (upper, optional) | bottom center | y = stage1.height |
| nose_* | bottom center | y = stage1.height + stage2.height (0 if no stage2) |

Heights are in parts.json. Works in Three.js / Babylon (GLTFLoader), Godot (drag in), Unity (glTFast package), Blender (File > Import > glTF).
build_parts.py regenerates everything (pip install trimesh mapbox-earcut shapely).
