# Remote backup and restore acceptance

Date: 20 November 2026
Environment: `plattr-staging` (see `docs/STAGING.md`). Production untouched.

This report covers only what was executed against real Cloudflare resources. The
local rehearsal it builds on is in `docs/qa/recovery/REPORT.md`.

## Result

| Area | Result |
| --- | --- |
| Remote D1 export | **PASS** — 0.84 MB SQL from `plattr-staging` |
| Scrubbing | **PASS** — 3 owner sessions removed, 1 gateway secret cleared |
| Remote R2 media access | **PASS** — 21/21 objects read with size, dimension and sha256 checks |
| Upload to a separate bucket | **PASS** — 24 files to `plattr-staging-backups` |
| Read-back verification | **PASS** — 24/24 sha256 matches |
| Pending and verified states | **PASS** — pending written before upload, verified only after read-back |
| Interrupted backup | **PASS** — killed mid-run; index kept it `pending` with 0 files |
| Retention | **PASS** — pruned the oldest verified run; both pending runs kept |
| Failure alerts | **PASS** — 2 alert POSTs, one from a real transient failure |
| Heartbeat alerts | **PARTIAL** — heartbeat received on success; no external service watches it |
| Remote restore into an isolated environment | **PASS** — separate D1, bucket and Worker |
| Restored app over HTTPS | **PASS** — pages, images, auth, versions |
| Scheduled GitHub Actions run | **BLOCKED** — this repository has no git remote |

## Staging identifiers

See `docs/STAGING.md` for the full table. Worker versions at acceptance:
`plattr-staging` `c027c104-602f-4dad-a009-9f8f3204e1d0`,
`plattr-staging-restore` `11be6668-cde6-4e03-aef6-b3b41c74c87b`.
Deployment commit: `afc3861` (with the staging configs and `upload_source_maps:
false` added in the same working tree).

## Remote backup runs

Backup bucket `plattr-staging-backups`, prefix `plattr/`.

| Run | State | Files | Note |
| --- | --- | --- | --- |
| `20261120T065533Z-74375d46` | verified | 24 | first remote run; pruned later by retention |
| `20261120T065746Z-74375d46` | pending | 0 | killed mid-run on purpose |
| `20261120T065832Z-74375d46` | verified | 24 | kept |
| `20261120T070012Z-74375d46` | pending | 0 | real read-back failure (see alerts) |
| `20261120T070220Z-74375d46` | verified | 24 | **the run that was restored** |

Verified run `20261120T070220Z-74375d46`:

- database sha256 `74375d46a9aa9560a143fcd530cf9826ab41977bb4ad572d89910220ac742fb8`, 1,470,464 bytes
- 38 tables, 1,806 rows
- media checksum `595e371f904c47b0a2e74b9e13df760c4fa6bc342f0156c16675a21fcb308c00`, 21 objects, 488,446 bytes
- 24 files, each read back from R2 and compared byte for byte

### Scrubbing evidence

The staging database was seeded with three `owner_sessions` rows and one
non-empty `payment_connections.secrets` value before the run. The run reported:

```json
{"removed":{"owner_sessions":3,"user_sessions":0,"auth_tokens":0,"invitations":0},
 "cleared":[{"table":"payment_connections","column":"secrets","rows":1}]}
```

That is inside the exported snapshot, not a local copy.

### Interrupted run

The job was started, then killed as soon as `plattr/index.json` showed the run as
`pending` (12 s in). Afterwards the index held:

```
20261120T065746Z-74375d46 pending files=0
20261120T065533Z-74375d46 verified files=24
```

The pending run's `run.json` was never uploaded, which is correct: the run failed
before the upload stage, so there is no half-written backup claiming to be one.
The previously verified run was untouched.

### Retention

With `--keep 2`, a third verified run pruned `20261120T065533Z`: its files were
deleted (`runs/20261120T065533Z-74375d46/run.json` now answers "The specified key
does not exist") and it left the index. Both `pending` runs stayed in the index,
because retention selects `status === 'verified'` only.

## Alerts

A local receiver (`scripts/qa/webhook-sink.mjs`, port 8788) recorded:

```
06:57:19 GET  /heartbeat
07:00:12 GET  /heartbeat
07:01:57 POST /alert {"text":"Plattr backup failed\nstage: verify\nrun: 20261120T070012Z…\nwrangler r2 object get failed: Please check your network connection…"}
07:02:00 POST /alert {"text":"Plattr backup failed\nstage: start\nrun: (not assigned)\nbucket plattr-staging-backups-typo does not exist…"}
```

- The **07:01:57 alert is a real failure**: the read-back stage lost its
  connection to R2 partway through, the run stayed `pending`, and the operator was
  told which stage failed. The next run succeeded, so it was transient.
- The 07:02:00 alert is the deliberate guard: a mistyped backup bucket is caught
  before any export, with the bucket named in the alert.

**Heartbeat limitation:** the heartbeat is pinged on each verified run (two
recorded above), and not pinged when a run fails or never starts. Proving that a
*missing* heartbeat raises an alert needs an external watchdog account
(Healthchecks.io, Better Stack, or Cloudflare's own notification rules), which
does not exist in this workspace. What is proven is the sender side; the receiver
side is unproven.

## Remote restore

Fetched with `scripts/offsite-fetch.mjs --remote --run 20261120T070220Z-74375d46`,
which re-checks the run is `verified`, the database sha256, every object sha256
and the media manifest before keeping anything.

Restored into `.wrangler/restore-state` and verified:

```
ok  media objects: 21/21 present for 7 rows
ok  media isolation: no project names another project media
ok  orders/booking/enquiry → customers: no orphans
restore verified
```

Then rebuilt the isolated environment: database dumped and imported into
`plattr-staging-restore` (58 projects, 7 media rows, 38 orders, 131 versions),
21 objects uploaded to `plattr-staging-restore-media`, and the
`plattr-staging-restore` Worker deployed with its own secrets.

### HTTPS evidence

Against `https://plattr-staging-restore.dio-app.workers.dev`:

| Check | Result |
| --- | --- |
| `GET /health` | `200 {"ok":true,"db":"up"}` |
| `GET /p/e5114b3ae6393d0869611bf2/app` | `200`, 207,818 bytes |
| `GET /p/…/media/med_3815c9357b5c76b5f55f7289/320.webp` | `200 image/webp`, 2,358 bytes, `RIFF … Web/P image` |
| Same media id under another project token | `404` |
| Owner login, wrong key | `401` |
| Owner login, derived key | `303` + session cookie |
| `GET /api/projects/…/dashboard` without session | `401 owner_auth_required` |
| Same with session | `200` (modules, summary, orders, bookings, enquiries, customers) |
| `GET /api/projects/…/doc/versions` with session | `200`, 3 versions, newest `dvr_fdcdfdd241ae6a2429db` |

The image is served from R2 in the restored bucket by the restored Worker, so
"real images over HTTPS" is not a claim about a local file: the bytes came from
the backup, through Cloudflare, to the browser.

### Primary application unaffected

During and after the restore deploys, staging itself answered `200` on `/health`,
`/p/…/app` and the media URL, and its D1 still held its own 3 seeded sessions
while the restored environment held 1 (created by the login test). The two
environments do not share a database, bucket or session.

## Auto-return verification

Separate from backup, re-verified in this pass.

| Requirement | Evidence |
| --- | --- |
| 1. A section hidden because it has no customer-visible content | `run-autohide.mjs` step 1: fixture section starts `hidden: true, hiddenBecause: 'empty'` |
| 2. Business data added | step 2 adds coaches through the dashboard API |
| 3. Section becomes eligible again | stored document becomes `{"hidden":false}` and the response names `sec_fx_gym_trainers` as restored |
| 4. Editor reflects it | step: "the editor shows the section without any manual step" |
| 5. Published app displays it | regression suite renders the section; auto-hide suite asserts the stored doc then reloads the editor |
| 6. Owner-hidden stays hidden | `tests/publish.test.ts` › "a section the owner hid by hand stays hidden when the data arrives": no `hiddenBecause`, `restored` empty, node still `hidden: true` |
| 7. Removing the data hides it again | `tests/autohide.test.ts` › "clearing the coaches again hides it, and adding them once more restores it" |

9/9 browser checks and 3/3 unit tests pass. The distinction is explicit in the
data, not in wording: a system-hidden node carries `hiddenBecause: 'empty'` and is
the only kind reconciliation may un-hide; owner-hidden nodes carry no marker and
are never touched by `pruneEmptySections`, which returns `restored: []` for them.

## Scheduled workflow

Not executed. `git remote -v` is empty, so GitHub never sees
`.github/workflows/offsite-backup.yml`; there is no repository to attach secrets
to, and no manual or scheduled run can be triggered. The workflow's required
secrets and the narrowest permissions are documented in the file and repeated
here:

| Secret | Scope needed |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | D1 Read (export), R2 object Read on the media bucket, R2 object Read/Write/Delete on the backup bucket, Workers Scripts Read |
| `CLOUDFLARE_ACCOUNT_ID` | Not secret; repository variable is acceptable |
| `BACKUP_ALERT_WEBHOOK` | Slack/Discord incoming webhook URL |
| `BACKUP_HEARTBEAT_URL` | Healthchecks/Better Stack ping URL |

The job runs `bun install --frozen-lockfile`, `bun run typecheck`, then
`scripts/offsite-backup.mjs --remote … --keep 7`, with a 30-minute timeout and a
concurrency group so two runs cannot interleave. `ubuntu-latest` provides
`sqlite3`, which the import step needs.

## Estimated monthly cost

| Item | Quantity | Cost |
| --- | --- | --- |
| Workers Paid plan (account level, already required for production) | 1 | $5.00 |
| Staging + restored Workers requests | well under 100k/day | included |
| D1 storage | ~3 MB (2 databases) | free tier (5 GB) |
| D1 rows read | a few thousand per backup | free tier (25 M/day) |
| R2 storage | ~1 MB media + ~150 MB runs | free tier (10 GB) |
| R2 operations | ~50 per run, 1 run/day | free tier (1 M Class A, 10 M Class B) |
| R2 egress | 0 | $0 (R2 has no egress fee) |
| GitHub Actions | ~1 min/day | free tier (2,000 min/month) |
| **Total added** | | **$0 beyond the existing $5 plan** |

The dominant real cost is the storage of retained runs, which grows with database
size: 7 runs × (database + media). At 1.5 MB and 0.5 MB that is 14 MB; at 1 GB it
would be 10.5 GB and leave the free tier.

## Remaining blockers

1. **Scheduled workflow is not running** — no git remote, so no manual or cron
   execution and no secret storage. Everything else in this report was executed.
2. **No external heartbeat receiver** — the ping is sent, nothing watches for its
   absence.
3. **Production is still not deployed.** This proves the path on staging; it does
   not create a production database, bucket, origin or schedule.
4. **Unreferenced media is still outside the backup** — the run copies the 21
   variants named by a row. R2 bucket replication is the fix and is not enabled
   on staging either.
5. **Partial uploads from a failed run are retained.** The 07:00:12 run left its
   uploaded objects in the bucket with no `files` list, so retention cannot prune
   them. They cost nothing at this size, but a sweep for `pending` runs older than
   N days is not implemented.
