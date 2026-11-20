# Media lifecycle

Plattr stores one row per upload in D1 and the WebP variants in the private R2
bucket. This document is the rule for every transition, including the only one
that destroys data: removing an upload nothing points at.

Code: `src/worker/media.ts` (upload, replace, delete, delivery),
`src/worker/mediaCleanup.ts` (orphan audit and deletion), routes in
`src/worker/index.ts`, operator command `scripts/media-cleanup.mjs`.

## 1. Upload

1. The browser decodes the original, re-encodes WebP variants at 320/640/1280
   (whatever fits) and posts the original plus the variants.
2. The Worker validates magic bytes, dimensions, byte size, the number of files
   and the per-project quota again. SVG is unsupported.
3. Only the WebP variants are written to R2, content-addressed:
   `projects/<projectId>/media/<sha256-of-original>/<width>.webp`. The original
   file is never stored.
4. `media` gets one row: project, hash, original dimensions, total variant bytes,
   alt text, focal point, `variants` JSON (width/height/bytes), `created_at`.
   `(project_id, hash)` is unique, so re-uploading the same photograph to one
   project returns the existing row instead of a duplicate.

Object keys include the project id, so two businesses can hold the same
photograph without sharing an object, and a key can never resolve across
projects. The delivery route is scoped by token and returns 404 for another
project's media id.

## 2. References

A media id is in use when it appears in:

- the current document (`projects.doc`), any node's `media.id`;
- **any saved version** (`doc_versions.doc`, up to 20 per project);
- the business specification (`projects.spec`), which carries catalogue item
  photographs (`menu[].items[].media`) and offers (`offers[].media`).

`collectMediaIds` walks every stored value, so a reference is found wherever it
nests. A write path also rejects a document or catalogue that names another
project's media id (`invalid_media_reference`, 422).

## 3. Replace

Replacing an upload keeps its id and rewrites the bytes. Old variant objects are
deleted only when no other row in the project shares the old hash. References
keep working; every rendered size picks up the new file.

## 4. Delete one upload (owner action)

`DELETE /api/projects/:token/media/:id` refuses while the current document or
the catalogue names the image (`in_use`, 409). Otherwise it removes references
from retained versions (so restoring one shows an empty photo block rather than
a broken image), deletes the variant objects, then the row.

Restoring an old version that names an image deleted since it was saved also
drops that reference (`pruneMissingMedia`), so a restore cannot resurrect a
broken image.

## 5. Orphan audit and cleanup (operator action)

Two stages, both through the Worker so the bucket binding does the deletion.

### Stage A — audit (read-only)

`POST /api/projects/:token/media/cleanup` with `{"dryRun": true}` (the default)
returns:

- every media row nothing references and that is older than the grace period;
- for each: age, total bytes, and the exact object keys that would be deleted;
- rows it will not touch and why (`inside the 24h grace period`, `metadata could
  not be read`, `shares a stored object with another upload`);
- the reference sources it read (current document, number of versions,
  specification).

The grace period is at least 24 hours (`clampGraceHours`); a caller cannot
shorten it. That protects a photograph removed and re-added in one editing
session.

### Stage B — cleanup (explicit)

`POST /api/projects/:token/media/cleanup` with:

```json
{ "dryRun": false, "confirm": true, "backupId": "<verified backup checksum>", "graceHours": 24 }
```

`--ids` narrows the run to ids from a previous report. The route requires:

- an owner session (the same middleware as every other project API route) and a
  same-origin request;
- `confirm: true`;
- a non-empty `backupId`, which is copied into every audit entry. Without a
  verified backup, the answer is `backup_required` (409) and nothing is deleted.

### Safety rules, in the order they run

1. Re-read the current document, the specification and **every** saved version
   immediately before each deletion. A version that cannot be parsed aborts the
   whole run (`reference_check_failed`); the operation never guesses.
2. Anything referenced is skipped, not deleted.
3. Rows are scoped to the project. Another project's upload is never a candidate
   and cannot be named by id.
4. A row whose variant keys are shared with another row is skipped.
5. Delete each stored variant, then read it back. If any object remains, the
   metadata row **stays** and the item is reported as failed.
6. Only after every object is confirmed gone is the row deleted.
7. Write one audit entry per outcome (`deleted`, `failed`, `skipped`) with the
   run id, the backup id, the object keys and the bytes.

### Idempotent and recoverable

- Object deletes are idempotent; a retry finishes a partial run.
- A retried id that is already gone reports `already removed`.
- A run interrupted after objects but before the row leaves a row with missing
  objects; the next run deletes it (the object delete succeeds trivially).
- Every deleted key is in the audit log and in the newest media backup, so the
  bytes can be restored with `restoreMedia(dir, bucket, { projectId })` or by
  copying `media/objects/<key>` back.

Audit entries are readable at `GET /api/projects/:token/media/cleanup`.

### Operator commands

```sh
# Stage A
bun scripts/media-cleanup.mjs --token <24-char token>

# Stage B, against a verified backup
bun scripts/media-cleanup.mjs --token <token> --apply \
  --backup .wrangler/backups/<stamp>/manifest.json

# A local, read-only cross-check that does not need the Worker
bun docs/qa/apps/scripts/audit-media.mjs
```

## 6. Objects with no metadata row

The bucket can hold objects no `media` row names (for example leftovers from an
older build, or an old variant after a failed replace). They are reported by
`verifyMediaObjects` and included in every media backup, but the cleanup command
does not delete them: there is no row to audit, and a key without metadata is
not proof that nothing can want it. Treat them as an investigation item, not a
cleanup item.

The rehearsal bucket had 15 such objects out of 36; 21 belonged to the 7 media
rows and all 21 were present and byte-correct.

## 7. Backup and restore

`scripts/backup.mjs` reads every media row and every stored variant, checks the
size, WebP magic bytes and recorded dimensions, and copies the bytes to
`media/objects/<key>` with a sha256 per object. A backup that finishes therefore
has no missing objects. `scripts/restore.mjs` verifies those hashes again and
writes them into a separate bucket; `scripts/verify-restore.mjs` proves that the
restored database points at no missing media.

Details and the failure-scenario table are in
[BACKUP_AND_RECOVERY.md](./BACKUP_AND_RECOVERY.md).

## 8. What the owner sees

When a saved component cannot draw itself (a coaches block on a gym with no
team, a visit block with no hours), the document save hides it and records
`hiddenBecause: "empty"`. The editor:

- shows a toast: *“One section was hidden automatically: it has nothing to show
  yet”*;
- labels the row `· auto-hidden` in the component list;
- explains it in the inspector when selected;
- adopts the saved document, so the page and the server agree.

Showing it again is allowed, but saving re-hides it until the business has
something to put there. Once the data exists, the next save leaves it visible and
the reason is cleared. `docs/qa/apps/scripts/run-autohide.mjs` drives this in a
real browser (6/6 checks).
