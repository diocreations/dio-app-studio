# Plattr Stage 1 — URL to profile to three concepts

**Date:** 2026-11-23 (UTC)  
**Source commit:** `ac5f8aa44de15d5f18bd625e73e7bb9512a27c1f`  
**Base:** `fba3bed` (its `src`, `tests` and `deploy.json` were identical to production source `ba7e6be`)  
**Audit base:** `860e4e3` — verified ancestor of `ba7e6be` and of this commit  
**Deployment:** none. Production release `7f3f33af-b49a-4d69-993b-46e31269a087` and rollback `ab5bec21-11e9-47f2-9fa0-e3a2ee43e7d3` remain unchanged.

## Source reconciliation

- `git merge-base 860e4e3 ba7e6be` = `860e4e30acc561790296d76c3d0b0539d0a3f742`.
- `ba7e6be261f2421dd9966a1f0302846570b64971` is an ancestor of this commit.
- At the pre-change tree, `git diff --quiet ba7e6be fba3bed -- src tests deploy.json` exited 0: the source under test was the deployed URL-first implementation, not the older audit baseline.
- The work therefore builds forward from the current tree. `860e4e3` was not checked out and the deployed release was not overwritten.

## Files and components changed

| File | Change |
| --- | --- |
| `src/worker/views/start.ts` | Discovery now scrolls to `#discovery` (the extracted profile) instead of jumping to `#concepts`; the source line wraps by word instead of breaking words at 390px. |
| `tests/generation.test.ts` | Added a regression check that the URL-first landing target is the profile, not the concept cards. |
| `scripts/audit-trades.mjs` | Stage 0 harness now measures 430px and duplicate visible labels. |
| `scripts/capture-stage1-url-first.mjs` | Reproducible Stage 1 evidence run: real URL, profile facts, all three concept iframes, choose action and owner workspace. |

No authentication, data-isolation, publishing or payment code was changed.

## Real URL-first journey

**Website used:** <https://geestores.com/>

The final run read the live site, not a fixture:

| Fact | Value |
| --- | --- |
| Business | GeeStores |
| Category | Jewellery shop |
| Pages read | 10 |
| Catalogue entries | 100 |
| Priced entries | 100 |
| Currency | INR |
| Photographs read | 69 |
| Phone | 918075257652 |
| Email | info@geestores.com |

The count varied between live crawls (earlier runs saw 8/93/60 and 10/99/66). That is the live site, not a fixed fixture; the report stores the facts from the final run.

The result is directly rendered from the same discovery payload:

| Concept | Direction | Screens | Images |
| --- | --- | ---: | ---: |
| Minimal boutique | Hairlines, list rows, quiet type; catalogue first | 6 | 67 |
| Gallery retail | One piece per row, large imagery, editorial pacing; image first | 6 | 67 |
| Contemporary lifestyle | Soft, photographic, roomy; narrative lead | 6 | 67 |

All three previews use the same private draft token (`/p/83c4813f64906ddf2765161a/app?concept=…`). Choosing **Minimal boutique** opened the owner workspace at `/p/83c4813f64906ddf2765161a`, titled **“GeeStores · build v2”**. No second project was created.

## Evidence at 390px

- [Before — URL-first landing](qa/stage1-url-first-2026-11-23/before-390.png)
- [After — extracted profile](qa/stage1-url-first-2026-11-23/after-profile-390.png)
- [Concept 1 — Minimal boutique](qa/stage1-url-first-2026-11-23/concept-1-390.png)
- [Concept 2 — Gallery retail](qa/stage1-url-first-2026-11-23/concept-2-390.png)
- [Concept 3 — Contemporary lifestyle](qa/stage1-url-first-2026-11-23/concept-3-390.png)
- [Chosen concept — owner workspace](qa/stage1-url-first-2026-11-23/chosen-workspace-390.png)
- [Journey record](qa/stage1-url-first-2026-11-23/journey.json)

The after-profile capture shows the profile before the cards. The page's own transition lands at `scrollY=622`, with the discovery top at 90px and the concept section at 1582px in the 390px viewport.

## Tests executed

| Check | Result |
| --- | --- |
| `bun test` | **762 pass, 0 fail**, 7,332 assertions, 63 files |
| `bun run typecheck` | **pass** (app and worker tsconfigs) |
| `bun run build` | **pass** (Worker + client; 5.6 MiB deploy assets) |
| Stage 1 journey | **pass** — profile + 3 concepts + choose + owner workspace |
| Stage 0 baseline | **27 trades, 606 checks, 31 known failures**; no overflow failures at 320/390/430 |

The full suite includes the existing payment, auth, owner-session, isolation and publishing tests; all passed. No deployment was attempted.

## What this proves

- A real website URL is the only input.
- The extracted profile is shown first; no extracted field is requested again.
- Three concepts are generated from that same read, with different home screens, navigation and compositions.
- Choosing a concept preserves the same saved draft and opens its owner workspace.
- The same profile facts, catalogue counts and photography flow into all three previews.

## Known limitations and honest assessment

1. **No model step yet.** Stage 1 remains deterministic extraction and composition. The approved grounded model step needs a provider, per-generation cost and budget proposal before any paid call or integration; this run made none.
2. **JavaScript-only sites remain unsupported.** No external rendering service was added. Incomplete extraction must be reported rather than filled in.
3. **The lifestyle concept is the weakest of the three at 390px.** Its first viewport is text-led and only reveals a real product photograph near the fold. It is structurally distinct and uses only the business's own photography, but the visual result is not yet premium. This is a design follow-up, not a reason to call the set finished.
4. **The live site's counts vary between crawls.** The final evidence records 10 pages / 100 entries / 69 photographs; earlier runs differed. No fixture was substituted.
5. **Five images per concept have an empty `alt` attribute.** They are the decorative business logo and product-card images that sit beside the product name. Every concept rendered all 67 images without a failed load; empty alt is an accessibility follow-up, not fabricated content.
6. **The local D1 daily/visitor counters were reset for the final QA capture.** This is local test state only; production counters and data were not touched.
7. **No premium claim.** The screenshots show real, structurally different apps; they also show the remaining visual and content gaps recorded in Stage 0.

## Next stage

Before Stage 2, report the proposed grounded model provider, cost per generation and budget for approval. The next design work should start from the Stage 0 failures: trade-specific data models and real photography for the twelve unphotographed trades, then the gym duplicate label and touch targets.
