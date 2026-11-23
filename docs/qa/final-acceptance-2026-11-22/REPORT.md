# Plattr — Final Recovery Acceptance and Persistence Audit

**Date:** 22 November 2026  
**Scope:** owner-review persistence, regeneration safety, customer-facing accuracy, five saved benchmark businesses, and three-concept diversity.  
**Verdict:** the audited behaviour passes locally. This is **not** a production-readiness claim.

This report is separate from, and does not replace, the earlier benchmark, remediation and recovery reports. Those reports and the saved crawl evidence were not modified.

---

## 1. What was run

| Check | Result |
|---|---|
| HTTP acceptance harness (`generation-benchmark-persistence-audit.mjs`) | **526 passed, 0 failed** |
| Browser conflict-resolution UI (`regeneration-ui-audit.mjs`, headless Chrome over CDP) | **13 passed, 0 failed** |
| Unit and integration suite (`bun test`) | **730 passed, 0 failed** |
| TypeScript (`bun run typecheck`, app and worker projects) | **clean** |
| Concept-diversity audit (`concept-diversity-audit.ts`) | **4 of 5 sites pass**; Padella `editorial/luxe` fails, reported below |
| Live crawls, paid AI, payments, deployment, commit, push | **none performed** |

The 526 checks are not 526 unrelated scenarios. Each of the five businesses has three saved concept builds (15 apps in total), and each site-level workflow was exercised on all three builds. Fresh-session checks account for 90 of the 526 (six per app).

### Evidence files

- `docs/qa/final-acceptance-2026-11-22/results.json` — every HTTP check, its site, name, pass/fail and detail.
- `docs/qa/final-acceptance-2026-11-22/regeneration-ui.json` — browser conflict checks and the plan used.
- `docs/qa/final-acceptance-2026-11-22/concepts.json` — per-pair styling/layout/IA/journey measurements and validator result.
- `.chrome-qa/generation-benchmark-apps-audit.json` — tokens and owner cookies for the 15 audit apps. This file is test data, not customer data.

### Fixture provenance and a correction to the earlier seed

The earlier benchmark seed defaulted to the concept specification, which does not carry `priceEvidence`, variants or images. That made an evidence audit impossible to run honestly. For this acceptance only, 15 new audit apps were seeded with `BENCH_EVIDENCE=1`, which builds from `report.site.menu` in the saved recovery reports. The previous apps, reports and recovery artefacts were left alone.

The audit apps were not pristine after repeated acceptance runs: owner corrections accumulate by design. The counts in this report are the saved-evidence baseline and the final accepted state, and the audit re-established the empty-menu, empty-room, no-treatment-image and unpublished-portfolio baselines before the recorded run. No additional build was created for the final run.

---

## 2. Source-review persistence

### 2.1 Lifecycle exercised

For each of the 15 apps the harness:

1. Read the saved catalogue through the owner review page.
2. Identified the verified, uncertain/no-price and rejected portions of the review.
3. Saved an owner correction through the same endpoints the dashboard uses.
4. Confirmed the correction and its owner provenance before closing the session.
5. Closed the owner session and confirmed the old cookie is rejected.
6. Opened a fresh owner session.
7. Re-read the review, the saved catalogue, the customer app and its public payload.
8. Confirmed the correction, its date, the original website reading and the fact that the item is still owner-supplied, not website-verified.

The review page lists verified rows, owner-supplied rows, uncertain readings and rejected/information rows with their destinations. The audit asserted those sections and counts, and that rejected rows never appear as customer catalogue rows. It read each review page; it did not click every individual row in every app.

### 2.2 Record types

| Record type | Lifecycle evidence |
|---|---|
| **Product** | Yarmouth's 74 products; a price and description correction; variant and image data preserved; fresh session retains both. |
| **Service** | AFL's build service and Blue Tit's treatment catalogue; owner price/copy corrections; no invented website evidence for an owner-created row. |
| **Portfolio** | AFL's six website projects start as **suggestions**; they are not in the customer app until the owner publishes them. One title and description were edited and persisted as owner work. |
| **Business information** | Yarmouth's address and phone correction persisted through the fresh session and reached the customer app. |

### 2.3 Results

- **Fresh sessions:** 15 of 15 apps retained the correction, the catalogue, the owner provenance and the original source reading. A closed session was rejected in all 15.
- **Owner provenance:** corrections store `method: 'owner'`, a dated `ownerAt`, and a `SourceTrail` holding the original source snapshot, the latest source reading and the owner's decision history.
- **Not silently upgraded:** the audit checks the owner method and the absence of a website-verified conclusion. The original website reading remains available in the trail and in the review UI even after the owner replaces the visible value.
- **Original evidence available:** `sourcePriceEvidence` and the trail's original snapshot survive owner edits and fresh sessions.
- **Duplicate save:** saving the same correction twice adds no duplicate row and keeps the first source snapshot.
- **Repeated edits:** the original source value is retained, the owner's latest value wins, `ownerAt` advances, and the earlier decisions stay in the trail.
- **Deletion and restoration:** deleting an owner-created row removes it; restoring it brings back the owner value and owner provenance, not a website claim.
- **Conflicting source values:** where a new source reading differs from the owner value, the difference is stored as a conflict and the owner must choose. This is covered by unit tests and the browser UI (Section 3); it is not covered by a live re-crawl (Section 8).

### 2.4 What "fresh session" means here

The owner-key login route could not be re-run because the harness does not hold the operator's owner key. The audit ends a session through the product's logout route and creates the next session by inserting the same `owner_sessions` row the successful login handler creates. This proves session-scoped persistence and old-cookie rejection, but **does not re-test the owner-key check or the login form**. That limitation is carried into Section 8.

---

## 3. Regeneration safety

### 3.1 Model

A catalogue item now carries a `SourceTrail`:

- `original` — the first source snapshot: value, method, source, raw reading, currency and validation.
- `latest` — the most recent source reading seen for that field.
- `ownerAt` — when the owner first corrected the field.
- `decisions` — each explicit owner/source choice, both readings and the time.

Owner edits are marked on the field (`ownerFields`) and on the trail. A re-import differences by `sourceId`, then `id`, then the original name, then the current name, so an owner rename does not lose the item. A conflict is recorded only when the incoming source reading differs from the owner's value for a field the owner has corrected.

### 3.2 Safety rules verified

- **No automatic replacement.** A re-import never writes an owner-corrected price, description or image without an explicit `source` resolution. With no resolution, the owner's value remains.
- **Explicit choice.** The dashboard shows both readings, the owner's saved date and a choice for each field: keep the owner's value or use the site's. Neither option is preselected.
- **Only chosen fields are applied.** The browser test captured the apply request and confirmed it contained only the owner's selected resolution; an unresolved description stayed the owner's.
- **The owner's photo is locked.** A re-import cannot replace an owner-uploaded image; there is no approval checkbox for it.
- **Ordinary additions remain normal approvals.** A field the owner never corrected still follows the ordinary changed-field approval path.
- **Repeated checks do not nag.** After the owner resolves a conflict, a later check against the same source no longer presents it as unresolved.
- **Concept previews write nothing.** Fifteen checks loaded a different concept for each app and compared the saved catalogue before and after. Nothing changed.

### 3.3 Browser evidence

The 13 browser checks used a saved import plan stubbed at `/import/check`, because a new crawl was prohibited. They verified:

- two conflicts rendered, with four choices (two fields × two sides);
- neither side preselected;
- both readings and the correction date visible;
- owner-corrected fields are not ordinary approval checkboxes;
- the owner image has no checkbox;
- an ordinary addition is still pre-approved;
- applying a chosen owner value sends only that field;
- an unresolved field is left alone;
- choosing the website value is a separate, explicit decision;
- applying with no decisions changes no owner field.

The server-side diff/apply logic behind that plan is covered by unit tests: price and description conflicts, revert/clear, duplicate saves, repeated edits, renames, deletion/restoration and owner image protection.

### 3.4 Regeneration limit

There is no live, end-to-end "crawl the site again, then apply" run in this acceptance. The plan passed to the UI was saved evidence shaped like a real re-import, and the server functions were unit-tested, but the socket between a fresh crawl and the apply route was not exercised. This is the most important remaining verification gap.

---

## 4. Customer-facing accuracy

For all 15 apps and their 15 concept previews the audit checked the public payload and the rendered HTML for:

- `sourceReview`, `sourceTrail`, `sourcePriceEvidence`, `priceEvidence`, `ownerFields`, `sourceUrl`, `sourceMethod` and `rejected`;
- internal review wording such as "verified", "uncertain" and "rejected";
- rejected rows appearing as catalogue rows;
- owner notes or review comments.

**Result: no leakage found.** All 75 leak checks passed. Rejected policies, locations and articles remain available to the owner as information or portfolio destinations on the review page, but do not become products, services, rooms or dishes.

Customer screens use owner-approved values. Empty states remain empty rather than being filled with invented content. The 15 concept pages and 15 production app pages were checked; the customer UI was not visually inspected at multiple screen sizes (Section 8).

### 4.1 Unverified prices

`customerSpec` now suppresses a price whose `priceEvidence.validated` is explicitly `false`, rather than publishing the amount as a fact. A unit test builds an unvalidated reading of 987654 and confirms the amount is absent from both the HTML and the payload while the item's name remains.

None of the five saved benchmark businesses contained a `validated: false` price after evidence seeding, so this rule was verified by unit test, not by one of the five customer apps. A legacy price with no evidence record at all is still published; the build only refuses amounts it knows it could not validate. That is a remaining limitation, not a claim that every displayed price has been proven.

### 4.2 Unverified project names

Website-suggested portfolio work previously reached the customer app as established work. That is now closed:

- `createProject` marks every incoming project as `accepted: false`.
- The customer renderer and the "Selected work" section only include accepted work.
- The review page labels unaccepted rows **"Suggested from the website · not published"** and offers per-row publish or bulk publish.
- The audit confirmed the six AFL suggestions were absent from the customer app, then published them through the owner route and confirmed six live entries and the owner-edited title.

Bulk publish is still an owner action that accepts all suggestions at once. It is explicit, but it is a single click; an owner who does not read the six titles can still publish them. This is recorded as a residual risk in Section 8.

---

## 5. Five-business acceptance

Baseline means the saved evidence before this acceptance run; final means after the owner corrections recorded by the run.

### 5.1 Yarmouth Oilskins — product and variant selection

- **Saved evidence:** 74 products, all 74 priced and validated, all 74 with images, all 74 with variants; 16 refused rows (policies, gift cards, "shop now" navigation).
- **Final accepted catalogue:** 74 products, 74 validated prices, 74 variants, 74 images; 16 rejected rows remain outside the catalogue.
- **Product and variant selection:** the customer payload identifies the selected variant by its stable id and the order accepts that id; the order total matches the selected variant's price.
- **Cart and fulfilment:** order placed and visible on the owner dashboard.
- **Owner correction and regeneration persistence:** a base price correction persisted through the fresh session and appears in the customer payload. The product card shows the variant range ("From £5"), so a base-price correction is not necessarily the number on the card; variant pricing remains the source of truth for that card.
- **Customer app:** variants, prices and fulfilment options render; no source trail or review status appears.

### 5.2 Padella — empty-menu recovery, information and reservations

- **Saved evidence:** zero menu items; five refused rows (cookies/privacy policies and location pages).
- **Empty state:** the customer app showed an honest empty menu message, not filler dishes.
- **Owner-created menu:** three dishes added by the owner; all three priced, validated and published with owner provenance.
- **Restaurant information:** address and opening information render on the Visit screen; the rejected policies/locations remain information, not dishes.
- **Reservation request:** accepted (201) and visible on the owner dashboard.
- **Fresh session:** the three dishes and their owner dates survive.
- **Concepts:** three saved concepts; the `editorial/luxe` pair has a structural limitation described in Section 6.

### 5.3 Hotel Pelirocco — empty rooms, policies and stay requests

- **Saved evidence:** zero rooms; nine refused information rows (policies, press, venue hire, loyalty club).
- **Empty state:** honest empty-room recovery; no invented room types or rates.
- **Owner-created rooms:** two rooms with rates; both validated and published.
- **Hotel information and policies:** the Visit screen carries the saved address and policies; policies did not become rooms.
- **Stay request:** a two-night stay request was accepted and priced from the selected room; it reached the dashboard.
- **Fresh session:** both rooms and their owner provenance persist.

### 5.4 Blue Tit — large catalogue, price gaps and imagery

- **Saved evidence:** 82 treatments, 7 with a validated price, 75 without a price, zero treatment images. The audit's catalogue count is exactly 82, not a truncated subset.
- **Price gaps:** the 75 unpriced treatments remain visibly unpriced; no amount is invented for them.
- **Missing imagery:** no stock or generated image is substituted. The customer app renders the missing-image state.
- **Owner corrections:** an owner price correction persisted and reached the customer. A 320-wide WebP treatment photo was uploaded (201), served from the media route and rendered on the treatment; the review still marks the price as the owner's.
- **Fresh session:** the 82-item catalogue, the owner price, the owner image and the provenance survive.
- **Concept:** `editorial/luxe` and the other pairs pass the diversity validator.

### 5.5 Architecture for London — services, portfolio and enquiries

- **Saved evidence:** one build service (unpriced in the source), six journal case studies proposed as portfolio work, seven refused rows.
- **Build service:** renders as a service with its own action; it is not mixed into the portfolio.
- **Six portfolio entries:** all six began as **unpublished suggestions**; the customer app contained none of them before the owner published. The owner published all six; the review reported six live; the customer app then rendered six entries.
- **Editable project titles:** one title and description were edited through the review; the title persisted as owner-provided and reached the customer.
- **Separation:** portfolio work carries no price and no booking action, and lives in its own section; the service section is separate.
- **Proposal enquiry:** accepted (201), stored, and visible on the owner dashboard.

---

## 6. Three-concept diversity

The audit compares each site's three saved concepts on four reported dimensions rather than one aggregate score:

| Site | Validator | Styling | Layout | Information architecture | Customer journey |
|---|---|---|---|---|---|
| Yarmouth | pass | different | different | different | different |
| Padella | **FAIL** on `editorial/luxe` | different | **same** | different | different |
| Pelirocco | pass | different | different | different | different |
| Blue Tit | pass | different | different | different | different |
| AFL | pass | different | different | different | different |

All other Padella pairs (`editorial/modern`, `luxe/modern`) differ on all four dimensions.

### Padella `editorial/luxe` — the limitation, not hidden

The validator score is **0.55** and the pair fails. Its six underlying comparisons are:

- screen and navigation architecture — **different**
- section types and composition — **same**
- catalogue presentation — **different**
- detail-page interaction — **different**
- primary customer journey — **different**
- trade-specific functionality — **same**

Stated reasons: same sections in the same order, same opening screen, same block set, same section composition, same trade functionality. The source supports two home-section types, and these two concepts use the same home composition; their navigation, catalogue presentation, detail interaction and journey differ, but the validator correctly refuses to call that a different layout.

No arbitrary section was added to force a pass. The other two concepts are genuinely different, and the remaining four businesses pass all three pairs. What still needs work is a second valid home composition for a restaurant whose source has only two section types; that is a design gap, not an audit failure to be papered over.

---

## 7. Defects and residual risks

1. **Padella `editorial/luxe` home composition.** Styling, IA and journey differ; layout does not. The validator fails and is left failing.
2. **No live re-crawl end-to-end.** The conflict UI used a saved plan; the diff/apply functions are unit-tested. A fresh crawl feeding `/import/check` and then `/import/apply` was not run because new crawls were prohibited.
3. **Owner login was simulated.** Fresh sessions use the same D1 session row a successful key check creates; the key check and login form were not re-tested.
4. **Business information has no source trail.** Address and phone corrections persist as owner data, but there is no per-field original/latest/decision record for them the way there is for catalogue prices and descriptions.
5. **Variant-level provenance is incomplete.** Yarmouth's owner correction is recorded on the base item. The card shows the cheapest variant, and there is no per-variant owner trail; a variant-level correction workflow is not proven.
6. **Portfolio source URLs are not stored per project.** The review records website/owner origin, but not the case-study URL. It also offers a bulk "publish all suggestions" action, so an owner can publish six titles without reading each one.
7. **Legacy no-evidence prices remain publishable.** Only an explicitly `validated: false` reading is suppressed. Nothing in the five fixtures exercised that path; it is unit-tested only.
8. **A site-side rename is not offered as a change.** Owner renames survive re-import because matching uses ids and the original name, but a later source rename is ignored rather than shown as a difference.
9. **No visual/responsive pass.** Customer pages were checked as HTML and payloads. The only browser-driven UI check was the owner conflict panel; no screenshots or 320/390/desktop visual review were made.
10. **Audit fixtures are not pristine.** Owner edits from earlier acceptance runs accumulate. The report distinguishes the saved baseline from the final accepted state; it does not present the final state as the original crawl.
11. **Bulk portfolio acceptance.** The explicit acceptance boundary exists, but `Publish 6 suggested projects` accepts all in one action. Per-project publish is available and was used for the edited title; the bulk path is a usability risk, not a silent one.
12. **Local single-node storage.** The audit ran against the local Miniflare Worker and D1. No R2 latency, CDN, multi-node concurrency, real email delivery, payment gateway or TLS/custom-domain behaviour was exercised.

---

## 8. What is verified locally, and what is not

**Verified locally**

- Owner corrections survive logout and a fresh owner session in all 15 apps.
- Owner provenance, the original source snapshot, the latest reading and resolution history persist.
- An owner-corrected field is not silently upgraded to a website claim.
- A re-import plan cannot replace an owner value without an explicit resolution; the dashboard shows both readings with no preselection.
- Concept previews do not write.
- Customer payloads and HTML do not expose review status, private evidence, owner notes or rejected catalogue rows.
- Website-suggested portfolio titles are withheld until the owner publishes them.
- The five saved businesses recover from empty or incomplete evidence and support their requested workflows.
- Four of five sites have three concepts that differ on styling, layout, IA and journey; Padella has one honest structural failure.

**Not verified locally**

- A real later crawl flowing through `/import/check` and `/import/apply` against a live site.
- The owner-key login and its error paths (sessions were inserted directly).
- Production D1/R2, concurrency, CDN, media delivery at scale, TLS and custom domains.
- Email delivery, payment activation and gateway behaviour; payments were not activated.
- Visual quality and responsive behaviour at real device sizes.
- A source rename arriving after an owner rename (not offered as a conflict).
- Per-variant owner correction and provenance.
- A legacy price with no evidence record (only explicit `validated: false` is covered).

**Production readiness is not claimed.** These results show that the reviewed owner decisions are preserved, distinguishable from source readings and not leaked to customers in the audited local environment. They do not establish production reliability, live-crawl correctness or visual acceptance.

---

## 9. Reproducing the evidence

The local Worker was running at `http://127.0.0.1:5173`; headless Chrome exposed CDP at `http://127.0.0.1:9223` for the conflict UI only.

```bash
# Seed the evidence-backed audit fixtures (once; uses saved reports, no crawl)
BENCH_EVIDENCE=1 \
BENCH_ROOT=docs/qa/generation-benchmark-2026-11-21-recovery \
BENCH_APPS=.chrome-qa/generation-benchmark-apps-audit.json \
bun scripts/generation-benchmark-seed.mjs

# HTTP acceptance: 526 checks
bun scripts/generation-benchmark-persistence-audit.mjs

# Concept dimensions: 15 saved documents, 15 pairs
bun scripts/concept-diversity-audit.ts

# Browser conflict resolution: 13 checks
bun scripts/regeneration-ui-audit.mjs

# Code and unit/integration checks
bun run typecheck
bun test
```

Before the recorded acceptance run the audit fixtures were returned to their baseline: Padella and Pelirocco menus empty, Blue Tit treatment images removed, AFL portfolio suggestions unpublished. The harness then recreated the owner corrections and the treatment upload. The SQL reset is test-fixture maintenance, not application behaviour; it is deliberately not part of the product.

The previous benchmark, remediation and recovery reports, and the saved crawl evidence under `docs/qa/generation-benchmark-2026-11-21-recovery/`, were not edited by this work.
