# Art and audio plan

Status: proposal, waiting for the new UI. Pipeline usage: `assets-src/README.md`.

## 3D: how assets get made

We follow whatever 3D method the new UI uses. The pipeline accepts any `.glb`, so the method only decides who makes the raw file:

| Route | Use for | Cost |
|---|---|---|
| Procedural TypeScript (`scripts/assets/models/`) | Spacecraft and anything built from parts the player picks; exact real dimensions; every variant as a `part_` node | Free; Claude writes it |
| Kit pieces (Kenney, Quaternius: CC0) | Base props: buildings, rockets, dishes, trees, people | Free |
| AI concept image (ElevenLabs) -> modelled by hand or procedurally | Style reference for anything new; keeps one look | ~190 credits an image |
| Image-to-3D (Meshy, Tripo) | Organic hero props only, if an API key works | Paid |

Procedural is the default for mission hardware: it stays true to the parts catalogue (validity),
can show any combination of parts, and costs nothing.

### Asset list (once the UI lands)

1. `model.cubesat-6u`: done (all parts, folding wings, dish). Next: decals, wire harness detail, material pass to match the UI palette.
2. `model.rocket`: rideshare launcher for the launch pad and the launch cutscene (procedural, stages as `part_` nodes).
3. `model.moon`: icosphere displaced by NASA LOLA elevation, flat-shaded, permanently shadowed regions as a mask texture for the ice reveal.
4. `model.earth`: stylized globe, Blue Marble colours quantised to the palette.
5. Ground station dish: animated `pivot_` for tracking.

## Music: direction

Reference feeling: Clair Obscur: Expedition 33. Romantic, painterly, French Belle Epoque melancholy with fantasy scale.
Instrumental only. One recurring four-note motif across all tracks, so the game feels scored rather than playlisted.

| Id | Where | Brief |
|---|---|---|
| `music.theme` | Title, agency base | Generated. Waltz in D minor, felt piano motif, solo cello, strings swell, solo violin climax |
| `music.atelier` | Clean room, design steps | Intimate: solo piano and celesta, harp, sparse, curious, loops cleanly |
| `music.departure` | Launch countdown and ascent | Low strings ostinato, timpani, building to full orchestra, motif in brass |
| `music.voyage` | Transfer and mapping | Wide, floating: string pads, harp arpeggios, distant piano motif, wordless feel |
| `stinger.success` | Report: success | Orchestra resolves the motif to major, 8 s |
| `stinger.failure` | Report: failed | Solo cello plays the motif descending, 8 s |

AI music cannot reuse an exact melody between tracks, so we describe the same motif and instrumentation in every prompt,
keep the key (D minor / F major) and tempo family (72 to 90 BPM), and pick takes that sound related.
