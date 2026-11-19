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
bun docs/qa/apps/scripts/sessions.mjs      # mints local owner sessions
node docs/qa/apps/scripts/run-apps.cjs     # customer app: screens, workflows, widths
node docs/qa/apps/scripts/run-dashboard.cjs # owner dashboard: tabs, records, settings
```

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
- `run-dashboard` signs in as the owner, opens every tab, proves the records the
  customer workflows created are visible, then renames the business, confirms the
  customer app shows the new name, and restores it.

Both write JSON next to the screenshots, so a run is a document rather than a
console log. The runs create real orders, bookings and enquiries in the local
database; they are not read-only fixtures.
