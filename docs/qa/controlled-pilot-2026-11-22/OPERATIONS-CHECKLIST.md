# Controlled pilot — operations readiness checklist

Date: 22 November 2026

This is the operational checklist for a supervised pilot of **retail,
restaurants, salons and professional services**. Hotels are excluded and live
payments stay disabled. It does not authorize a production deployment; nothing
below was provisioned or deployed.

Canonical procedures: [`docs/OPERATIONS.md`](../../OPERATIONS.md),
[`docs/BACKUP_AND_RECOVERY.md`](../../BACKUP_AND_RECOVERY.md),
[`docs/PRODUCTION_DISASTER_RECOVERY.md`](../../PRODUCTION_DISASTER_RECOVERY.md),
[`docs/MONITORING.md`](../../MONITORING.md),
[`docs/DEPLOYMENT_CHECKLIST.md`](../../DEPLOYMENT_CHECKLIST.md),
[`docs/SECURITY.md`](../../SECURITY.md),
[`docs/STAGING.md`](../../STAGING.md).

Status key: **implemented** = in the repository and exercised by tests;
**local** = verified against local Wrangler/Miniflare state; **staging** =
previously rehearsed against a separate staging Worker; **production** =
verified against live production resources. No item is production-verified.

## 1. Production D1 and R2 configuration

| Check | Status | Evidence / action |
| --- | --- | --- |
| `DB` D1 binding is used for all business data and scoped by `project_id` | implemented | `wrangler.jsonc`, `src/worker/db.ts`, authorization tests |
| `MEDIA` R2 binding is private and served only through token-scoped media routes | implemented, local | media tests; local R2 state |
| Schema is additive and idempotent (`ensureSchema`) | implemented, local | migrations and test suite |
| Production database and bucket exist and are bound to the Worker | **not done** | Create only with explicit approval; record database id, bucket name and binding names |
| Production bucket has no public custom domain | **not verified** | Check in Cloudflare before first upload |
| Point-in-time recovery / provider retention is known for D1 | **not verified** | Record provider plan and retention window |
| Media object lifecycle and deletion protection are understood | implemented | live-reference protection tests |

## 2. Backup scheduling

| Check | Status | Evidence / action |
| --- | --- | --- |
| Database + media backup command | implemented, local | `bun scripts/backup.mjs`; manifest, checksums, scrubbed D1, media objects |
| Scheduled job exists and runs before every deploy and nightly | **not done** | No scheduler is configured in this repository or environment |
| Backup job has a heartbeat and failure webhook | implemented, local only | `BACKUP_HEARTBEAT_URL`, `BACKUP_ALERT_WEBHOOK`; no real endpoint called |
| Backup age is checked | **not automated** | Manual check until scheduling and monitoring exist |

Owner decision required: who owns the schedule, where the heartbeat points, and
the acceptable recovery point (RPO). The documented target is **≤ 24 hours**,
or the pre-deploy backup when a deploy is the change.

## 3. Offsite backup retention

| Check | Status | Evidence / action |
| --- | --- | --- |
| Separate offsite bucket path, upload, read-back and checksum verification | implemented, local + staging rehearsal | `scripts/offsite-backup.mjs`; `docs/qa/remote/REPORT.md` |
| Retention policy (7 daily, 4 weekly, 3 monthly in the runbook) | implemented in scripts, not scheduled | Confirm the policy with the owner before production |
| Offsite bucket is in a separate account/region from production | **not verified** | Must be checked in Cloudflare, not assumed |
| Restore fetch path | implemented, local + staging | `scripts/offsite-fetch.mjs` |
| Index and audit trail | implemented | `plattr/index.json` in the backup bucket |

## 4. Restoration testing

| Check | Status | Evidence / action |
| --- | --- | --- |
| Restore into a separate database file and verify integrity/counts/checksums | local | `scripts/restore.mjs`, `scripts/verify-restore.mjs`; recovery drill 27/27 |
| Restore media and verify every referenced object | local | same drill; 21/21 objects |
| Restored app served by the real Worker | local | `wrangler dev` against restored state |
| Project-level restore leaves other projects untouched | local | drill: Aster & Rye restored, Butter Tales byte-identical |
| Staging restore over HTTPS | staging | `docs/qa/remote/REPORT.md` |
| Production restore / RTO measurement | **not done** | Requires production resources and explicit approval |

Run the drill before the pilot and after any schema or media change:

```sh
bun scripts/recovery-drill.mjs
```

## 5. Monitoring and alert ownership

| Check | Status | Evidence / action |
| --- | --- | --- |
| Worker observability enabled | implemented | `wrangler.jsonc` |
| Uptime check on `/` | **not configured** | Choose Better Stack/UptimeRobot free tier; owner + backup owner |
| Worker error notification | **not configured** | Cloudflare Notifications → Workers errors |
| D1/R2 quota alerts | **not configured** | Cloudflare Notifications at 80% |
| Backup silence/failure alerts | **not configured** | Heartbeat + webhook endpoints |
| On-call/alert owner named | **not done** | Name one primary and one backup before pilot traffic |
| Monthly manual checks (media 404s, failed payment events) | documented, not scheduled | `docs/MONITORING.md` |

A pilot without a named alert owner is not operationally accepted.

## 6. Error reporting

| Check | Status | Evidence / action |
| --- | --- | --- |
| Server errors are logged with request context, no secrets | implemented | Worker logging and tests |
| Customer-facing failure states are honest and do not claim success | implemented, acceptance | order/booking/quote confirmations; failure tests |
| External error sink / grouped stack traces | **not configured** | Optional Sentry Workers SDK; not required to detect outage |
| Build and deploy failures are visible to the operator | implemented locally | build status and receipts; production deploy path not exercised |
| Log retention reviewed | **not verified** | Check provider plan retention |

## 7. Deployment process

| Check | Status | Evidence / action |
| --- | --- | --- |
| Pre-deploy checklist covering secrets, bindings, cache, health and smoke tests | implemented | `docs/DEPLOYMENT_CHECKLIST.md` |
| Typecheck, full tests and production build | local | run in this pilot: typecheck + full suite; build is part of release gate |
| Production D1 snapshot and R2 object count before deploy | **not done** | Requires production resources |
| Custom domain, TLS, canonical origin | **not done** | Provider operation |
| `/health` returns 200 with D1 up | local | endpoint and tests |
| Cache policy: HTML/API `no-store`/`private`, assets immutable | implemented | headers and service-worker test |
| No secrets or local state in uploaded assets | implemented, local | `postbuild` removes dotfiles and source maps; verified `dist/` contains no `.dev.vars`; re-inspect the actual upload artifact before production |
| Explicit owner approval to deploy | **required** | This checklist is not approval |

Do not deploy from this workspace without an explicit instruction from the
owner. No deploy was performed for this pilot.

## 8. Rollback procedure

| Check | Status | Evidence / action |
| --- | --- | --- |
| Last 20 document versions restorable in the editor | implemented | version API and editor; journey checks reload |
| Restoring a version is a normal save and can be undone | implemented | editor and tests |
| Previous Worker deployment can be promoted | **not verified** | Record deployment ids before first release; rehearse once |
| Previous D1 backup and media snapshot available | local / staging only | Production snapshot not taken |
| Rollback smoke test: home, app, owner login, dashboard, one booking, one enquiry | **not run in production** | Run after any production rollback |
| Emergency credential rotation revokes sessions | implemented | `Sign out everywhere`; owner-key tests |

Rollback is not accepted for production until one rehearsal is recorded against
the production deployment mechanism.

## 9. Session and owner-key security

| Check | Status | Evidence / action |
| --- | --- | --- |
| Customer app token cannot read owner APIs or dashboard | implemented | authorization tests |
| Owner key is derived from `OWNER_SECRET`, not stored in plaintext | implemented | `docs/SECURITY.md` |
| Owner session is HttpOnly, SameSite=Lax, project-specific, 30-day absolute / 7-day idle | implemented | session tests |
| Owner login capped at 10 attempts/day; public writes capped | implemented | rate-limit tests |
| Sign out one browser / sign out everywhere | implemented | tests |
| `OWNER_SECRET` is a production Worker secret, ≥ 32 random bytes | **not configured in production** | Set in the hosting secret store, never in Git or chat |
| `STUDIO_KEY` is separate and the operator board is closed without it | implemented, not production-configured | Set before exposing the studio |
| Key rotation runbook | documented, all-or-nothing | Rotating `OWNER_SECRET` invalidates every derived owner key; plan owner communication |
| Per-project key rotation with overlap | **not implemented** | Known limitation |
| Named owner accounts / team roles / actor audit | **not implemented** | One owner principal per build; document for pilot |

## 10. Data retention and recovery

| Check | Status | Evidence / action |
| --- | --- | --- |
| Guest order/booking/enquiry data is scoped to the business and readable only by its owner session | implemented | authorization tests |
| Customer history uses device-held capability ids, not accounts | implemented | `docs/OPERATIONS.md` |
| Backup deliberately removes session tokens, invitation tokens and payment secrets | implemented | backup redaction and restore checks |
| Retention periods for business/customer data are agreed | **not done** | Owner/legal decision; document before real customer data |
| Deletion/erasure procedure for a business or customer | **not implemented** | Needs a documented operator procedure |
| Recovery after accidental deletion | local / staging only | Restore drill; production restore not performed |
| Incident record: backup stamp, RPO/RTO achieved, actions | **template only** | Record in the incident log if used |

## Pilot go/no-go

Operational acceptance for the pilot requires all of these:

- [ ] A named alert owner and backup owner.
- [ ] A scheduled, monitored backup with a verified offsite copy.
- [ ] One restore rehearsal against the pilot's production resources.
- [ ] `OWNER_SECRET` and `STUDIO_KEY` provisioned as production secrets.
- [ ] The deployment checklist completed and one rollback rehearsed.
- [ ] A data-retention/erasure decision recorded.
- [ ] Explicit owner approval to publish.

Until then the pilot may run **locally or on staging with owner supervision**,
but it is not public-production ready.
