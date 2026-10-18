# Art pipeline

Every illustration in the app (avatars, game emblems, Werewolf roles, the Spanish deck, the UNO FLIP faces and the home emblem) is drawn here as code and rendered to HD WebP files in `assets/art/`.

- `avatars.mjs`, `badges.mjs`, `roles.mjs`, `cards.mjs`, `uno.mjs`, `hero.mjs`: the drawings (100×100 or 200×300 SVG).
- `mkit.mjs`: the drawing kit (expressive eyes, brows, mouths…).
- `cards.mjs` draws the traditional Moroccan deck (Spanish suits) with its own lines (`data-flat`); `glyphs.mjs` holds its serif index digits as outlines.
- `hand.js`: the "mascot" pass, run in Chromium: bold outlines, cel shading, sticker border.
- `build.mjs`: renders everything and converts it to WebP (needs Python 3 with Pillow).

```bash
cd tools/art
npm install && npx playwright install chromium
npm run build
```

Edit a drawing, run the build, and the app picks up the new images.
