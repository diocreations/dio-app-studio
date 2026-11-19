# Change map

`2768b74` bundled three unrelated things: the concept/parity generation work, the
payments subsystem and the platform subsystem. History is not rewritten. This map
records where each concern actually lives so a future review can find it, and
lists what was committed afterwards to close the gap.

## Generation (concept + parity)

- `src/worker/doc.ts`, `src/worker/flagship.ts`, `src/worker/flagshipImages.ts`,
  `src/worker/appCss.ts`, `src/worker/app.ts` — the three concept designs and the
  document model they render.
- `docs/qa/generation/v3/` — concepts captured per business, parity screenshots
  and `scripts/` (`apps.json`, `capture-concepts.cjs`, `parity.cjs`,
  `owner-sessions.mjs`).

## Payments

- `src/worker/payments/` (1785 lines), `src/worker/views/payments.ts`,
  `tests/payments.test.ts` (1493 lines).
- `docs/PAYMENTS.md`, `docs/PAYMENTS_*` plans, `.env.example`,
  `package.json` `migrate:platform` script.
- Provider state: no live or test-mode Razorpay/Stripe transaction has been
  completed in this repository. Every app currently has 0 gateway connections.

## Platform

- `src/worker/platform/` (2095 lines), `src/worker/views/dashboard.ts`,
  `tests/platform.test.ts` (911 lines), `docs/PLATFORM*`.

## Import fidelity (this milestone)

- `src/worker/importImages.ts` — image evidence gate, WebP renditions, report.
- `src/worker/importer.ts` — visible-markup prices, menu cleaning, quality report.
- `src/worker/reimport.ts` — diff and approval; no silent writes.
- `src/worker/index.ts` — `/api/import` report fields, `/import/check`,
  `/import/apply`.
- `src/worker/views/dashboard.ts` — import report panel and update review.
- `tests/importer.test.ts`, `tests/marketplace.test.ts`, `tests/reimport.test.ts`.

## QA

- `docs/qa/apps/` — screenshots at every supported width, machine-readable
  results, and `scripts/` (fixtures, sessions, app/dashboard/width harnesses).
- `docs/qa/import-fidelity/` — before/after import reports and screenshots.

## Documentation and migrations

- `README.md`, `docs/PAYMENTS.md`, `docs/PLATFORM*`, `.env.example`,
  `package.json` — committed alongside this map rather than left as local edits.
- Removed `docs/qa/generation/v3/bt-c1..3.png`: byte-identical duplicates of the
  committed ButterTales concept screenshots.
