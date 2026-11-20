# Backup and disaster recovery

The current procedure, the rehearsed evidence and the recovery actions live in
[BACKUP_AND_RECOVERY.md](./BACKUP_AND_RECOVERY.md). This page keeps the original
summary and records what changed.

## Strategy

| Asset | Production mechanism | Offsite copy | Retention |
| --- | --- | --- | --- |
| D1 database | `wrangler d1 export` before every deploy and nightly via the host scheduler | Copy the export to a separate account/bucket with object lock | 7 daily, 4 weekly, 3 monthly |
| R2 media | Bucket replication to a second bucket/account, plus a nightly object listing | Replica bucket in another account/region | 30 daily, 12 monthly |
| Document versions | `doc_versions` (20 per project) | Included in the D1 backup | 20 versions per project |
| Worker code | Git history plus the provider deployment record | Git remote | Every commit |

**RPO:** ≤ 24 hours; ≤ the deploy time with a pre-deploy backup.
**RTO:** 4 hours for a single-region restore; one business day if the Worker or
domain must be re-pointed.

The repository cannot create provider buckets or remote exports without
Cloudflare credentials, so offsite storage is an operator step.

## Local rehearsal

The rehearsal is now `bun scripts/recovery-drill.mjs`. It backs up the local D1
file and R2 bucket, restores both into a separate disposable environment, serves
the restored copy with `wrangler dev --persist-to`, and exercises every failure
scenario. Results: `docs/qa/recovery/restore-verification.json` and
`docs/qa/recovery/REPORT.md`.

The earlier `scripts/d1-backup.mjs` / `scripts/d1-restore.mjs` commands still
work for a database-only snapshot. They now strip session tokens and payment
secrets and write per-table checksums; a raw copy of the database is no longer
produced by any script.

## What changed in this milestone

- Backups strip `owner_sessions`, `user_sessions`, `auth_tokens` and
  `invitations`, and blank `payment_connections.secrets`, with the redaction
  recorded in the manifest and re-checked after a restore.
- Every table's rows are checksummed, so a restore is compared exactly rather
  than by a handful of counts.
- Media is backed up object by object with size, WebP dimensions and sha256, and
  restored into a separate bucket.
- A restored database is verified against the bucket
  (`verifyMediaObjects`), which is the check a database-only backup cannot pass.
- One project can be restored without touching another
  (`scripts/restore-project.mjs`); sessions are never restored.
- Restoring an old document version no longer resurrects a reference to a
  deleted photograph.

## Production restore procedure

1. Freeze writes (maintenance mode or disable public write routes).
2. Export the current D1 and R2 state immediately, even if damaged, for forensic
   comparison.
3. Create a new D1 database, import the newest verified export, and verify it.
4. Restore the R2 replica into the production bucket or a replacement bucket.
5. Compare counts and checksums with the manifest; spot-check one order, one
   booking and one enquiry.
6. Point `DB`/`MEDIA` at the restored resources and deploy the matching Worker.
7. Run `/health`, a customer app smoke test, an owner sign-in and dashboard
   status transitions.
8. Revoke all owner sessions if credentials may have been exposed.
9. Record the incident, the backup id, and the RPO/RTO actually achieved.

## Known gaps

- No scheduled job is running in this repository.
- No offsite bucket or cross-account replication was provisioned here.
- Local Miniflare state is not a production backup.
- The restore was rehearsed locally, not from a remote production export.
