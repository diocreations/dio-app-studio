# Plattr acceptance — 20 November 2026

Commit `88b2f31` plus the review changes in this working tree. Local Worker at
`127.0.0.1:8795`, headless Chrome 157 driven through CDP on port 9223. Nothing
was deployed, no payment provider was activated, and production resources were
untouched.

## Executed

| Area | Command | Result |
| --- | --- | --- |
| Automated suite | `bun test` | **481 pass, 0 fail**, 5,291 assertions, 41 files |
| Typecheck | `bun run typecheck` | exit 0 |
| Production build | `bun run build` | exit 0 |
| Five flagship apps (batch 2) | `bun scripts/check-batch2-matrix.mjs` | **20/20** viewports ok — cafe, gym, clinic, property, studio at 320/375/390/430 |
| Five flagship apps (batch 3) | `bun scripts/check-batch3-matrix.mjs` | **20/20** viewports ok — trades, auto, ecommerce, courses, finance at 320/375/390/430 |
| Editor | `bun scripts/verify-batch3-editor.mjs` | **12/12** named checks ok |
| Save, reload, versions (batch 2) | `bun scripts/verify-batch2-docs.mjs` | **5/5** apps ok |
| Save, reload, versions (batch 3) | `bun scripts/verify-batch3-docs.mjs` | **5/5** apps ok |
| Abandoned-run sweep rules | `bun run backup:sweep:fixture` | **18/18** checks ok |

What the viewport matrix asserts, per app per width: page width equals the
viewport (no horizontal overflow), no broken images, every image has alt text,
no clipped navigation labels, no unlabelled controls, and no tap target under the
minimum size. Images per app ranged 5 (cafe) to 19 (ecommerce).

The editor pass asserts, on the live preview: tap-select, autosave of a title
edit, undo restoring it, add component, undo of the add, drag reorder persisting
order, hide persisting and the section disappearing from the published app, undo
unhiding, duplicate, delete, and version restore with 3 versions listed and the
section count returning to the baseline (7).

The document passes edit a title and a visibility flag, reload to confirm the
change persisted, then restore the original document from the version list.

The sweep fixture covers the recorded key list, a too-young pending run, a
verified run, an already-abandoned run, an unindexed prefix, a run with no
recorded list, a run claiming keys outside its prefix, and a second sweep that
must delete nothing.

## Not executed in this pass

| Item | Why |
| --- | --- |
| Remote backup run, readback, retention | Not re-run. No backup-path code changed this session; last remote evidence is `docs/qa/remote/REPORT.md`. The sweeper was dry-run against `plattr-staging-backups` this session (no pending runs, 0 deletions). |
| Remote restore and restored-app media delivery | Not re-run; same evidence. |
| Scheduled GitHub Actions run | Blocked: the repository has no git remote, and the `diocreations` GitHub account holds no Plattr repository (200 repositories listed, none matching). |
| Missed-heartbeat alert | Blocked: no monitoring account exists. |
| Screenshots | None captured this pass. The matrices are CSS-viewport checks, not visual review; prior captures remain in `docs/qa/`. |

## Related evidence

- Owner authentication over HTTPS after rotation: both staging Workers, wrong key
  401, derived key 303 with a session, dashboard API 200, 0 `owner_sessions` rows
  left. Recorded in the previous turn; no keys appear in any file in this
  repository.
- Backup and DR design: `docs/PRODUCTION_DISASTER_RECOVERY.md`.
- Staging identifiers: `docs/STAGING.md`.
