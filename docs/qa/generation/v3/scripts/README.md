# v3 generation harnesses

Reproduces the twelve concept screenshots and the five editor→published parity
runs recorded in this folder (`../*-concept-*.png`, `../parity/`).

## Prerequisites

- `bun run dev` running on port 8795.
- The five fixture projects present in the local Wrangler D1 database.
  `apps.json` holds their tokens and the tagline each parity run types in.
  Tokens come from the local dev database; a fresh import creates a new token,
  so re-import and update `apps.json` if these projects are missing.
- Playwright's Chromium:

```sh
cd docs/qa/generation/v3/scripts
bun install
bunx playwright install chromium
```

## Concept captures

Preview-only: `?concept=<direction>` plus an axis preset renders a seeded
composition and saves nothing.

```sh
node capture-concepts.cjs                       # writes ../*-concept-{1,2,3}.png
CONCEPT_OUT=/tmp/concepts node capture-concepts.cjs
```

Each entry is captured at 390×844 with `window.innerWidth/Height` printed so a
wrong viewport is visible in the run log.

## Parity runs

Drives the real editor: retype the tagline, upload and apply a photo, move a
block, hide a block, wait for the save, reload, then compare the published app.
Every assertion must be true for the app to count as passing.

```sh
bun owner-sessions.mjs          # mints local owner sessions into $TMPDIR
node parity.cjs                 # writes ../parity/*.png and parity-results.json
```

`PARITY_OUT`, `PARITY_UPLOAD` and `PARITY_COOKIES` override the output folder,
the uploaded image (defaults to `../buttertales-concept-2.png`) and the cookie
file.

The run mutates these fixture projects, so the committed screenshots are the
record of the accepted run rather than something a re-run reproduces byte for
byte. `sampleOnly` in `apps.json` lists sections whose content is entirely
sample data: they render nothing publicly, so they are excluded from the
expected published order instead of failing the check.
