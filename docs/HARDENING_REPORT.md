# Production hardening report

Scope: PLATTR production hardening and expansion preparation. No production
deployment was performed.

## Phase 1 — authentication and security

Implemented:

- Owner session model: random D1 session, project-scoped `HttpOnly` /
  `SameSite=Lax` / `Secure` cookie, 30-day absolute lifetime and 7-day idle
  expiry with throttled activity refresh.
- Customer/app link separation: `/p/:token` and `/p/:token/edit` redirect
  anonymous visitors to owner login; all `/api/projects/:token/*` routes are
  protected by one owner-session middleware. A customer app token cannot read
  the document API or write the catalogue.
- Revoke one session (sign out) or every session (sign out everywhere), with
  cookie clearing and activity entries.
- Audit trail for sign-in, sign-out, revoke-all, build creation, catalogue and
  settings changes, sample removal and order/booking/enquiry status changes.
- One business cannot read or mutate another business's records; cross-origin
  mutations return 403.
- Customer apps default to `noindex, nofollow`; indexing is an explicit owner
  opt-in. `/health` is disallowed in `robots.txt`.

Evidence: `docs/SECURITY.md`, `tests/private.test.ts`, `tests/business.test.ts`,
live checks below.

Live checks against `http://127.0.0.1:8795`, hotel build:

```text
app=200
edit-anon=303 http://127.0.0.1:8795/p/<token>/dashboard/login
doc-anon=401
edit-owner=200
doc-owner=200
review-owner=200
logout_all=303
after-logout-all=401
```

Remaining limitations: one shared owner key per project, no named accounts or
roles; all-or-nothing secret rotation; no per-session device list; CSRF relies on
origin checks plus `SameSite=Lax`; no CSP.

## Phase 2 — backup and disaster recovery

Implemented and rehearsed locally:

- `scripts/d1-backup.mjs`: SQLite online backup, integrity check, SHA-256 and
  table-count manifest, retention pruning.
- `scripts/d1-restore.mjs`: verifies backup, stages a copy, restores atomically.
- Local database restore into a separate target: 37 projects, 4 orders, 8
  bookings, 6 enquiries, 7 media records and 28 document versions all matched;
  integrity `ok`.
- Media snapshot and extraction: 21 blobs to 21 blobs, SHA-256 recorded.
- Documented strategy, retention, RPO/RTO and production restore procedure.

Evidence: `docs/BACKUP.md`.

Remaining limitations: no scheduled production export, offsite bucket or
cross-account replication was provisioned. The rehearsal is local, not a remote
production restore.

## Phase 3 — accessibility and device testing

Already completed in the preceding milestone:

- Pinch zoom restored; visible focus ring; Enter/Space activation; accessible
  names and alts; reduced-motion handling.
- Lighthouse accessibility 100 on all five flagship apps (mobile emulation).
- Width matrix at 320/375/390/430 with captures in `docs/qa/`.
- Touch targets: app-bar buttons are 38×38px; above the 24px WCAG 2.2 minimum
  but below the 44px recommendation. No overlap and no horizontal overflow.

Remaining limitation: no physical iOS or Android device, no VoiceOver/TalkBack
session and no full manual screen-reader audit. This is documented, not claimed.

## Phase 4 — deployment readiness

- `docs/DEPLOYMENT_CHECKLIST.md` covers secrets, migrations, backups, domain,
  SSL, cache, monitoring, rate limits, headers, rollback, health checks, demo
  credential leakage and indexing.
- `/health` returns `200 {"ok":true,"db":"up"}` with `Cache-Control: no-store`;
  it performs a real D1 query and returns 503 on failure.
- Security headers remain on every response; private paths keep noindex.
- Customer indexing is opt-in; preview and development settings cannot make a
  customer app indexable by inheritance.

Remaining limitations: no production environment, DNS/TLS setup, external error
sink, provider quota alerts or live rollback drill.

## Phase 5 — remaining 22 trades

`docs/TRADE_MIGRATION.md` audits all 22 remaining trades: features, catalogue
size, business-specific function, current generic document shape and missing
booking/ordering/enquiry capability. It defines the shared migration strategy,
compatibility gates and selects the next five: café, gym, clinic, property and
studio.

No remaining trade was migrated in this hardening pass; existing shells and data
were not rewritten. Batch 2 subsequently delivered café, gym, clinic, property
and studio on the same document model (`docs/BATCH2_REPORT.md`); seventeen
trades remain.

## Verification

- `bun run typecheck` — exit 0.
- `bun test` — 312 passed, 0 failed, 29 files, 3,793 assertions.
- `bun run build` — exit 0.
- Live anonymous/owner authorization checks, revoke-all, health and indexing
  toggle passed against the local Worker.
- Static asset sweep: 93 unique flagship images across the five apps, all 200.
  This fixed a production-relevant 500 caused by mutating immutable host asset
  headers in the security-header middleware.
- No production deploy or customer data change.

After batch 2, the same checks are: `bun test` 315 passed / 0 failed / 29 files
/ 4,178 assertions, typecheck and production build exit 0, and 85 distinct
image URL references across the ten flagship apps all returning 200.
