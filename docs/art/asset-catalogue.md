# Catalogue art: every choice as a card and a piece of hardware

Prepared for the next version of the game, where picking parts, orbits, rides and ground
stations should feel like a game instead of a list. Everything below is in the repo and
checked by `src/assets/manifest.test.ts`. Browse it all at `/catalogue-lab.html` (dev server).

## What exists

| Asset | Count | Where | Made by |
|---|---|---|---|
| 3D model per part, ground station and launch vehicle | 29 | `public/assets/models/parts/<id>.glb` | `scripts/assets/models/parts/*.ts` (procedural, `pnpm assets:models`) |
| Portrait per model (512 px, transparent) | 29 | `public/assets/img/portraits/<id>.webp` | `pnpm assets:portraits` (studio in `portrait-lab.html`) |
| Painted card per orbit, transfer, ride, ground station, difficulty | 14 | `public/assets/img/cards/<id>.webp` | ElevenLabs image, prompts in `assets-src/concepts/cards.prompt.md` |
| Pick sound per category, hover, card flip, "doesn't fit" | 13 | `public/assets/audio/sfx/` | ElevenLabs sound effects (`pnpm assets:audio`) |

Models follow `scripts/assets/models/kit.ts`: real sizes (1 unit = 1 m, 1U = 10 cm), +Y up,
+Z forward, resting on y = 0, moving parts under `pivot_<name>` with `userData.stowed`.
The wings, dishes and whip antennas fold, so the Factory can unfold them when picked.

## Using it

- `choiceArt(id)` (`src/assets/catalogueArt.ts`): for any catalogue id (`prop-ion`,
  `orbit-halo`, `ride-lunar`, `ground-dsn`, `cadet`), its `model`, `portrait`, `card`,
  `accent` colour and `pick` sound.
- `<ChoiceCard>` (`src/ui/kit/ChoiceCard.tsx`): a choice as a game card. Pass `id`, `title`,
  `subtitle`, `stats`, `selected`, `disabled` + `reason`, `onPick`. It picks the art, colour
  and sounds itself; it is a real button (keyboard and screen readers work).
- 3D: `useModel(choiceArt(id).model!)` (`src/assets/models.ts`) gives a private copy of the
  part to place in a scene; rotate its `pivot_` nodes between `userData.stowed` and the
  exported pose to fold and unfold it.

## Known limits

- Portraits are framed to fill the card, so true size differences between parts do not show
  across cards (within a category the features carry the upgrade ladder). Show real sizes in
  the 3D scene, where all models share one scale.
- Rockets lean diagonally in their portraits; the UHF radio and the 84 W wings use a higher camera
  (`HINTS` in `src/assets/lab/portrait.tsx`).
- `radio-xband` is a flat reflectarray; the whole-craft `cubesat-6u` model still draws a parabolic dish.
- The Cadet card shows round blue badges that may read as an agency insignia.
