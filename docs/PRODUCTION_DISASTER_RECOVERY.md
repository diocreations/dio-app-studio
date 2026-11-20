# Production disaster recovery

Date: 20 November 2026

This is the plan for losing production Plattr: a deleted D1 database, a wiped R2
bucket, a bad deploy, or a business asking for last Tuesday back. The local
procedure in `docs/BACKUP_AND_RECOVERY.md` covers restoring a snapshot on one
machine. This document covers the production path: where copies live, who runs
them, how often, how long recovery takes and what is still unproven.

**Production is not deployed.** There is no production Plattr D1, R2 bucket or
public origin. The path itself has now run against real Cloudflare resources in a
separate staging environment (`docs/STAGING.md`): remote D1 export, scrubbing,
remote media reads, upload to a separate bucket, read-back verification,
retention, alerting, and a restore into an isolated environment that served
pages and images over HTTPS. The evidence is `docs/qa/remote/REPORT.md`. What
remains unproven is production itself, and the scheduler.

## Rehearsed and not rehearsed

| Area | State | Evidence |
| --- | --- | --- |
| D1 export → SQLite → scrub | Rehearsed locally | `scripts/offsite-backup.mjs` run `20261120T063309Z-874ba316` |
| Media copy with size/dimension/sha256 checks | Rehearsed locally | 21/21 objects, checksum `595e371f…` |
| Upload to a **separate** bucket, then read back and compare | Rehearsed locally | 24/24 files verified by byte comparison |
| Backup index (audit log, pending → verified) | Rehearsed locally | run `20261120T062941Z` stayed `pending` after an interrupted attempt; fixed runs read `verified` |
| Retention pruning | Rehearsed locally | `--keep 1` pruned 2 older runs and their 48 objects |
| Sweeping abandoned runs | Rehearsed locally and on staging | 6 objects in a disposable prefix; 25 real leftovers under two failed staging runs, both verified runs untouched |
| Fetch a run back and restore it | Rehearsed locally | fetched run restored into an empty state; `verify-restore.mjs` passed |
| The restored app serving pages and media | Rehearsed locally | editor `200`, own image `200 image/webp`, foreign project image `404` |
| `--remote` against Cloudflare D1/R2 | Rehearsed on staging, never on production | run `20261120T070220Z-74375d46`, `docs/qa/remote/REPORT.md` |
| Restore into an isolated remote environment | Rehearsed on staging | `plattr-staging-restore` served pages, images and owner auth over HTTPS |
| Scheduling and alert delivery | Sender proven, scheduler **not running** | alerts and heartbeat recorded by a local receiver; no git remote, no watchdog account |
| R2 replication for unreferenced objects | **Not configured** | see *Media coverage* |

## What a production backup is

`bun scripts/offsite-backup.mjs --remote` does one run:

```
wrangler d1 export plattr-studio --remote      read-only, whole database
  → import into SQLite, scrub credentials
  → wrangler r2 object get plattr-media/<key>   every media variant named by a row
  → wrangler r2 object put <backup-bucket>/plattr/runs/<run>/…
  → read every object back, compare sha256
  → mark the run verified in plattr/index.json
  → prune runs beyond the retention count
  → (daily, after the run) sweep objects left by runs that never verified
```

Layout in the backup bucket:

```
plattr/index.json                          every run, newest first, with status
plattr/runs/<UTC stamp>-<db sha8>/
  run.json                                 counts, checksums, files, status
  database.sqlite                          scrubbed, consistent copy of D1
  media/manifest.json                      objects, dimensions, sha256, checksum
  media/objects/projects/…/*.webp          the variants themselves
```

The run id embeds the first eight characters of the database sha256, so two runs
of unchanged data are visibly identical and a changed database is visibly
different.

Run `20261120T063309Z-874ba316` wrote 24 files: one 1.46 MB database (38 tables,
1,782 rows), one media manifest, 21 WebP objects (488 KB, 21 referenced
variants) and the run document. A full local run took **58.8 s** wall clock,
including 48 bucket operations. The fixtures have been edited by later QA runs,
so a fresh rehearsal will report a different size and sha256; the shape and the
checks are what carry over.

### The backup is scrubbed, and that has a cost

The same redaction as the local backup applies:

- `owner_sessions` rows are deleted (68 in the rehearsal): everyone signs in again.
- `payment_connections.secrets` is cleared (1 row): a restored business must
  re-enter its Razorpay/Stripe keys, because the ciphertext is bound to the
  production `PAYMENT_ENCRYPTION_KEY` and should not travel in a backup.
- `users`, `auth_tokens` and `invitations` are emptied when present.

Nobody can use a stolen backup to sign in or charge a card, and a restore is not
a silent resumption of trust. The trade-off is that recovery includes a
credential step per connected business; the runbook below includes it, and the
RTO target assumes it.

## Media coverage

`--remote` copies the variants that a `media` row names. On 20 November that was
21 of 36 objects in the media bucket. The other 15 (217 KB) are not named by any
row: leftovers from deleted uploads and from a cleanup rehearsal. They are
captured by `scripts/backup.mjs` locally but not by the offsite run.

Two ways to close that, in order of preference:

1. **Enable R2 bucket replication** on `plattr-media` to a second bucket or
   region. It copies every object, including ones with no row, and needs no
   application change. Do this before launch; the offsite job then covers the
   database and the index, and replication covers all bytes.
2. Accept the gap, and keep the media cleanup policy strict so unreferenced
   objects do not accumulate. They are, by definition, not referenced by any
   document or media row, so losing them loses nothing a business can see.

Do not describe option 2 as full media protection.

## Schedule, retention and storage isolation

| Item | Decision | Why |
| --- | --- | --- |
| Frequency | Daily at 02:30 UTC, plus a manual run before any risky change | A day of lost orders is the most a business can absorb without a refund conversation |
| Retention | 7 verified runs (`--keep 7`), pruned oldest-first | A week covers "we noticed on Monday that Friday was wrong" |
| Location | A dedicated bucket, **not** the media bucket, ideally in another region | A bucket-level mistake or a compromised token must not reach both copies |
| Credentials | A token limited to D1 read + the backup bucket's object read/write | The backup job needs no write access to production data |
| Immutability | R2 object lock or a lifecycle rule that only expires, never overwrites | Ransomware and fat-finger deletes target backups first |
| Index | `plattr/index.json` is the audit log and the retention source | One object answers "when did we last back up, and did it verify" |

The script refuses to run if the backup bucket equals the media bucket, and
refuses to overwrite an existing run id.

### Scheduling today

`.github/workflows/offsite-backup.yml` runs the job daily and on demand. It is
**not active**: this repository has no git remote, so GitHub never sees it.

Two supported ways to run it:

1. **GitHub Actions** once a remote exists. Set repository secrets
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BACKUP_ALERT_WEBHOOK` and
   optionally `BACKUP_HEARTBEAT_URL`. Nothing else is needed.
2. **Any host with cron**, e.g. a 2 vCPU box:

   ```cron
   30 2 * * * cd /srv/plattr && BACKUP_ALERT_WEBHOOK=… BACKUP_HEARTBEAT_URL=… \
     bun scripts/offsite-backup.mjs --remote --backup-bucket plattr-backups --keep 7 \
     >> /var/log/plattr-backup.log 2>&1
   ```

   The log is the local fallback; the webhook is the one that wakes someone.

Whichever host runs it needs `wrangler` authenticated. Prefer a scoped API token
in the environment over an interactive OAuth login on a server.

## Targets, not measurements

Production RPO and RTO cannot be measured before there is production data. These
are **targets** that the design implies, not observed values:

| Metric | Target | What it means | What could break it |
| --- | --- | --- | --- |
| RPO | 24 hours | A disaster loses at most the last daily run | The job silently not running; a failed run that nobody read |
| RTO (database + media, known good snapshot) | 2 hours | Restore, verify, redeploy, re-enter gateway keys | Waiting on a person; a slow provider restore; an unverified snapshot |
| RTO (single project) | 30 minutes | `restore-project.mjs` against the live database | Misidentifying the project token |
| RPO for D1 alone | Up to 30 days, provider-dependent | Cloudflare D1 Time Travel / point-in-time restore | It is a provider feature on a paid plan; verify it is enabled |

The 58.8 s local run is the *job* duration for 58 projects and 21 media variants,
not an RTO. Restore time grows with database size and with how many businesses
must re-enter gateway keys.

## Restore procedures

Every procedure starts by fetching a run, never by trusting a directory that
happens to exist:

```bash
bun scripts/offsite-fetch.mjs --remote --run <id> --out /srv/restore/<id> --backup-bucket plattr-backups
```

The fetch checks the run is `verified`, compares the database sha256 with
`run.json`, downloads every media object and re-runs `verifyMediaBackup`. A
tampered or incomplete run fails here, before anything is restored.

### 1. Full recovery into a new environment (worst case)

1. Create a new D1 database and a new R2 bucket in the Cloudflare dashboard.
2. Fetch the newest verified run (above).
3. Apply the snapshot to the new database:
   ```bash
   bun scripts/restore.mjs /srv/restore/<id> --database /srv/restore/target.sqlite --media-state /srv/restore/state --force
   ```
   `restore.mjs` writes a fresh SQLite file and copies media into a state
   directory; it never touches the source.
4. Verify it:
   ```bash
   bun scripts/verify-restore.mjs /srv/restore/target.sqlite --media-state /srv/restore/state \
     --manifest /srv/restore/<id>/manifest.json
   ```
   Expect `restore verified`: row counts, table checksums, relationships and
   every media object.
5. Import into the new D1 (`wrangler d1 execute --remote --file`) and upload the
   media objects with `wrangler r2 object put --remote`, preserving keys.
6. Point the Worker at the new bindings and deploy.
7. Sign in as each owner (`owner_sessions` was scrubbed) and have each connected
   business re-enter its gateway keys. Confirm one test payment per gateway.
8. Keep the old database and bucket read-only until the restored environment has
   served a full day.

### 2. One project (a business deleted its app, or wants an older version)

```bash
bun scripts/restore-project.mjs /srv/restore/<id> --project <token> \
  --database <live.sqlite> --media-state <live-state>
```

It restores that project's rows and media only, refuses to touch other projects,
and reports what it replaced. The recovery drill covers this case: Aster & Rye
restored, Butter Tales unchanged, one session before and after.

### 3. Database only (media intact)

Steps 1–5 above with `restore.mjs --no-media`, or restore the SQLite file and
import it. Use when only D1 was damaged, which is the common case after a bad
migration.

### 4. Media only (bucket wiped, rows intact)

Restore `media/objects` from the run with `restore.mjs` and upload them back with
their original keys; every document reference is a key, so nothing else changes.
`verify-restore.mjs` proves each row has its objects again.

### 5. A single deleted design version

Do not restore the database for this. `/api/projects/:token/doc/versions` keeps
the last 20 versions and the editor restores one in place. Only reach for a
backup when the version itself is gone.

## When the backup job fails

A run is written to the index as `pending` **before** any upload, so an
interrupted job is visible rather than invisible. The rehearsal demonstrated
both states: an attempt killed before upload stayed `pending`; a completed run
read `verified` with all 24 files.

| Failure | Symptom | Action |
| --- | --- | --- |
| Export fails (auth, network) | Job exits at `stage: export`, nothing uploaded | Check the token, run again; the previous day's run is still the recovery point |
| Media object missing or corrupt | Job exits at `stage: media`, **nothing is uploaded** | Investigate the media row/object; do not accept a partial backup |
| Upload or read-back mismatch | Job exits at `stage: upload`/`verify`, index keeps `pending` | Run again; if it repeats, the bucket is the problem, not the data |
| Index would be overwritten | Job refuses | Fetch and inspect `plattr/index.json` by hand first |
| Pruning fails | Run stays verified, index keeps the extra run | Harmless: extra storage, no data loss |
| Run fails after uploading | Index keeps it `pending`; its objects stay in the bucket | Nothing to do by hand: the daily sweep removes them once the run is 6 h old |
| No run for 36 hours | Nothing, unless someone looks | This is what `BACKUP_HEARTBEAT_URL` is for |

### Abandoned runs and the sweep

A run writes its full upload list into `plattr/index.json` and into
`plattr/runs/<id>/run.json` **before** the first upload, so a failed run never
leaves an anonymous pile of objects. `scripts/backup-sweep.mjs` reads that list,
probes each key, and deletes only the ones that exist under that run's own
prefix:

```bash
bun scripts/backup-sweep.mjs --remote --backup-bucket plattr-backups            # dry run
bun scripts/backup-sweep.mjs --remote --backup-bucket plattr-backups --execute
```

It will not touch a `verified` run, an already `abandoned` run, a run younger
than `--older-than` minutes (default 360, minimum 31 — the job's own timeout plus
a minute), or a prefix the index does not name. A run with no readable
`createdAt` is skipped rather than guessed at, and a probe that cannot decide
whether an object exists stops that run. The index entry is kept and marked
`abandoned`, so the attempt stays in the audit log; a second sweep finds nothing.
Runs from before this record existed are still swept: their candidate keys come
from the newest verified run's layout, translated to the abandoned prefix and
probed one at a time. The workflow runs the sweep after every backup, including
a failed one.

`BACKUP_ALERT_WEBHOOK` receives a JSON `{text, stage, runId, mode}` on failure —
a Slack or Discord incoming webhook accepts it as is. `BACKUP_HEARTBEAT_URL` is
pinged only after a verified run, so a dead-man's-switch service (Healthchecks,
Better Stack heartbeat) alerts on silence, which is the failure mode that
actually loses data.

## Verification cadence

| When | What |
| --- | --- |
| Every run | Read-back and sha256 of every uploaded file (automatic) |
| Weekly | Eyeball the index: newest run `verified`, age under 36 h, file count unchanged |
| Monthly | Fetch the newest run and run `restore.mjs` + `verify-restore.mjs` into a scratch state; record pass/fail |
| Quarterly (once deployed) | The same, using `--remote` end to end, with one business's app served from the restored copy |
| After any schema change | A backup and a restore before the migration, not after |

The monthly rehearsal is the one that catches bit rot and lost credentials;
without it a green index only proves that uploads succeeded.

## Credentials, access and ownership

| Secret | Where it lives | Who needs it |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` (D1 read, backup bucket write, media bucket read) | GitHub secret or the cron host's environment, never the repo | The backup job |
| `PAYMENT_ENCRYPTION_KEY` | Cloudflare Worker secret | The running app, **not** the backup job |
| `BACKUP_ALERT_WEBHOOK` | GitHub secret or cron environment | The backup job |
| `BACKUP_HEARTBEAT_URL` | Same | The backup job |

Accounts still to be decided by the owner, not by this document: who holds the
Cloudflare account, who is paged, and who may authorise a restore over live data.
A restore into production should need two people: one to run it, one to confirm
the snapshot id.

## Costs

At the rehearsal size (1.5 MB database, 0.5 MB media per run, 7 runs) storage is
under 20 MB, which is inside R2's free tier. The costs that matter later are
egress-free restores (R2 has none) and D1's storage/read billing for the restored
database. A daily job of this shape is cents per month; the real cost is the
monthly rehearsal hour.

## Known gaps

1. `--remote` has run against staging only. Production does not exist yet, and a
   different account, plan or region can still surprise you.
2. Nothing is scheduled: no git remote, so the workflow cannot run, no cron host
   and no webhook URL are configured.
3. No monitor watches the heartbeat. The job pings it; nothing alerts on silence
   (see `docs/MONITORING.md`).
4. R2 replication is not configured, so unreferenced media objects are not
   offsite.
5. The sweep exists and has run on staging, but nothing schedules it yet: the
   workflow step is committed and cannot run without a git remote.
6. Credential rotation for the backup token is manual and undocumented beyond
   this table.
7. Point-in-time restore for D1 is a provider capability; confirm it is enabled
   on the production plan before launch.
