# Backup and disaster recovery

## Strategy

| Asset | Production mechanism | Offsite copy | Retention |
| --- | --- | --- | --- |
| D1 database | `wrangler d1 export` before every deploy and nightly via the host scheduler | Copy the export to a separate R2 bucket or account with object lock | 7 daily, 4 weekly, 3 monthly |
| R2 media | Bucket replication to a second bucket/account, plus a monthly object listing | Replica bucket in a different provider account/region | 30 daily, 12 monthly |
| Document versions | Existing D1 `doc_versions` (20 per project) | Included in the D1 export | 20 versions per project |
| Worker code | Git history plus the provider deployment record | Git remote | Every commit |

**RPO:** 24 hours for normal operation, 1 hour if the pre-deploy export succeeds.
**RTO:** 4 hours for a single-region database restore; 1 business day if the
Worker and domain must be re-pointed.

The repository cannot create provider buckets or remote exports without
Cloudflare credentials, so production offsite storage remains an operator step.
The scripts below provide a repeatable local rehearsal and a path that can be
wired to a scheduled job.

## Local rehearsal (performed)

Source database:
`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/017f96ff90c988f5b934d2789b404a0a0f513de2918297f1afba6b3581b20f80.sqlite`

```sh
node scripts/d1-backup.mjs <source.sqlite> .wrangler/backups 7
node scripts/d1-restore.mjs <backup.sqlite> /tmp/plattr-restore/restored.sqlite --force
```

The backup script uses SQLite's online `.backup`, runs
`PRAGMA integrity_check`, records a SHA-256 and table counts, and prunes older
snapshots. The restore script verifies the backup again, copies it to a staging
file, and only then replaces the target.

Result from the rehearsal:

- Backup: 450,560 bytes, integrity `ok`.
- SHA-256: `1bbd35230db77eb89d296b37a6a4c832e2b96d0290af6233376af3d2b9cae21e`.
- Restored separate copy: integrity `ok`; projects 37 → 37, orders 4 → 4,
  bookings 8 → 8, enquiries 6 → 6, media 7 → 7, document versions 28 → 28.
- Media snapshot: 476 KB gzip, 21 source blobs → 21 restored blobs, SHA-256
  `6f1d2e122b29ac458c34b1fafef7218f4d931a9e10b40e0b4402d5ba11dd0f7a`.

This is a database-plus-media restoration rehearsal in a separate target. It is
not a remote offsite restore; the remote bucket and scheduler are still operator
configuration.

## Production restore procedure

1. Freeze writes (put the app into maintenance or disable public write routes).
2. Export the current D1 and R2 state immediately, even if damaged, for forensic
   comparison.
3. Create a new D1 database and import the newest verified export.
4. Restore the R2 replica into the production bucket or a replacement bucket.
5. Run `PRAGMA integrity_check` and compare the manifest table counts; spot-check
   one order, one booking and one enquiry by id.
6. Point the `DB`/`MEDIA` bindings at the restored resources and deploy the
   matching Worker version.
7. Run `/health`, a customer app smoke test, owner login and dashboard status
   transitions.
8. Revoke all owner sessions with **Sign out everywhere** if credentials may
   have been exposed.
9. Record the incident, the backup id, the RPO/RTO actually achieved, and the
   cause.

## Retention and verification

- Keep the last 7 daily, 4 weekly and 3 monthly exports.
- Exercise one restore per month and record the counts and duration.
- Backups are encrypted at rest by the provider; the export contains customer
  contact details and must not be committed or left on a laptop.
- The `media` manifest and object count are part of every release record.

## Known gaps

- No scheduled backup job is running in this repository yet.
- No offsite bucket or cross-account replication was provisioned in this
  environment.
- R2's local miniflare state is not a production backup; use the provider
  replica for production media.
- The restore was rehearsed locally, not from a remote production export.
