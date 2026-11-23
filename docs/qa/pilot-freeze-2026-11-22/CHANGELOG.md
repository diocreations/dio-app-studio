# Pilot change log

Frozen build: `plattr-pilot-2026-11-22-50ed8bf-2331b6369062-dirty`

This log starts at the freeze. Earlier preparation changes belong to the
supervised-pilot report and are not retroactively added here.

## Rule

During owner testing, the default is **no change**. Only a critical defect may
justify a product change. Each entry must state:

- date and session/owner affected;
- exact change and why it was necessary;
- whether it changes owner-visible behaviour, data, or only QA material;
- affected projects and build ID;
- tests/checks run and result;
- whether the baseline copy and build ID were refreshed;
- who approved the exception.

Non-critical usability issues and feature requests are recorded in the session
notes and deferred to `HUMAN-TESTING-REPORT.md`.

## Entries

| Date | Change | Reason | Impact | Verification | Re-freeze |
| --- | --- | --- | --- | --- | --- |
| 2026-11-22 | Created frozen baseline: `BASELINE.json`, `FINGERPRINTS.txt`, local backup, archive, restore proof | Preserve the 12 clean projects and QA evidence before any owner session | None to the product; QA/recovery artefacts only | 12/12 projects fingerprinted; restored dataset hash matched live; restore verified | Yes — build `plattr-pilot-2026-11-22-50ed8bf-2331b6369062-dirty` |
| 2026-11-22 | Added `scripts/pilot-freeze.mjs` and this freeze/report/session pack | Make the baseline and sessions reproducible and auditable | None to owner-visible product behaviour | Script run against live and restored D1; 12 projects and identical dataset hash | Included in the frozen build ID |
| 2026-11-22 | Build identity narrowed to shipped runtime source; per-business concept sheets generated | Do not let QA-only scripts change the product identity; keep each owner from seeing another business's links | No owner-visible behaviour; privacy improvement in session setup | Source fingerprint excludes tests/QA scripts; 4 sheets contain one business each; dataset hash unchanged | Yes — ID `plattr-pilot-2026-11-22-50ed8bf-2331b6369062-dirty` |
| 2026-11-22 | Session preparation documents and result templates added | Prepare four moderated sessions without changing the product | QA documents only | No application files changed | Not required |
| 2026-11-22 | Re-ran `pilot-clean-audit.mjs` during freeze verification; it regenerated `clean-project-audit.json` with a new `generatedAt` | Confirm all 12 projects and owner views still worked on the loopback server | QA artefact only; 12/12 result unchanged, no product or project-data change; pre-regeneration QA hash `9e13d330…e8ff23` superseded by `a45d6f95…bb502f` | 12/12 audit passed; frozen dataset hash unchanged | No — source/build unchanged; `BASELINE.json` QA hash refreshed |

## Awaiting entries

No owner session has been run. No post-freeze product change has been made.

When a session is run, add:

1. a row for the session itself (date, business, owner alias) — not secrets;
2. a row for every product change, if any;
3. a row for the post-session restore, with the restored project and result;
4. the new dataset/build ID if the baseline was intentionally refreshed.
