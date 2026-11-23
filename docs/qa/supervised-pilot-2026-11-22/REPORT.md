# Supervised business-owner pilot — acceptance report

Date: 22 November 2026

## Decision

**External supervised onboarding should not begin yet.**

The four clean pilot projects and the owner-onboarding improvements are ready
for local, supervised demonstrations. The usability test pack is ready to run.
But there is **no evidence yet from a real business owner**, and the pilot has no
production-like environment, named alert owner, scheduled offsite backup or
agreed retention/erasure procedure.

The correct next step is four moderated owner sessions in a controlled local or
private pilot environment, followed by the safeguards gate in
`PILOT-SAFEGUARDS.md`. This report does not claim public production readiness.

No deployment, commit, push, payment activation, live crawl, paid AI generation
or production provisioning was performed.

## 1. Clean project evidence

Four businesses, three builds each, from the saved recovery reports only. The
historical benchmark applications and their reports were not edited.

| Business | Trade | Builds | Catalogue | Verified contact | State |
| --- | --- | --- | --- | --- | --- |
| Yarmouth Oilskins | Retail | minimal, editorial, lifestyle | 74 products / 13 sections; all priced; 74 source photographs | None published | `in_review`; source complete |
| Padella | Restaurant | editorial, modern, luxe | 0 dishes; 5 policy/location rows held as information | None published | `in_review`; source empty |
| Blue Tit London | Salon | minimal, editorial, luxe | 82 treatments; 7 priced; 0 treatment photographs | Phone `01702412486` | `in_review`; source partial |
| Architecture for London | Professional | classic, minimal, editorial | 1 service, unpriced; 7 journal case studies held as unpublished portfolio suggestions | Phone `+442036374236`; email `mail@architectureforlondon.com`; published hours | `in_review`; source partial |

All 12 customer previews returned HTTP 200. All 12 owner review pages and
workspaces returned HTTP 200 with the owner session, and all 12 dashboards
returned HTTP 200. `clean-project-audit.json` records 12/12 passing previews and
owner views.

Clean-up applied to these projects:

- Yarmouth’s display name is **Yarmouth Oilskins**, taken from its own story,
  not the lowercase metadata name. It is still marked for owner confirmation.
- Yarmouth prices are GBP because the saved evidence has GBP candidate readings
  and £ variant labels. The report’s blank currency field was not copied into a
  currencyless price.
- No `Owner-confirmed detail.`, benchmark, lorem, test or sample-business copy
  was found in any of the 12 previews.
- The generic “Prices include tax” / “Rates include tax” policy claim was
  removed. It was not established by any saved website and is not replaced with
  another inferred policy.
- Padella publishes no dishes rather than invented pasta. Its home and catalogue
  explain the read honestly and offer table requests.
- Blue Tit’s missing treatment photographs use intentional monogram fields, not
  stock photography.
- No customer order, booking or enquiry was submitted into these clean pilot
  projects, so their dashboards start empty. Submission flows were proven on the
  prior clean acceptance builds; this phase tested the new previews structurally
  and visually without creating customer records.

Exact missing inputs are in section 4.

## 2. Onboarding improvements

The owner journey was reviewed as a non-technical owner. The following defects
were found and fixed:

| Before | After |
| --- | --- |
| The review page did not render the facts Plattr had found (`found` was stored but unused) | A **What we found** card lists the verified facts and the source host |
| Missing information used internal field names such as `contact` and `catalogue`, with no action | Plain labels, the reason in the owner’s words, and a direct **Add contact**, **Add hours**, **Open catalogue** or **Check name** action |
| Missing identity fields were simply omitted | Every identity row is shown; missing values say **Not provided** with an Add link |
| The source review was reachable only through the editor | The workspace starts with a four-step **Before you approve** checklist linking to the review, edit form, catalogue and preview |
| “Restaurant name” appeared for every trade | It now says **Business name** |
| An empty catalogue told the owner to find an editor panel | It now offers **Add the first item** |
| The catalogue link required finding and opening the panel | `/edit?panel=catalog` opens the catalogue panel directly; verified in a browser |
| The shell asserted tax treatment for every trade | The tax claim is gone; only neutral “ask about allergies/access” prompts remain |
| Yarmouth had no currency | The saved GBP evidence is used |
| Owner-facing copy said “items published” while the build was still private | It now says “items are in this build” and “This build is still private” |

Focused tests: `tests/onboarding.test.ts` 5/5. Browser walkthrough: review page,
workspace checklist at 1440px, direct catalogue link opened the catalogue modal,
0 horizontal overflow, 0 console errors. Screenshots are in `onboarding/`.

This is an expert review, not owner-usability evidence. The browser walkthrough
was performed by the implementer, not by an external business owner.

## 3. Owner usability results

**No real-owner usability test has been run.** Therefore this report cannot say
whether a real owner can complete the journey independently.

Prepared for the first cohort:

- `OWNER-USABILITY-TEST-SCRIPT.md` — recruitment, consent, moderator script,
  five tasks, think-aloud rules, intervention log and analysis.
- `owner-usability-log.csv` — one row per participant.
- `scripts/pilot-concept-sheet.mjs` — untracked local concept comparison sheet
  with the three previews per business and timings instructions.

The test measures:

- time from discovery to concept choice (live mode starts at URL submit; the
  prepared seeded mode starts when the three previews are revealed);
- time to complete owner review;
- corrections and interventions;
- confusing or abandoned steps;
- time to publish-ready;
- independent edit, save, reload and customer preview;
- trust and clarity statements.

Go/no-go thresholds in the script are hypotheses, not results. No participant
has produced a timing or a quote yet.

## 4. Outstanding owner inputs

These are deliberately not filled in.

### Yarmouth Oilskins

- Confirm the public name **Yarmouth Oilskins** (the site metadata is
  `yarmouthoilskins`).
- Phone, email, street address and opening hours.
- Confirm the right to use the 74 remote product photographs, or upload the ones
  the business owns. The preview currently points at the shop’s own CDN, so the
  images are not self-contained or offline-safe.

### Padella

- Dish names and prices, or a usable menu page/list.
- Phone, email, street address and opening hours.
- Until dishes exist: table requests only, no menu, no ordering.

### Blue Tit London

- Email, street address and opening hours.
- 75 missing treatment prices.
- 82 treatment photographs (or confirm the monogram absence is acceptable).
- Confirm the phone number is the public booking number.

### Architecture for London

- Street address.
- A price or starting price for **Build**, if one should be shown.
- Confirm the weekend opening-hours line (`00:00–00:00` may mean closed).
- Review and accept the seven journal case studies as portfolio work; add
  case-study photographs if they should be shown.
- Confirm the public email and phone.

No owner has confirmed any of these yet.

## 5. Application quality

The clean matrix has **87 captures at 320, 390/430, 768 and 1280**, with
**0 network failures and 0 console errors** and **0 horizontal body overflow**.

Twenty-one flags remain, all understood:

- **3 empty-catalogue detail skips** for Padella. It has no dishes, so there is
  intentionally no detail page to open.
- **10 missing-art fields** for Blue Tit editorial/luxe at five widths. The
  business supplied no treatment photography; monogram absence states are
  intentional.
- **8 clipping flags** for Yarmouth’s horizontally scrollable filter chips and
  two decorative circular crops. These are clipping warnings, not lost page
  content.

Concept differentiation remains real in home, navigation, catalogue, detail and
trade actions; the three concepts are not palette swaps. Yarmouth has the
strongest content support. Padella cannot demonstrate dish-level differentiation
without dishes, and AFL has one service, so their detail/catalogue depth is
limited by evidence, not by styling.

**Image dependency:** Yarmouth’s 74 source product images (and its remote logo)
are loaded from the shop’s CDN. That is acceptable for a supervised preview but
not a self-contained app. The owner must upload owned images or accept the
remote dependency before any deployment; offline behaviour is not claimed.

## 6. Operational readiness

Local safeguards verified in this phase:

- project-scoped owner sessions and APIs; a customer link cannot read the review
  or dashboard;
- private, token-scoped media delivery with magic-byte, 8 MiB, 24 MP, 24-file and
  40 MiB limits; in-use image deletion refused;
- project deletion now removes owner sessions, customers, orders, order items,
  bookings, enquiries, payment rows, media rows, versions, notes, activity and
  the project, and removes the R2 objects first;
- owner session cookies are HttpOnly, SameSite=Lax and Secure on HTTPS;
- customer writes are same-origin and rate-limited; customer records are
  owner-only;
- a fresh local backup completed at `2026-11-22T08:26:23Z`; manifest checksum
  `6c0489f023d8e58334849be92208c87182f4588820c7b7843141e478adec0da5`.

Not ready:

- no production D1/R2, deployment, offsite backup, schedule, uptime monitor,
  error sink, quota/backup alerts or named alert owner;
- no production restore/rollback rehearsal or RTO measurement;
- no retention/erasure decision or customer-level deletion workflow;
- no physical iOS/Android test;
- all-or-nothing owner-key rotation, no roles, no CSP;
- payments disabled; hotels excluded.

The detailed status is in `PILOT-SAFEGUARDS.md` and the earlier
`docs/qa/controlled-pilot-2026-11-22/OPERATIONS-CHECKLIST.md`, both preserved.

## 7. Verification

| Check | Result |
| --- | --- |
| Typecheck | pass |
| Unit/integration suite | **759 passed, 0 failed**, 63 files, 7,319 assertions |
| Production build | pass; no `.dev.vars` or source maps in `dist/` |
| Safeguards-focused tests | 40/40 passed |
| Clean project audit | 12/12 passed |
| Clean visual matrix | 87 captures, 0 network failures, 0 console errors |
| Owner review / workspace walkthrough | 1440px, 0 overflow, direct catalogue opens, 0 console errors |
| Real-owner usability | **not run** |
| Production restore / monitoring / deploy | **not run** |

## 8. Recommended pilot shape

**Duration:** 4 weeks.

- Week 1: four moderated owner sessions using the test script; fix any common
  blocker before the next session.
- Weeks 2–3: owners edit and share the private preview with a small number of
  real customers; no payments, no indexing, no hotels.
- Week 4: review evidence, corrections, operational incidents and owner
  confidence; decide whether to continue, fix or stop.

**Participants:** four businesses, one owner per trade, plus two reserves.
Expand to at most eight businesses (two per trade) only after the first four
complete the review and edit tasks unaided. A larger first cohort would produce
more feedback than a supervised team can act on safely.

**Success evidence:** all four owners complete review, one real edit, save,
reload and preview without intervention; no invented/wrong business facts reach
a customer preview; no critical operational incident; no owner data crosses
projects.

## 9. Conditions to begin external supervised onboarding

1. Explicit approval to use a private pilot environment, with deployment and
   rollback rehearsed.
2. Named primary and backup alert owners; uptime, Worker error, quota and
   backup-failure alerts delivering.
3. Nightly backup, offsite read-back and one restore rehearsal against that
   environment with RPO/RTO recorded.
4. Retention and erasure decision documented; owner key delivery and rotation
   plan agreed.
5. The four moderated sessions run and every critical blocker fixed.
6. A final check that every owner input in section 4 is either supplied or
   explicitly accepted as missing.

Until then, the accurate description is: **clean projects and onboarding ready
for supervised local demonstration; no external-owner usability evidence yet.**

## Evidence index

- `CLEAN-PROJECTS.md` — clean project detail and contamination audit.
- `clean-project-audit.json` — 12/12 preview, contact, count and owner-view audit.
- `screens/visual.json` and `screens/` — 87-screen matrix.
- `sheets/trade-*.png`, `sheets/responsive-*.png` — contact sheets.
- `onboarding/review-yarmouth-1440.png`,
  `onboarding/workspace-yarmouth-1440.png`,
  `onboarding/catalogue-yarmouth-1440.png` — onboarding walkthrough.
- `OWNER-USABILITY-TEST-SCRIPT.md` — unexecuted owner test protocol.
- `owner-usability-log.csv` — empty metrics template.
- `PILOT-SAFEGUARDS.md` — controls, local verification and external-owner gate.
- `docs/qa/controlled-pilot-2026-11-22/` — prior accepted phase, preserved.
- `docs/qa/generation-benchmark-2026-11-21-recovery/` — saved evidence, unchanged.
- `.chrome-qa/pilot-projects.json` — untracked local project links/sessions.
- `scripts/pilot-projects-seed.mjs`, `scripts/pilot-clean-audit.mjs`,
  `scripts/pilot-concept-sheet.mjs` — reproducible pilot setup and audit.
