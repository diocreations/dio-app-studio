# Data cleanup review

Date: 20 November 2026

Three leftovers were found while auditing media and document lifecycle. This
review establishes ownership, references and recoverability for each, and changes
nothing. **No row and no object was deleted.**

Reproduce with:

```bash
bun scripts/data-cleanup-review.mjs          # read-only, writes the JSON below
```

Machine-readable output: `docs/qa/recovery/data-cleanup-review.json`.

Snapshot: 58 projects, 7 media rows, 130 stored versions, 36 bucket objects (21
referenced), 38 tables.

## 1. Twelve activity rows with no project

| Field | Value |
| --- | --- |
| Rows | 12 |
| Kind | `build`, label `First build generated` |
| Created | 2026-11-18, 08:19–11:41 |
| Owner | A project id that no longer exists in `projects` |
| Referenced by | Nothing: `activity` is a leaf table, and the project id it names is gone |
| Recoverable | Yes — present in every database backup taken before any deletion, and the event text is generic |

These are build events for projects that were deleted without their activity
rows. The delete path removes the project's notes and activity, so they came from
an earlier path (a hand-run `DELETE`, or a project deleted before that cleanup
existed). They cannot become valid again: a new project gets a new id.

**Recommendation: delete after approval.** They are orphan audit noise, and
keeping them makes "first build generated" counts wrong. Do it only on top of a
fresh verified backup:

```sql
-- after a verified backup and a copy of the database
DELETE FROM activity
WHERE project_id NOT IN (SELECT id FROM projects)
  AND kind = 'build'
  AND label = 'First build generated';
-- expect 12
```

## 2. Thirty-eight stored versions naming media that no longer exists

| Field | Value |
| --- | --- |
| References | 38, one per version, across 38 versions in 6 projects |
| Projects | Butter Tales 8, Good Day Cafe 7, Halo Hair Studio 7, Iron Yard 7, Dishoom 7, Aster & Rye 2 |
| Ownership | The project owns the version; the media row it names is gone |
| Referenced by | The version's own document JSON only |
| Recoverable | The version is intact; the image is not. It is not in another project either (checked: 0 of 38 exist elsewhere) |

These are historical versions saved while a photo existed, after the photo was
deleted or replaced. They are invisible to owners: the editor shows the current
document, and restoring an old version already drops a missing reference and
renders an empty photo block. `verify-restore.mjs` reports them as warnings, not
failures.

**Recommendation: leave them for now, repair only as part of a restore.** They
block nothing, and rewriting 38 historical documents for cosmetics is a worse
trade than tolerating a warning. If they should be cleaned, do it on a copy first
and compare the documents before and after:

```text
1. copy the database (VACUUM INTO)
2. for each saved version, drop media refs whose id has no media row for that project
3. diff the parsed JSON of each changed version
4. apply only if every change is a removed ref and nothing else
```

This is the same operation the restore path performs at read time, so a future
`restore-project.mjs` run produces equivalent results without a migration.

## 3. Fifteen bucket objects with no media row

| Field | Value |
| --- | --- |
| Objects | 15, 217,160 bytes total |
| Keys | `projects/<project>/media/<hash>/<width>.webp` under 5 projects, 3 variants each |
| Projects | `prj_0186bead…`, `prj_2e31f516…`, `prj_a53d091e…`, `prj_b8d0b17b…`, `prj_dd887df0…` — all still exist |
| Same hash as a live row | No (0 of 15) |
| Referenced by any document | No |
| Recoverable | Yes, from a local `scripts/backup.mjs` snapshot, which copies unreferenced objects too. **Not** from an offsite run: `scripts/offsite-backup.mjs` copies only the variants a `media` row names, so these 15 are outside every offsite backup until a bucket-wide copy job exists |

These are the three stored widths of five photos whose `media` row is gone: an
upload that was replaced or deleted, leaving its bytes behind. They are the
clearest case of data that is neither owned nor referenced.

They are also the one case the cleanup endpoint cannot handle: `POST
/api/projects/:token/media/cleanup` deletes *rows* and their variants, and these
have no row, so it will never see them. Deleting them needs a bucket listing,
which `wrangler r2 object` does not provide (only get/put/delete), so it must be
done from the Cloudflare dashboard or with an R2 API/SDK listing.

**Recommendation: do not delete yet.** First confirm a media backup that contains
them verifies (it does today), and prefer a scheduled bucket copy so the bytes
have a second home before one copy is removed. R2 exposes no replication rule to
enable; see `docs/PRODUCTION_DISASTER_RECOVERY.md`. Then delete from a listing
that proves each key has no row and no document reference, and record the keys in
`media_cleanup_log` if the deletion goes through application code.

## Summary

| Finding | Count | Owner | Recoverable | Action |
| --- | --- | --- | --- | --- |
| Activity with no project | 12 | None | Yes (backups) | Delete after approval, on a verified backup |
| Versions naming deleted media | 38 | Project | Version yes, image no | Leave; restore already tolerates them |
| Objects with no media row | 15 (217 KB) | Project prefix, no row | Yes (media backups) | Keep until a bucket copy job exists |

None of the three is a correctness bug in the current app: no owner sees a broken
page, and the store and editor work. They matter because they make counts and
"is this safe to delete" harder to answer, which is exactly what a cleanup
decision must not be.
