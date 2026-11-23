# Supervised pilot safeguards

Date: 22 November 2026

Status legend:

- **implemented + tested** — in code and exercised locally;
- **implemented, needs configuration** — code exists but an environment,
  schedule, credential or named human is still missing;
- **not implemented** — cannot be claimed before external owners.

No production resource was provisioned or deployed for this review. A local
backup was taken; no production restore, monitoring or alert delivery is claimed.

## 1. Owner access and project isolation

| Control | State | Evidence |
| --- | --- | --- |
| Customer app link is not an owner credential | implemented + tested | `/p/:token/app` is public; `/p/:token`, `/review`, `/edit` redirect to owner login; API returns 401 |
| Owner key is derived per project, not stored in D1 | implemented + tested | `ownerAccessKey(token, OWNER_SECRET)` HMAC-SHA-256; key shown only on the operator-authenticated studio |
| Owner session is random and project-scoped | implemented + tested | `own_` 48 hex characters in `owner_sessions`, project id checked on every use |
| Sessions are revocable | implemented + tested | sign out and “Sign out everywhere” delete sessions and log the action |
| Cross-project access is refused | implemented + tested | `tests/private.test.ts`, `tests/mediaIsolation.test.ts`; 40 focused safeguards tests passed |
| Owner key delivery to a real owner | **manual, not automated** | Deliver the private link and key separately (password manager/in person). Never put the key in a URL or email body. |

Residual limitation: one shared owner principal per project, no named staff
accounts, no roles, and no actor identity in the activity log. That is adequate
for one owner per pilot business, not for a team with different permissions.

## 2. Data backup and recovery

| Control | State | Evidence |
| --- | --- | --- |
| Local database + media backup | implemented, local | `bun scripts/backup.mjs --state .wrangler/state --out .wrangler/pilot-backup --retention 1` completed; manifest checksum `6c0489f023d8e58334849be92208c87182f4588820c7b7843141e478adec0da5` |
| Backup redacts sessions, invitation tokens and payment secrets | implemented | manifest `redactedColumns`; restore requires re-invite/reconnect |
| Offsite copy | implemented, **not configured** | `scripts/offsite-backup.mjs` exists; no offsite bucket or credentials were used |
| Scheduled nightly backup | **not implemented** | no scheduler or cron is configured |
| Restore into a separate database and verify checksums/media | local rehearsal only | prior recovery drill 27/27 in `docs/qa/recovery/restore-verification.json`; not rerun against this new pilot data |
| Restore served by the real Worker | local rehearsal only | prior drill used `wrangler dev` against restored state |
| Production restore / RTO | **not done** | requires production resources and explicit approval |

The 12 new pilot projects are included in the local backup directory named
above. That is a copy on the same machine, not disaster recovery. A lost laptop
or `.wrangler` directory is still a total loss until an offsite copy exists.

**RPO/RTO:** documented target ≤24 hours; not measured for production.

## 3. Error monitoring and alert ownership

| Control | State | Evidence |
| --- | --- | --- |
| Worker observability enabled | implemented, needs configuration | `wrangler.jsonc` |
| Health endpoint checks D1 | implemented + tested | `/health` performs `SELECT 1` |
| Uptime monitor | **not configured** | no Better Stack/UptimeRobot check |
| Worker error notification | **not configured** | no Cloudflare notification route |
| D1/R2 quota alerts | **not configured** | no 80% alerts |
| Backup heartbeat / failure webhook | implemented, **not configured** | `BACKUP_HEARTBEAT_URL`, `BACKUP_ALERT_WEBHOOK`; no real endpoint |
| Named primary and backup alert owner | **not done** | must be named before external owners |

**No external owner should be invited while an outage or a failed backup could
go unnoticed.** This is a release gate, not an optional improvement.

## 4. Media upload restrictions

| Control | State | Evidence |
| --- | --- | --- |
| Accepted formats | implemented + tested | JPEG, PNG or WebP; magic bytes must match the declared type |
| Maximum original size | implemented + tested | 8 MiB |
| Maximum pixels | implemented + tested | 24,000,000 |
| Stored sizes | implemented + tested | up to 4 WebP variants, each ≤2 MiB |
| Per-project file limit | implemented + tested | 24 files |
| Per-project storage limit | implemented + tested | 40 MiB total |
| Private delivery | implemented + tested | only `/p/:token/media/:id/:width.webp`, token and project scoped |
| Delete protection | implemented + tested | an in-use image cannot be deleted; old versions are scrubbed |
| Orphan cleanup | implemented, requires backup | two-stage cleanup, dry run then confirmed run with a named backup |

Tests: `tests/media.test.ts`, `tests/mediaIsolation.test.ts`,
`tests/mediaLifecycle.test.ts`, `tests/mediaCleanup.test.ts`.

## 5. Session and owner-key security

| Control | State | Evidence |
| --- | --- | --- |
| Cookie flags | implemented + tested | `HttpOnly`, `SameSite=Lax`, `Secure` when HTTPS |
| Absolute / idle lifetime | implemented + tested | 30 days absolute, 7 days idle, refreshed at most hourly |
| Owner key storage | implemented | HMAC derived from `OWNER_SECRET`, never stored in D1 |
| Sign out everywhere | implemented + tested | all sessions for the project deleted |
| Login rate limit | implemented | 10 attempts/day per project+visitor |
| Key rotation | **all-or-nothing** | rotating `OWNER_SECRET` invalidates every project key at once; no overlap |
| CSP | **not implemented** | inline styles/scripts would need nonces/hashes |

For the pilot, one owner key per business must be issued and stored in the
owner's password manager. The operator must not send it in the same message as
the public customer link.

## 6. Data retention and deletion

Project deletion now removes, in one database batch:

- orders and order items;
- bookings and enquiries;
- customers;
- notifications;
- payment events, transactions, connections and settings;
- media rows, media cleanup log and owner sessions;
- document versions, notes, activity and the project row.

The operator route also deletes every stored media object from R2 **before**
removing the database rows. If R2 is unavailable or a deletion fails, the route
returns an error and does not proceed with the database deletion. The route is
operator-key protected and POST-only.

| Control | State | Evidence |
| --- | --- | --- |
| Complete project data deletion | implemented + tested locally | `tests/db.test.ts` covers sessions, customers, orders, order items, bookings and enquiries; `tests/onboarding.test.ts` exercises the operator route with a fake R2 bucket and verifies the variant key is deleted before the project rows |
| Customer-level deletion / subject request | **not implemented** | no owner or customer-facing erasure workflow |
| Retention schedule for orders/bookings/enquiries | **not implemented** | no expiry or archive policy |
| Owner-account deletion | **not implemented** | one derived key per project |
| Backup retention | script supports 7 daily / 4 weekly / 3 monthly; **not scheduled** | confirm with owner |

**Before external owners:** record the retention period for customer contact
details and order/booking history, who may request deletion, how identity is
verified, and how a deletion propagates to backups. Do not delete production
data to satisfy a policy that has not been agreed.

## 7. Customer enquiry and order access

| Control | State | Evidence |
| --- | --- | --- |
| Customer submissions are project-scoped | implemented + tested | `/p/:token/orders`, `/bookings`, `/enquiries` use the project token |
| Cross-origin customer writes refused | implemented + tested | same-origin checks |
| Submission rate limits | implemented + tested | 30 orders, 15 bookings, 10 enquiries per day per project/visitor |
| Owner-only reading of customer records | implemented + tested | dashboard and APIs require owner session; another project's records are refused |
| Customer app indexing | implemented | `noindex, nofollow` by default; owner opt-in only |
| Public exposure of customer records | none found | no public list/detail route for orders, bookings or enquiries |

The public customer app necessarily accepts contact details. Those records are
visible only to the owner session for that project. They are not visible to
another project, a customer token, or a search engine.

Residual risk: the customer app link is a capability. Anyone with it can submit a
request, subject to rate limits. For the pilot, keep the link private and do not
index it.

## 8. Incident response and rollback

| Control | State | Evidence |
| --- | --- | --- |
| Deployment and rollback procedure documented | documented | `docs/DEPLOYMENT_CHECKLIST.md`, `docs/PRODUCTION_DISASTER_RECOVERY.md` |
| Backup before deploy | documented | pre-deploy backup step |
| Worker version promotion / rollback | documented, **not rehearsed** | no production deployment exists |
| Incident record template | documented | recovery/incident log fields |
| Named incident owner | **not named** | required before external owners |
| Customer communication template | **not prepared** | needed if a pilot incident affects an owner |
| Production restore | **not done** | requires resources and approval |

## External-owner gate

External supervised onboarding may begin only when all of these are true:

1. A named primary and backup alert owner accepts the role.
2. Uptime, Worker error, D1/R2 quota and backup-failure alerts reach those
   people.
3. A nightly backup runs and an offsite copy is read back successfully.
4. One restore rehearsal against the pilot environment has passed, with RPO/RTO
   recorded.
5. The retention/erasure decision is recorded and the operator knows how to
   honour it.
6. Owner keys are issued out of band and a key-rotation plan is agreed.
7. The four moderated owner sessions in `OWNER-USABILITY-TEST-SCRIPT.md` have
   been run and their blockers fixed.
8. Deployment to a private pilot environment has been explicitly approved and
   rehearsed with rollback.

Items 1–4, 6 and 8 require explicit approval and production-like resources that
were deliberately not provisioned here. The current state is suitable for
**local, supervised demonstrations only**.
