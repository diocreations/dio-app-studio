# Backup and disaster recovery

This is the canonical procedure. It was rehearsed on 2026-11-20 against a
disposable local D1 file and a disposable local R2 bucket; the machine-readable
result is `docs/qa/recovery/restore-verification.json` and the readable summary
is `docs/qa/recovery/REPORT.md`.

**What is proven here:** D1 backup and restore, R2 media backup and restore,
verification of both, project-level restore, and every failure scenario in the
table below — all locally, with the real Worker serving the restored copy.

**What is not proven here:** an offsite restore from Cloudflare. That needs
account credentials and is an operator step (`wrangler d1 export --remote`,
`wrangler r2 object get --remote`, or bucket replication). Nothing in this
document should be read as evidence that offsite replication is running.

## What a backup contains

`bun scripts/backup.mjs` writes one directory:

```
.wrangler/backups/<timestamp>/
  manifest.json           counts, table checksums, media checksum, redactions
  database.sqlite         consistent, scrubbed copy of D1
  media/manifest.json     every object with key, project, dimensions, sha256
  media/objects/…         the stored WebP variants, by object key
```

The rehearsal snapshot (58 projects):

| Domain | Tables | Rows |
| --- | --- | --- |
| Projects and briefs | `projects` | 58 |
| Business specification | `projects.spec` (column) | 58 |
| Documents and versions | `projects.doc`, `doc_versions` | 128 versions |
| Catalogue, categories, offers | `projects.spec` (`menu`, `offers`, `category`) | in spec |
| Media metadata and cleanup audit | `media`, `media_cleanup_log` | 7 rows / 21 stored variants |
| Orders | `orders`, `order_items` | 38 / 41 |
| Bookings | `bookings` | 43 |
| Enquiries | `enquiries` | 29 |
| Customer records | `customers` | 42 |
| Owner settings | `projects.*`, `payment_settings` | 58 / 1 |
| Payment configuration metadata | `payment_connections`, `payment_settings`, `payment_transactions`, `payment_events` | 1 / 1 / 1 / 0 |
| Platform records | `organizations`, `memberships`, `invitations`, `subscriptions`, `plans`, `plan_limits`, `operator_roles`, `audit_events`, `usage_events`, `ownership_transfers`, `project_claims`, `project_budget`, `platform_invoices`, `platform_billing_events`, `subscription_changes`, `notifications` | 47 organisations, rest as used |
| Activity and notes | `activity`, `notes` | 1057 / 2 |
| Budget counters | `daily_budget`, `import_budget`, `variation_counter` | 49 / 1 / 1 |

Every table in the database is copied, including tables added later, and every
table appears in `manifest.database.counts` and
`manifest.database.checksums`. A table that exists but is not listed above is
still backed up; the manifest is the authority.

### Deliberately not in an ordinary backup

| Removed | Why | After a restore |
| --- | --- | --- |
| `owner_sessions` rows | Session tokens are credentials, not business records | Owners sign in again with their owner key |
| `user_sessions` rows | Platform session tokens | Sign in again |
| `auth_tokens` rows | Password reset and email verification tokens | Request a new link |
| `invitations` rows | Pending invitation links | Send a new invitation |
| `payment_connections.secrets` | Encrypted provider credentials | The owner reconnects the provider |

`users.password_hash` is a salted hash, not a plaintext credential, and is kept
so platform sign-in survives a restore. The table is empty today (no platform
accounts exist yet); treat the first real rows as a decision point before the
first offsite backup.

The scrubbed copy is written with `VACUUM INTO`, the rows are deleted, the file
is vacuumed again and the journal mode is reset, so the removed values are not
left in free pages. The redaction is recorded in the manifest and re-checked on
restore (`no restored owner sessions`, `no restored payment secrets`).

## Commands

```sh
# Database + media, into .wrangler/backups/<stamp>/
bun scripts/backup.mjs

# Database only (same scrubbing and manifest, kept for older runbooks)
bun scripts/d1-backup.mjs <source.sqlite> <backup-dir> 7

# Restore into a separate database file
bun scripts/restore.mjs .wrangler/backups/<stamp> --database /tmp/restore/restored.sqlite --force

# Restore into a disposable Wrangler environment (D1 + R2), ready for
# `wrangler dev --persist-to`
bun scripts/restore.mjs .wrangler/backups/<stamp> \
  --persist-to .wrangler/drill/state --media-state .wrangler/drill/state --force

# Verify a restore: integrity, counts, checksums, relationships, media objects
bun scripts/verify-restore.mjs <restored.sqlite> \
  --media-state .wrangler/drill/state \
  --manifest .wrangler/backups/<stamp>/manifest.json

# The whole rehearsal, including every failure scenario, on disposable copies
bun scripts/recovery-drill.mjs
```

`restore.mjs` verifies the backup before writing, stages the database and
verifies the staged file, and only then renames it into place. A refused or
interrupted restore leaves the existing target byte-identical.

## Verification performed

`bun scripts/recovery-drill.mjs` — **27/27 checks passed**:

| Check | Result |
| --- | --- |
| Backup integrity, counts and checksums | ok, 1757 rows, sha256 `3c491ba0…` |
| Sessions and payment secrets removed | 57 session rows removed, 1 secret column cleared |
| Media backup complete | 36 objects, 21 referenced variants, 689 KB |
| Restore matches the backup | counts and 38 table checksums identical |
| Restored database points at no missing media | 21/21 objects for 7 rows |
| Restored app served by `wrangler dev` | health 200, customer page 200 with the business name |
| Restored image | 200 `image/webp`, valid RIFF/WebP bytes |
| Project isolation | another project's token gets 404 for the same image |
| Owner access | owner routes 401 without a session; a fresh sign-in works |
| Cleanup through the Worker on the restored copy | dry run reported only the seeded upload, apply removed row + 2 variants, audit entry written |
| Project-level restore | `Aster & Rye` restored (15 versions, 2 media, 1 customer); `Butter Tales™` byte-identical; no sessions restored |

Two warnings were reproduced faithfully rather than introduced by the restore:

- 12 `activity` rows reference projects that no longer exist (fixture data from
  deleted test builds). They are inert; the rest of the relationship checks pass.
- Some saved versions name media rows that were removed before version
  scrubbing existed. Restoring such a version now drops the dangling
  reference (empty photo block) instead of showing a broken image.

## Production procedure

1. Freeze writes, or accept a recorded RPO.
2. `wrangler d1 export plattr-studio --remote --output d1.sql`, import it into a
   fresh database, then run `bun scripts/verify-restore.mjs` on the imported file
   after converting it (the scrub and manifest steps are the same as
   `scripts/backup.mjs`; they only need a SQLite file).
3. Copy media with bucket replication, or `wrangler r2 object get --remote` for
   every key in `media/manifest.json`. Verify with
   `verifyMediaObjects` (the drill uses the same function).
4. Point the `DB` and `MEDIA` bindings at the restored resources and deploy the
   matching Worker version.
5. Run `/health`, one customer app smoke test, one owner sign-in.
6. Everyone signs in again; payment providers are reconnected; invitations are
   re-sent.
7. Record the incident, the backup stamp, and the RPO/RTO actually achieved.

## Frequency, retention, RPO/RTO

| Asset | Frequency | Retention | RPO |
| --- | --- | --- | --- |
| D1 | Before every deploy, and nightly | 7 daily, 4 weekly, 3 monthly | ≤ 24 h (≤ deploy time with a pre-deploy backup) |
| R2 media | Continuous replication, plus a nightly manifest | 30 daily, 12 monthly | ≤ 24 h |

RTO: 4 hours for a single-region restore; one business day if the Worker or
domain must be re-pointed. These targets assume the offsite copies exist; they
are operator configuration, not something this repository runs.

Retention in `scripts/backup.mjs` defaults to 7 stamped directories and can be
changed with `--retention`. Only directories this script wrote (a timestamp
name plus a manifest) are pruned.

## Recovery scenarios

| Scenario | How it is detected | Recovery action |
| --- | --- | --- |
| Missing original image | `verifyMediaObjects`: `object is missing` | Restore that object (and its variants) from the newest media backup; the key is in the report |
| Missing WebP variant | Size/content-type/dimension mismatch in `verifyMediaObjects` | Restore the variant from backup; no database change is needed |
| Database restored, bucket not | `verifyMediaObjects` reports every referenced object missing | Restore the bucket from the same backup stamp before sending traffic |
| Bucket restored, database not | 0 referenced objects, N `unreferenced` objects; no broken links | Point the database at the restored bucket only after the database restore; the extra objects are harmless |
| Interrupted backup | `verifyMediaBackup`: missing manifest, truncated object, checksum mismatch | Discard the incomplete stamp and run `scripts/backup.mjs` again |
| Interrupted restore | `restore.mjs` verifies before and after staging; a refusal leaves the target untouched | Fix the source or free space and re-run; the target is unchanged |
| Duplicate backup execution | Two stamped directories; table checksums identical | Keep both or prune; nothing is overwritten |
| Partial media deletion | `verifyMediaObjects` names the exact key | Re-run `restore.mjs` for that backup (idempotent) |
| Failed object deletion during cleanup | Cleanup keeps the metadata row and reports `failed` | Retry the same command; object deletes are idempotent |
| Database/object reference mismatch | `verify-restore` reports document references with no media row | Restore the database from backup, or delete the stale document version |

## Project-level recovery

```sh
bun scripts/restore-project.mjs <snapshot.sqlite> <target.sqlite> --token <24-char token>
```

This replaces one project's row and every table that carries its `project_id`
(documents, versions, media metadata, customers, orders and their items,
bookings, enquiries, notes, activity, notifications, payment records) inside one
transaction. Other projects are not touched. Deliberately excluded:
`owner_sessions` (no restored logins), `project_claims` (stale verification
tokens), and platform session/token tables.

To restore one project's photographs as well, restore its media from the same
backup with `restoreMedia(dir, bucket, { projectId })` (used by the drill).

## Known gaps

- No scheduled job, offsite bucket or cross-account replication is configured in
  this repository.
- Production D1 export/import and `r2 object get --remote` were not executed
  here; only the local equivalents were.
- `wrangler d1 export` produces SQL rather than a SQLite file; it must be
  imported into a database before the SQLite-level checks apply.
- The 12 orphan `activity` rows and the dangling references in old saved
  versions are source-data findings, reported above. They are not created by a
  restore.
