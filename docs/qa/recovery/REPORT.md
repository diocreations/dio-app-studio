# Recovery verification report

Run: 2026-11-20, local machine, `bun scripts/recovery-drill.mjs`.
Machine-readable result: [`restore-verification.json`](./restore-verification.json).
Procedure and policy: [`../../BACKUP_AND_RECOVERY.md`](../../BACKUP_AND_RECOVERY.md).

## Environment

| | |
| --- | --- |
| Source | local Wrangler state (Miniflare D1 + R2), `.wrangler/state` |
| Restored target | separate D1 file and bucket in `.wrangler/drill/state` |
| Worker under test | `bun run build`, served by `wrangler dev --persist-to .wrangler/drill/state` |
| Production | **not exercised** — needs Cloudflare credentials for `d1 export` and `r2 object get` |
| Source mutation | none; every scenario works on its own copy under `.wrangler/drill` |

## Snapshot

| | |
| --- | --- |
| Projects | 58 |
| Rows backed up | 1757 |
| Database file | 1,454,080 bytes |
| Database sha256 | `3c491ba0a1e962193d429086cc53c6ad7ed23109d6b70fb9d12c23f42308d257` |
| Tables | 38, all with counts and row checksums |
| Media | 36 objects (21 referenced, 15 unreferenced), 689 KB |
| Media checksum | `149fed9363aebb9d9179f99269123435d52511b56c4683622099fb97a9045374` |
| Sessions removed | 57 owner sessions |
| Secrets cleared | 1 payment connection secret |

## Results — 27/27

| # | Check | Evidence |
| --- | --- | --- |
| 1 | Backup integrity and redaction | 1757 rows, integrity `ok`, manifest sha256 |
| 2 | Sessions and payment secrets removed | 57 session rows, 1 secret column |
| 3 | Media backup complete | 36 objects, sizes, WebP dimensions and sha256 checked |
| 4 | Restore matches the backup exactly | counts + 38 table checksums identical |
| 5 | Restored database points at no missing media | 21/21 objects for 7 rows |
| 6 | Restored Worker answers `/health` | 200 |
| 7 | Restored customer app renders | 200, 207,652 bytes, business name present |
| 8 | Restored app links to its images | 4 image URLs |
| 9 | Restored image is real WebP | 200 `image/webp`, 4,714 bytes, RIFF/WebP header |
| 10 | Another project cannot fetch that image | 404 |
| 11 | Owner routes closed after restore | 401 without a session |
| 12 | Fresh owner sign-in works | 200 with a newly minted local session |
| 13 | Cleanup dry run reports without deleting | seeded upload listed; row and objects still present |
| 14 | Cleanup refuses without a backup id | 409 `backup_required` |
| 15 | Cleanup deletes row + every variant through the Worker | 1 deleted, 0 failed, objects gone |
| 16 | Cleanup records the deletion | audit entry with action `deleted` |
| 17 | Missing original image is caught | `object is missing: …/320.webp` |
| 18 | Missing/truncated variant is caught | `size mismatch: …/320.webp` |
| 19 | Interrupted backup is refused | `media manifest is missing` |
| 20 | Corrupted database bytes are refused | restore stopped before writing |
| 21 | Interrupted restore leaves the target untouched | target byte-identical |
| 22 | Database without bucket is reported | 28 missing objects named |
| 23 | Bucket without database leaves no broken links | 0 references, 36 objects retained |
| 24 | Partial deletion is found and repaired | 2 problems, repaired from backup, re-verified |
| 25 | Database/object mismatch is reported | document references with no media row |
| 26 | Duplicate backup execution | two stamps, 38 identical table checksums |
| 27 | One project restored, another untouched | `Aster & Rye`: 15 versions, 2 media, 1 customer restored; `Butter Tales™` unchanged; sessions unchanged |

Checks 17–26 each ran on a fresh copy of the backup; a failure in one cannot
mask another.

## Findings that are not restore failures

Both were present in the source backup and reproduced exactly:

1. **12 `activity` rows reference deleted projects.** Inert; produced by earlier
   test builds. Not created by the restore.
2. **Saved versions naming media rows deleted before version scrubbing existed.**
   Restoring such a version now drops the reference (`pruneMissingMedia`), so the
   result is an empty photo block, not a broken image.

## Not verified here

- Offsite/remote restore from Cloudflare.
- A scheduled backup job.
- Browser rendering of the restored app at multiple widths; the served page and
  its image bytes were checked with HTTP requests only.
