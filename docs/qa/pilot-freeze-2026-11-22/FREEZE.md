# Pilot baseline freeze

Date frozen: 22 November 2026, 09:41 UTC
Status: **FROZEN — no product changes during owner testing**

## Build identifier

| Field | Value |
| --- | --- |
| Build ID | `plattr-pilot-2026-11-22-50ed8bf-2331b6369062-dirty` |
| Package version | `1.0.0` |
| Git HEAD | `50ed8bf` |
| Working tree | 71 changed/untracked files; uncommitted, as required |
| Runtime source fingerprint | `2331b6369062dd760a229de279a5010f668d34a85a3c0925cf8798f4890b0a79` (65 files) |
| Dataset fingerprint | `bad9e57a526ce3132928123ac32c25e39ef1b62b8abbf8c2d25e9bedea6bf471` |
| Live local D1 SHA-256 at freeze | `74ebd39236e5d30e06ad033831810ce7fb6868398a645cc9edd90431b77d77e5` |
| QA evidence SHA-256 at freeze | `a45d6f95687a3a3bde9707e327ec7f1cf3d160534d2dedb5d5c841c4f6bb502f` (3,038 files) |

`-dirty` is deliberate and accurate: the pilot was built in an uncommitted
working tree. The source fingerprint, not the short commit, identifies this
exact code.

The live SQLite file is mutable: its SHA-256 is recorded at the freeze instant.
Later read-only access checks signed a test owner in and out, so the file page
hash can change while the 12-project dataset fingerprint stays identical.

The fingerprint covers `src/`, package/TS/lock/Wrangler config, including
uncommitted files. It deliberately excludes tests and QA scripts: those are
recorded by the change log and do not change the owner-visible build identity.
It does not change when only QA documents change. See `BASELINE.json` for the
full manifest.

One earlier QA artefact was regenerated during final freeze verification:
`pilot-clean-audit.mjs` rewrote `clean-project-audit.json` (new `generatedAt`)
and returned the same **12/12** result. The regeneration is logged in
`CHANGELOG.md`. Every other earlier benchmark/QA file is unchanged; the current
QA hash above is the post-verification value, not the pre-verification value.

## Frozen projects

All 12 are `in_review`; no owner approval or publication has happened.

| Business | Concept builds | Catalogue at freeze |
| --- | --- | --- |
| Yarmouth Oilskins | minimal, editorial, lifestyle | 74 items / 13 sections; 74 priced; 74 photo fields |
| Padella | editorial, modern, luxe | 0 dishes / 0 sections |
| Blue Tit London | minimal, editorial, luxe | 82 treatments / 1 section; 7 priced; 0 photos |
| Architecture for London | classic, minimal, editorial | 1 service / 1 section; unpriced; 0 photos |

Baseline also records per-project found/missing/question counts and confirms
**0 orders, 0 bookings and 0 enquiries** in every pilot project. Private access
tokens and owner cookies remain only in the ignored
`.chrome-qa/pilot-projects.json`.

## Recoverable copies

1. **Local backup directory**
   `.wrangler/pilot-freeze/2026-11-22T09-28-19-163Z/`
   - scrubbed database, full media, `manifest.json`;
   - manifest checksum
     `6c0489f023d8e58334849be92208c87182f4588820c7b7843141e478adec0da5`;
   - database SHA-256
     `bef96bbd04ad3d3584b2c3e91018dcc03bd625bdf05e8f56fb83b16bef62726b`;
   - 177 media objects, 951,268 bytes.
2. **Archive**
   `.wrangler/pilot-freeze-archive/plattr-pilot-2026-11-22-50ed8bf-2331b6369062-dirty.tar.gz`
   - 2.9 MiB;
   - SHA-256
     `6889442703cfd20a7232ddf47fcf73f16a3c056581fe167a8a5a0a3eb582eb3b`;
   - contains the backup database/media/manifest and the restore logs;
   - this document and `BASELINE.json` remain alongside it in the repository.

Both are inside the project but outside tracked source. They are on the same
machine: this is a recoverable local baseline, **not** disaster recovery. No
offsite copy is claimed.

The backup contains 398 historical/pilot projects, a superset of the 12. Only
the 12 pilot projects were fingerprinted for the baseline. Owner/platform
sessions and payment secrets are redacted by the backup design; owners sign in
again and a payment provider would need reconnecting.

## Restore proof

A restore was made into a disposable copy, not over the live database:

```text
backup  → .wrangler/pilot-freeze/restore-check/database.sqlite
media   → .wrangler/pilot-freeze/restore-check/state
verify  → restore verified
media   → 162/162 referenced objects present for 147 rows
dataset → restored hash equals live hash
```

The verifier reported 15 stored objects no row refers to and five document-media
references in one historical project. They are pre-existing historical storage
warnings outside the 12 pilot projects. The pilot projects have no local media
rows except those covered by the verified set; their dataset hash is identical.

A second check exercised the per-project restore path on a disposable copy: a
pilot project name was changed to `TAMPERED`, then
`scripts/restore-project.mjs` restored it to `Yarmouth Oilskins` with its media.
The exit status was 0. This is the reset path a moderator uses after a session.

The private access packs were verified separately: **12/12** projects accepted
their derived owner key, returned workspace/review/customer pages 200, and signed
the test session out with 303. Links and keys are separate mode-600 files in the
gitignored `.chrome-qa/session-access/` directory.

Restore commands for a recovery rehearsal:

```bash
# Full backup into a separate target; never point this at live state casually.
bun scripts/restore.mjs .wrangler/pilot-freeze/2026-11-22T09-28-19-163Z \
  --database .wrangler/pilot-freeze/restore-check/database.sqlite \
  --media-state .wrangler/pilot-freeze/restore-check/state

bun scripts/verify-restore.mjs \
  .wrangler/pilot-freeze/restore-check/database.sqlite \
  --manifest .wrangler/pilot-freeze/2026-11-22T09-28-19-163Z/manifest.json \
  --media-state .wrangler/pilot-freeze/restore-check/state
```

Restore one project after a session, leaving the other projects untouched:

```bash
bun scripts/restore-project.mjs \
  .wrangler/pilot-freeze/2026-11-22T09-28-19-163Z/database.sqlite \
  .wrangler/state/v3/d1/miniflare-D1DatabaseObject/017f96ff90c988f5b934d2789b404a0a0f513de2918297f1afba6b3581b20f80.sqlite \
  --token <project-token> \
  --media-backup .wrangler/pilot-freeze/2026-11-22T09-28-19-163Z/media \
  --media-state .wrangler/state
```

Stop the dev server before a direct database restore, then start it again. The
token is read from `.chrome-qa/pilot-projects.json`; never put it in a report,
chat, URL or recording.

## Freeze rules

1. No product, schema, styling, content or dependency changes while owner
   sessions are running.
2. A critical defect is the only exception. Record it in `CHANGELOG.md` with the
   reason, affected projects, owner impact, fix, verification and new build ID.
3. A code change invalidates this build ID. Re-run the affected tests, rebuild,
   take a new frozen copy and record the new ID before the next session.
4. Session edits must be removed by restoring the affected project(s) before the
   next owner, or by restoring the full frozen copy. Do not edit the frozen
   backup.
5. Do not publish, index, deploy, activate payments, crawl live sites or expose
   owner keys/source review to anyone outside the session.
6. Do not approve a pilot build in the owner's name. Approval is owner sign-off,
   not a test step.
7. New feature requests go into the session notes and final report, not into the
   frozen product.

## Integrity checks

Recompute the QA hash before and after the owner-testing phase. It must remain
`a45d6f95…bb502f`; only files under this freeze folder and the new session notes
may be added. The pre-regeneration hash is recorded in the change log for audit
traceability, not used as the current baseline.

The 12-project fingerprint must remain
`bad9e57a526ce3132928123ac32c25e39ef1b62b8abbf8c2d25e9bedea6bf471` while the
baseline is pristine. Any session edit naturally changes it until the project is
restored; record that in the session sheet and restore before declaring the
baseline intact.
