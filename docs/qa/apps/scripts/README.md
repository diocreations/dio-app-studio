# Application QA harness

Reproduces the customer-app and owner-dashboard results recorded one level up
(`app-test-results.json`, `dashboard-test-results.json`, the screenshots).

## Prerequisites

- `bun run dev` running on port 8795 with the five fixture projects in the local
  Wrangler D1 database. `fixtures.json` holds their tokens; a fresh import makes
  a new token, so re-import and update it if a project is missing.
- Playwright's Chromium:

```sh
cd docs/qa/apps/scripts
bun install
bunx playwright install chromium
```

## Run

```sh
bun docs/qa/apps/scripts/sessions.mjs       # mints local owner sessions
bun docs/qa/apps/scripts/repair-fixtures.mjs # repairs the fixture documents (idempotent)
bun docs/qa/apps/scripts/run-regression.mjs  # the five-app regression sweep
bun docs/qa/apps/scripts/run-editor.mjs      # the editor, driven as an owner drives it
node docs/qa/apps/scripts/run-apps.cjs      # customer app: screens, workflows, widths
node docs/qa/apps/scripts/run-dashboard.cjs # owner dashboard: tabs, records, settings
```

`repair-fixtures` is the versioned repair for state that only lives in the local
database: photographs of the app that were uploaded as business photography
while testing, sections left hidden by the visibility toggle, catalogue items
without a stable id, and feature blocks whose copy was copied instead of
referenced. It is idempotent — a second run reports no changes — and accepts
`--dry-run` to print the plan without writing. Run it after a fresh import so a
clean database produces the corrected fixtures.

`run-regression` is the acceptance sweep: business identity, catalogue and
prices, featured items, section visibility, offers, media ownership, stale
document data, invented copy, parity between the editor preview and the
published app, horizontal overflow at 320, 360, 375, 390, 430, 768 and 1280, and
a measured contrast pass. The contrast pass opens every tab of each app and
measures the colours the browser painted against the ground the text sits on:
4.5:1 for body text, 3:1 for large text and disabled controls, in both themes.
`--no-browser` runs only the data and HTML checks. Results land in
`docs/qa/apps/regression-results.json`.

`run-editor` drives the real editor in Chromium because the undo history lives
in the page: hide a component and undo it, drag one and undo it, duplicate and
delete, change a photograph fit, type quickly, break the network, reload inside
the save debounce. Every check then reads the document back from the server, so
a page that shows the right thing while the server holds something else fails.
It writes `docs/qa/apps/editor-results.json` and restores the fixture document
when it finishes. `ONLY=salon` runs it against another app.

Environment overrides: `BASE`, `APPS_OUT` (screenshot and JSON destination),
`QA_COOKIES` (session file), `ONLY` (comma-separated app keys for `run-apps`),
`PLATTR_DB` (the local D1 file).

## What the checks mean

- `run-apps` visits every tab destination, searches, opens a detail screen and
  saves it, completes checkout and booking and enquiry flows where the trade
  supports them, and checks the order survives a reload. It then loads home and
  catalogue at 320, 360, 375, 390, 430, 768 and 1280 and asserts there is no
  horizontal overflow. A scroll-width assertion says nothing about how a screen
  looks — review the screenshots for that.
- `run-regression` changes nothing: it reads the fixture database, fetches both
  rendered surfaces and measures every tab in a browser. Contrast is measured
  against the composited background the text sits on, text over photography is
  skipped rather than guessed at, and a badge sitting on a photograph is not
  counted as a theme defect.
- `run-editor` writes to the fixture document and restores it at the end; if a
  run is interrupted, `repair-fixtures` puts the document back.
- `run-dashboard` signs in as the owner, opens every tab, proves the records the
  customer workflows created are visible, then renames the business, confirms the
  customer app shows the new name, and restores it.

Both write JSON next to the screenshots, so a run is a document rather than a
console log. The runs create real orders, bookings and enquiries in the local
database; they are not read-only fixtures.
