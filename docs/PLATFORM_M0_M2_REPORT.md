# Plattr platform — M0–M2 delivery and acceptance evidence

**Date:** 19 November 2026
**Scope:** M0 (flags, migration preparation), M1 (additive schema), M2 (organisation
backfill). M3 and later are **not** started.
**Environment:** local Worker + local Miniflare D1 + local R2 (`plattr-media`).
**Deployment:** none. `git` state unchanged — nothing committed, pushed or deployed.
**Billing:** dark. `billing.enabled` is unset, so every billing path resolves to
"disabled"; no provider credentials exist in this environment.

Every run artefact cited below is stored under `docs/qa/platform-m0-m2/` (counts and
SHA-256 digests only — no customer rows, no credentials). The database backup itself
lives in `.wrangler/backups/platform-m0-m2-run/`, which is gitignored.

---

## 1. What shipped

### M0 — flags and preparation

| Item | Where |
| --- | --- |
| Flag parser, all flags off by default, unknown names ignored | `src/worker/platform/flags.ts` |
| `PLATFORM_FLAGS` binding | `src/worker/index.ts` (`Bindings`) |
| Documented binding | `.env.example` |
| Migration / rollback runner with backup and evidence commands | `scripts/platform-migrate.ts`, `bun run migrate:platform` |
| Backup, restore rehearsal, rollback rehearsal | this document, §5 |

Flags: `accounts.enabled`, `billing.enabled`, `admin.enabled`. Unset = all off.
Format `PLATFORM_FLAGS=accounts.enabled=1,billing.enabled=0`. Only explicit truthy
values enable a flag; a typo cannot turn one on. No route reads a flag yet, so
today's behaviour is unchanged by construction, and the flag can be flipped without a
database write or a code deploy.

### M1 — additive schema

`src/worker/platform/schema.ts` creates 17 tables and extends `projects` with two
defaulted columns. It runs inside the existing `ensureSchema` after the legacy
statements, uses `IF NOT EXISTS` throughout, and treats a duplicate-column error as
"already applied", matching the pattern already used for `projects` migrations.

Tables: `users`, `user_sessions`, `auth_tokens`, `organizations`, `memberships`,
`invitations`, `project_claims`, `ownership_transfers`, `plans`, `plan_limits`,
`subscriptions`, `subscription_changes`, `platform_invoices`,
`platform_billing_events`, `operator_roles`, `audit_events`, `usage_events`.
Columns: `projects.org_id`, `projects.created_by` (both `NOT NULL DEFAULT ''`).

Invariants carried over from the approved design, and now implemented:

- `subscriptions_one_live_per_org` is a **partial** unique index
  (`WHERE status IN ('trialing','active','past_due','grace')`). One row per contract;
  any number of closed rows, so upgrades, cancellations and re-subscriptions keep
  their own period and plan version.
- `subscription_changes` is append-only, with a partial unique index on
  `provider_event_id` so a replayed webhook cannot duplicate a plan move.
- `platform_invoices` is keyed by `org_id` and keeps pointing at the contract that was
  live when it was issued; superseding a contract never rewrites it. It has a partial
  unique index on `(provider, provider_invoice_id)` (added in implementation so
  invoice mirroring is idempotent — see §7 for the one-line delta from the sketch).
- `project_claims_one_open` allows at most one open claim per project
  (`pending_email`, `pending_review`, `disputed`).
- `ownership_transfers` is the immutable evidence trail; reversals set
  `reversed_at`/`reversal_reason` and never delete the row.
- Foreign keys are declared on the new tables (memberships, sessions, tokens, claims,
  transfers, subscriptions, changes, invoices, usage, operator roles). No existing
  table was rewritten.

### M2 — backfill

`src/worker/platform/backfill.ts` creates one synthetic organisation per project:

- id `org_<project token>`, slug `app-<project token>` — derived from the immutable
  token, so re-runs, partial failures and restored backups converge on the same rows;
- `claim_status = 'unclaimed'`, `claimed_at = ''`;
- `projects.org_id` set; **no user, membership, invitation, claim, transfer or
  subscription is created**;
- one `audit_events` row per created organisation (`backfill.organization_created`,
  actor `system`), never per re-run;
- batched (`LIMIT 100` per pass), and re-runnable: a project created after the first
  run is picked up by the next run until M3 closes public creation.

One behaviour change, deliberate: `deleteProject` now removes the project's synthetic
organisation when it is still unclaimed and holds no members, billing or transfers,
so the backfill cannot create a new class of orphan. Existing project cleanup is
otherwise unchanged.

---

## 2. Before / after row counts

Snapshot before: `docs/qa/platform-m0-m2/before.json`
Snapshot after M1+M2: `docs/qa/platform-m0-m2/after.json`
Comparison: `bun run migrate:platform compare --before … --after …`

| Table | Before | After |
| --- | ---: | ---: |
| projects | 47 | 47 |
| notes | 2 | 2 |
| activity | 343 | 343 |
| doc_versions | 45 | 45 |
| media | 7 | 7 |
| customers | 34 | 34 |
| orders | 13 | 13 |
| order_items | 16 | 16 |
| bookings | 19 | 19 |
| enquiries | 13 | 13 |
| payment_connections | 1 | 1 |
| payment_settings | 1 | 1 |
| payment_transactions | 1 | 1 |
| payment_events | 0 | 0 |
| notifications | 74 | 74 |
| owner_sessions | 17 | 17 |
| variation_counter | 1 | 1 |
| import_budget | 0 | 0 |
| daily_budget | 14 | 14 |

`countChanges: []`, `digestChanges: []`, `preserved: true`.
Combined content digest identical before and after:
`2172dd4b5f5da4061e9278c9001c249e5098cebbc2efac0d0195bcf3e454ea59`.

The digest covers every business column of every preserved table (projects, notes,
activity, doc versions, media, customers, orders, order items, bookings, enquiries,
connection/settings/transactions/events). For `projects` it deliberately excludes
`org_id` and `created_by` — the only two columns M1/M2 are allowed to write. Project
ids, tokens, `spec`, `doc`, quotes and statuses therefore hash identically.

---

## 3. Backfill reconciliation

`docs/qa/platform-m0-m2/backfill.json`

```json
{
  "projects": 47, "linkedProjects": 47, "unlinkedProjects": 0,
  "createdOrganizations": 47, "linkedNow": 47, "alreadyLinked": 0,
  "invalidProjects": 0, "batches": 1,
  "organizations": 47, "syntheticOrganizations": 47, "syntheticUnclaimed": 47,
  "orphanOrganizations": 0, "projectsWithUnknownOrg": 0,
  "users": 0, "memberships": 0, "invitations": 0,
  "claims": 0, "transfers": 0, "subscriptions": 0,
  "ok": true
}
```

- 47/47 projects linked, one organisation each, all still `unclaimed`.
- No owner was invented: users, memberships, invitations, claims, transfers and
  subscriptions are all zero.
- A second run is a no-op (unit test `is idempotent and can pick up projects created
  after the first run`): `createdOrganizations: 0`, `linkedNow: 0`.

---

## 4. D1 integrity checks

`docs/qa/platform-m0-m2/verify.json` — `ok: true`

| Check | Result |
| --- | --- |
| `PRAGMA integrity_check` | `ok` |
| `PRAGMA foreign_key_check` | 0 violations |
| Platform tables + project columns | 17 tables, `org_id` + `created_by` present |
| Required unique indexes | all 6 present (`subscriptions_one_live_per_org`, `subscriptions_by_provider`, `subscription_changes_by_event`, `project_claims_one_open`, `platform_invoices_by_provider`, `projects_by_org`) |
| One live contract per org | 0 organisations with more than one |
| One open claim per project | 0 projects with more than one |
| M2 reconciliation | 47/47 linked, 47/47 unclaimed, no ownership rows |

---

## 5. Backup, restore and R2 preservation

### Backup (before any schema change)

`bun run migrate:platform backup --dir .wrangler/backups/platform-m0-m2-run`

- D1 database copied (`d1.sqlite`, plus `-wal`/`-shm` when present) **before** the
  schema step, into a gitignored directory.
- Manifest records counts, content digest and the R2 fingerprint:
  `docs/qa/platform-m0-m2/backup.json`.
- The copy was verified to contain **zero** platform tables and no `org_id` column,
  and its digest equals the live pre-migration snapshot
  (`combined` match: `true`) — i.e. the restore point is genuinely pre-M1.

### Restoration rehearsal

`bun run migrate:platform restore --from .wrangler/backups/platform-m0-m2-run --copy …`
(`docs/qa/platform-m0-m2/restore.json`)

| Gate | Result |
| --- | --- |
| Restored copy opens and passes `integrity_check` | `ok` |
| `foreign_key_check` | 0 violations |
| Row counts match the manifest | `true` |
| Content digest matches the manifest | `true` |
| R2 fingerprint matches | `true` (21 objects, 488,446 bytes) |
| Restored copy is a valid migration starting point | `apply` + `backfill` → 47/47 linked, `verify` `ok: true` (`restore-backfill.json`, `restore-verify.json`) |

### R2 object preservation

- 21 objects, 488,446 bytes, fingerprint
  `0472503f66f09b4fe90f208f1bdff2224e82e3f12eb3047035e118e1d9ef2c0e`.
- Identical before and after M1+M2 (`r2-after.json`): the migration never writes to
  R2.
- Runtime proof: `GET /p/<token>/media/<mediaId>/320.webp` returns `200 image/webp`
  with exactly 43,024 bytes, matching the `media.variants` row recorded before the
  migration.

---

## 6. Existing application regression (after migration, same database)

`docs/qa/platform-m0-m2/regression.json`, against the dev server on the migrated
local D1:

| Route | Result |
| --- | --- |
| `GET /` | 200 |
| `GET /p/:token` | 303 → `/dashboard/login` → 200 (unchanged entry behaviour) |
| `GET /p/:token/dashboard` (no cookie) | 303 → login, 200 |
| `GET /p/:token/dashboard` (owner session) | **200**, 50,725 bytes |
| `GET /p/:token/media/:id/320.webp` | **200 `image/webp`**, 43,024 bytes |
| `GET /p/:token/pay/:id` (hosted checkout) | **200**, 5,767 bytes |
| `GET /studio` without `STUDIO_KEY` | **401** (unchanged) |

Org rows visible alongside the app: 47 organisations, 47 projects, 0 users.

Automated regression is the full suite (§8), including the existing auth, payments,
seed/dashboard, media and import tests, all unchanged.

---

## 7. Rollback rehearsal

Run on a **copy** of the migrated database, never on the live local one
(`docs/qa/platform-m0-m2/rollback.json`, `rollback-after.json`):

- 17 platform tables dropped, both added columns dropped (`columnsDropped: true`),
  0 platform tables remain, `org_id` absent.
- Post-rollback snapshot vs the pre-migration snapshot: `countChanges: []`,
  `digestChanges: []`, `preserved: true` — every app row and token is untouched.
- The app still reads and creates projects after rollback (unit test
  `drops only the additive schema and leaves every app row working`).
- If a future SQLite build refuses `DROP COLUMN`, the columns are nullable and
  defaulted; an older Worker ignores them. The rollback reports
  `columnsDropped: false` in that case instead of claiming success.

Production rollback order: stop writes → restore the pre-M1 backup (or run rollback)
→ redeploy the previous Worker → verify with the same integrity queries. Nothing in
the new schema is read by the old Worker, so a rollback is data-neutral.

Delta from the approved DDL sketch (one additive line):
`platform_invoices_by_provider` — `UNIQUE (provider, provider_invoice_id) WHERE
provider_invoice_id <> ''`, required to make invoice mirroring idempotent under
webhook replay. No other table, column or constraint differs.

---

## 8. Test, typecheck and build results

| Command | Result | Log |
| --- | --- | --- |
| `bun test` | **384 pass, 0 fail, 4,985 assertions, 31 files** | `full-test.log` |
| `bun run typecheck` | exit 0 (app + worker configs) | `typecheck.log` |
| `bun run build` | exit 0, client build 143 ms | `build.log` |

26 of those tests are new (`tests/platform.test.ts`, 161 assertions), covering:

**Subscription history** — one live contract per org; closed contracts accumulate;
provider subscription id never forks a contract; in-place upgrade appends one
immutable change row; replayed event id changes nothing; re-subscribe after
cancellation marks the old contract `replaced` with a forward pointer and keeps the
paid invoice attached to it; a second trial is not minted; reconciliation is
idempotent and replays a failed event; invoices are mirrored once.

**Ownership claim security** — claim must use the project's registered email; no
self-serve claim when that email is empty; one open claim per project; transfer
refused before approval or without email proof; approval refused without the email
token; approved transfer sets the org to `claimed` with recorded evidence and one
audit row; a claimed project cannot be re-claimed; a dispute freezes transfers;
operator reversal restores the previous holder and marks the transfer reversed;
second reversal is a no-op.

**Unverified accounts** — cannot invite members, change plans or start billing;
verified accounts can; billing stays disabled while the flag is off; suspended
accounts lose every privileged action.

**Schema, backfill and integrity** — idempotent schema; existing reads/writes
unchanged; FK rejection for orphan memberships/sessions/subscriptions; tenant
isolation (`listOrgProjects`/`getOrgProject` never cross orgs); backfill idempotency,
data preservation and deletion cleanup; integrity gate; rollback.

---

## 9. Production prerequisites still open (not executed here)

These require Cloudflare account access and are therefore **not claimed as done**:

1. **Production D1 backup verification.** Take a D1 Time Travel bookmark and an
   export before migrating, restore the export into a scratch database, and compare
   row counts + digests with the same script. Local rehearsal proves the procedure,
   not the production account.
2. **Production R2 verification.** List the bucket and hash a sample of objects
   before and after; confirm lifecycle/retention rules do not expire objects the app
   still references by `media.variants`.
3. **`PRAGMA foreign_key_check` on live D1.** D1 does not expose `integrity_check`;
   the script reports it as skipped rather than passing it. Run the equivalent
   `foreign_key_check` after the production backfill and confirm 0 rows.
4. **FK enforcement on D1.** Declared FKs were proven on the local SQLite engine
   used by Miniflare. Confirm on the production binding that an orphan insert is
   rejected before relying on it as a security control.
5. **`PLATFORM_FLAGS` binding.** Set it (all off) in the Worker environment so the
   flag state is explicit rather than implicit.
6. **Re-run the backfill after the migration window.** Any project created between
   the backfill and M3 is unlinked by design; the backfill is idempotent and should
   be run until M3 closes public creation.

---

## 10. Deliberate limitations

- M3 is not started: no routes, no sessions, no login, no claim UI. `src/worker/platform/claims.ts`
  is a tested data layer; nothing calls it from a request path.
- `projects.org_id` cannot carry a foreign key (SQLite cannot add one with `ALTER
  TABLE`). Integrity is enforced by the reconciliation gate, the backfill and the
  org-scoped read helpers, not by the engine.
- The 47 synthetic organisations are a migration construct. Merging two apps into
  one organisation remains a later, explicit operator action.
- No pricing, plans or subscriptions were seeded. No customer can be charged.
- The local dev database now has the M1+M2 schema and the 47 organisations; the
  pre-migration state is the backup in `.wrangler/backups/platform-m0-m2-run/`.
