# Asset pipeline

Raw inputs live here. Optimized files the game ships live in `public/assets/`.
Every asset has one entry in `src/assets/manifest.ts`; game code only uses its id.

```
assets-src/models/   raw .glb (procedural output, Blender exports, Meshy/Tripo downloads, kit pieces)
assets-src/concepts/ concept images and prompts used as style references
assets-src/raw/      big originals (NASA TIFFs, .blend files), gitignored
public/assets/       optimized output, committed, served by Vite
```

## Add a 3D model (any source)

1. Export or download it as `.glb` into `assets-src/models/<name>.glb`.
   - 1 unit = 1 metre, +Y up, front faces +Z.
   - Optional parts: name the node `part_<partId>` (ids from `src/data/parts.ts`).
   - Moving parts: put them under an empty named `pivot_<name>` placed on the hinge,
     and export it in the deployed pose. Set its stowed rotation as custom property
     `stowed = [x, y, z]` (radians) in Blender ("Custom Properties" export as glTF extras).
   - Do not use `:` `.` `/` `[` `]` in node names: three.js strips them on load.
2. Add a manifest entry: `{ id: 'model.<name>', kind: 'model', src: '<name>.glb', file: 'models/<name>.glb', source, license, ai }`.
3. `pnpm assets:models --only model.<name>`: dedup, weld, WebP textures (max 1024 px), meshopt compression.
4. Check it at http://localhost:5173/asset-lab.html (parts toggle, pivot slider).
5. In game code: `const obj = useModel('model.<name>')`, `showParts(obj, design parts)`.

Procedural models are TypeScript in `scripts/assets/models/` and are rebuilt by the same command.

## Add audio

1. Add a manifest entry with `source: 'elevenlabs'`, a `prompt` and `durationSec`
   (voice lines also need `voiceId` and `caption`).
2. `pnpm assets:audio`: generates only the files that are missing (no credits spent twice).
   `--dry` lists what it would generate; `--only <id> --force` regenerates one.
3. In game code: `audio.playMusic('music.theme')`, `audio.play('sfx.click')`, `await audio.say('voice.go')`.

Needs `ELEVENLABS_API_KEY` in `.env` (gitignored). Never prefix keys with `VITE_`.

## Checks and credits

- `pnpm test` includes `src/assets/manifest.test.ts`: every file exists and fits its size budget
  (model 2 MB, music 4 MB, total 40 MB).
- `pnpm assets:credits` regenerates `CREDITS.md` (source, license, AI disclosure per asset).
