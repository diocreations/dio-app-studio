# Release commit audit — `ba7e6be`

Audited: 22 November 2026  
Commit: `ba7e6be261f2421dd9966a1f0302846570b64971`  
Parent: `50ed8bf44b4ec469b7040df19260fc17e537915d`  
Deployment under test: `7f3f33af-b49a-4d69-993b-46e31269a087`

## Verdict

The commit is the source of the live release, but it is not a minimal URL-first
release commit. It contains the URL-first product work, deployment support, a
large set of local QA scripts, and several adjacent product fixes that are not
described by the commit title.

Nothing in this audit changes the deployed release. `ba7e6be` must remain the
source under test until production acceptance is complete.

## Composition

| Group | Files | Added | Deleted |
|---|---:|---:|---:|
| Worker runtime source | 28 | 4,583 | 688 |
| Tests | 20 | 2,204 | 31 |
| New local QA scripts | 23 | 4,839 | 0 |
| Modified QA harness scripts | 2 | 41 | 9 |
| Deployment build support | 2 | 37 | 3 |
| **Total** | **75** | **11,704** | **731** |

The 23 new QA scripts are:

- `scripts/concept-diversity-audit.ts`
- `scripts/generation-benchmark.mjs`
- `scripts/generation-benchmark-{capture,editability,editor,persistence-audit,recovery-capture,remediation,seed}.mjs`
- `scripts/lifecycle-auth-audit.mjs`
- `scripts/pilot-{acceptance,access-pack,access-verify,clean-audit,concept-sheet,freeze,projects-seed}.mjs`
- `scripts/regeneration-ui-audit.mjs`
- `scripts/release-readiness-{catalogue,hotel-trade,journey,pwa,visual}.mjs`

They are not referenced by `package.json`, the Vite build, the Worker runtime or
the deployment manifest. They are local QA tools that write to `docs/qa/` and
`.chrome-qa/`. The two modified QA harnesses are
`scripts/acceptance-browser.mjs` and `scripts/acceptance-seed.mjs`.

`scripts/generation-benchmark-persistence-audit.mjs` alone is 730 lines.
`tests/lifecycleAudit.test.ts` is another 650 lines of broad route/auth coverage;
it is useful, but it is not URL-first acceptance and should not be part of a
minimal release commit.

No hard-coded production keys or secrets were found in the added QA scripts.
The scripts that need `OWNER_SECRET` read it from `.dev.vars` and do not print it.

## Adjacent product changes

These runtime changes are real product changes, but they are not explained by
the commit title:

- `src/worker/business.ts` and `src/worker/views/dashboard.ts`: hotel bookings,
  nightly room rates and room validation.
- `src/worker/views/dashboard.ts`: customer action labels and optimistic version
  handling for catalogue saves.
- `src/worker/views/editor.ts`: media-library race handling, action-block
  inspector behaviour and catalogue recovery UI.
- `src/worker/photos.ts`, `src/worker/flagshipImages.ts`,
  `scripts/postbuild.mjs` and `deploy.json`: staged asset selection for the
  hosting size limit.

Some of these support source persistence and the URL-first review. The hotel
booking work in particular should be split into its own commit and covered by
its own acceptance evidence.

## Deployment support

`deploy.json` changes the assets directory to `dist/client-deploy`.
`scripts/postbuild.mjs` stages that directory, removes source maps/build
metadata, drops wide images for trades outside the four launch trades, and
enforces a 10 MiB asset limit. These changes are necessary for the deployed
release and should remain.

## Cleanup recommendation

Do not rewrite or amend `ba7e6be` before acceptance. The live deployment is
traceable to it, and the production run has not happened yet.

After the current release is accepted and its rollback point is confirmed:

1. Move the local QA scripts out of the release commit/tree or into a dedicated
   QA branch. They do not affect the Worker or asset bundle.
2. Split the hotel-booking and dashboard/editor adjacent fixes into their own
   reviewed commits with focused tests.
3. Keep the deployment/build support and URL-first runtime changes together.
4. Rebuild and verify the Worker and asset hashes before any redeploy. A
   cleanup commit that only removes QA scripts should leave both hashes
   unchanged; a redeploy still requires the rollback point and a new deployment
   record.

This audit is about release hygiene, not a claim that the live release is
broken. The production GeeStores acceptance remains the gate.
