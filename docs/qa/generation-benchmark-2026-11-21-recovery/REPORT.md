# Plattr — discovery recovery and generation quality gate

**Date:** 21 November 2026
**Scope:** the five saved benchmark businesses and their fifteen saved concepts.
**Evidence:** the saved crawl reports and concept fixtures from
`docs/qa/generation-benchmark-2026-11-21-remediation/`. No crawl was run for this
pass, no AI request was made and nothing was deployed, paid for or published.

No source report, concept spec or remediation fixture was edited. This directory
contains its own verification, editor, capture, workflow and recovery results;
the previous report directories remain reference inputs.

## 1. What changed

### Discovery recovery

- `src/worker/review.ts` adds a `SourceReview` ledger created from the import
  report. Every refused row is classified (`policy`, `location`, `press`,
  `promotion`, `article`, `navigation`, `other`) and given a destination:
  business information, portfolio, or excluded. The classifications are
  server-side, so a client cannot turn a policy page into a product.
- `AppSpec.sourceReview` and `AppSpec.projects` persist that decision, the pages
  read and failed, the missing fields, questions and conflicting readings.
- `AppSpec.projects` now renders as a `pro-work` block: numbered selected work,
  no price, no booking control, no service row. `syncProjectSection` adds or
  removes the block exactly once as portfolio entries are added or removed.
- The customer app states an empty catalogue honestly. `emptyCatalogue` names
  the pages read, the item word for the trade, how many pages were kept as
  information and that nothing was invented. A restaurant home screen also
  states that the menu is not published yet instead of leaving blank space under
  the reservation buttons.
- The Visit/More screen lists kept policy, location, press and promotion rows as
  “From their site”, explicitly not as catalogue inventory.
- The editor’s catalogue panel has a recovery summary (why it is empty, what was
  kept, what is missing, owner corrections), a link to the source review, and a
  bulk paste box with a trade-appropriate example. Empty catalogues can be
  edited and previewed before they are complete.
- The existing editor script was broken by the bulk box: a real newline was
  emitted inside a JavaScript string (`split('\n')` inside a template literal),
  which stopped the whole editor on every build. It is fixed, and a regression
  test now compiles the editor’s inline script.

### Non-catalogue content

| Source row | Destination | Rule |
| --- | --- | --- |
| Policy, privacy, cookie pages | Business information | Never a catalogue item |
| Location and branch pages | Business information | Never a room, dish or treatment |
| Press, editorial, promotions | Business information | Kept separate from inventory |
| Case studies and articles | Portfolio (professional builds) | Proof of work, never a priced service |
| Navigation and archive labels | Excluded | No destination |

The review page groups rows by destination and states why each was refused.
Rejected rows are not silently discarded from the business model.

### Owner review and provenance

- `/p/:token/review` is a server-rendered owner review: identity and contact
  kept, catalogue evidence (website-validated, owner-provided, unverified), every
  item’s source URL and extraction method, rejected rows and their destinations,
  portfolio editing, missing fields, questions, conflicts and the pages read.
- A saved catalogue is compared with the stored one in `markOwnerEdits`. Changed
  fields become `ownerFields`; a changed price gets a separate owner
  `priceEvidence` entry while the earlier source reading is preserved as
  `sourcePriceEvidence`, still with its original `validated` flag. Nothing is
  upgraded. Setting a price back to the site’s own reading restores its website
  provenance; clearing a price removes the owner claim.
- Portfolio additions made from the review are owner data, and are deduplicated
  against already seeded work by the first clause of the title.
- Public customer payloads strip `sourceReview`, `sourceUrl`, `sourceMethod`,
  `priceEvidence`, `sourcePriceEvidence` and `ownerFields`. Evidence is for the
  owner, not for browser state or public HTML.

### Concept differentiation

- The validator measures six named dimensions: screen and navigation
  architecture, section types and composition, catalogue presentation,
  detail-page interaction, primary customer journey, and trade-specific
  functionality. It still enforces different home hierarchy, five changed
  architectural axes and a different opening screen or tabs.
- A failure now names the dimensions that are insufficient and the exact reason,
  for example “same sections in the same order” or “same trade functionality”.
- No filler sections were added to satisfy the validator. If a source supports
  only two home blocks, the concept stays at two blocks and the failure is
  reported.

## 2. What the saved evidence proves

These are facts recorded in the saved crawl reports and re-read from them:

- **Yarmouth Oilskins:** 90 rows discovered, **74 retained**, all 74 priced and
  all 74 with source photography; 16 rows refused. Variants and prices are the
  shop’s own (for example a gift card with seven values, £5–£500).
- **Padella:** 5 rows discovered, **0 publishable dishes**, 5 pages kept as
  business information (policies and locations). The 8 pages read include the
  menu, but no dish had the details the restaurant trade requires. Missing:
  phone, email, address, hours and other fields.
- **Hotel Pelirocco:** 9 rows discovered, **0 publishable rooms**, 9 pages kept
  as business information (policies, locations and press/editorial). 12 pages
  read. Missing: phone, email, address and other fields.
- **Blue Tit London:** 82 treatments retained, **7 priced**, **0 with source
  photographs**, 0 refused. Price evidence was not recorded by this crawl, so
  the review labels prices “Unverified price” rather than claiming a validated
  website price. 4 fields missing.
- **Architecture for London:** 8 rows discovered, **1 service retained (“Build”)**
  and 7 refused. Six refused rows are case-study/article sections; one is the
  Projects Archive navigation label. The six are eligible for the portfolio and
  were seeded as six portfolio entries; the navigation row is excluded.

“Build” is supported by the saved home-page copy: “AFL Build: a sustainable
builder in London with a unique design and build service.” It is a service
reading, retained without a price, not a case study. The six case studies are
rendered only as selected work.

## 3. Results per business and concept

All fifteen saved concepts were generated, seeded, opened, edited, saved,
reloaded and rendered. Concept names are the saved direction names.

| Business | Concepts | Catalogue result | Review / recovery | Concept diversity |
| --- | --- | --- | --- | --- |
| Yarmouth Oilskins | minimal, editorial, lifestyle | 74 items, 74 priced, 74 photos, 16 refused | 74 reviewed rows; missing fields named; variants preserved | pass (all pairs) |
| Padella | editorial, modern, luxe | 0 dishes, 5 kept information rows | honest empty menu, policies/locations kept, manual/bulk paths | **fail** — see below |
| Hotel Pelirocco | minimal, editorial, luxe | 0 rooms, 9 kept information rows | honest empty rooms, press/policies kept, request booking works | pass (all pairs) |
| Blue Tit London | minimal, editorial, luxe | 82 treatments, 7 priced, 0 photos | 82 rows, prices unverified, photo gap stated | pass (all pairs) |
| Architecture for London | classic, minimal, editorial | 1 service, 6 portfolio entries, 7 refused | service/portfolio separation, “Build” not priced | pass (all pairs) |

### Padella diversity failure

All three pairs fail for a specific, reportable reason: the saved evidence
supports only a title block and an action block, so `editorial` and `luxe` keep
the same section order and opening screen. The pairs do change navigation,
catalogue presentation, detail interaction and journey, but not section
composition, and trade functionality is identical. The validator reports:

- `editorial/luxe`: insufficient **section types and composition** and
  **trade-specific functionality**, with reasons “same sections in the same
  order”, “same opening screen”, “same block set”, “same section composition”,
  “same trade functionality”.
- `editorial/modern` and `modern/luxe`: insufficient **trade-specific
  functionality**; both differ on the other five dimensions.

This is a source limitation, not an invitation to invent an editorial section.
The honest response is to report it and leave the third composition short.

## 4. Owner review and incomplete-discovery results

Checked on the live local Worker with the seeded owner cookies:

- Padella: review shows 0 published, 5 read but not published, 5 kept as
  information, 6 missing; the catalogue panel explains the read, offers a bulk
  paste (restaurant example) and can publish before completion.
- Pelirocco: review shows 0 published, 9 kept information rows, 5 missing; the
  bulk example is a room, not a dish; the customer More screen lists policies
  and press under “From their site” and says they are not rooms.
- Blue Tit: 82 rows, 0 website-validated prices, 0 photos; each item exposes its
  source page and extraction method, “Unverified price” where applicable. The
  missing list uses dashes, not ticks.
- AFL: service row “Build” is separate from portfolio; all six case studies show
  as “In portfolio” instead of a duplicate Add button; “Add a project by hand”
  remains available; the editor summary says all six are in the portfolio.
- Owner edit check through the live catalogue API: a new item is recorded with
  `ownerFields` and owner `priceEvidence`; the review shows “Your data” and “from
  your entry”; the public app contains the dish but no evidence fields. The item
  was removed afterwards.
- Portfolio flow through live HTTP: add-all is idempotent, manual add/update and
  remove work, and the `pro-work` block is added once and removed with the last
  project.
- Bulk paste through the real editor: an empty catalogue accepted
  `QA catalogue entry | 12.34 | …`, published it, showed the owner badge in the
  review, and removed it again.

The local fixtures were reset after the editing pass so the captured screens
show the clean saved state rather than the QA entry.

## 5. Acceptance results

| Check | Result | Evidence |
| --- | --- | --- |
| Saved-evidence build checks | **64 / 65** | `verification.json` |
| Editor acceptance, 15 apps | **15 / 15 apps, 124 checks, 0 failed** | `editor.json` |
| Customer rendering | 84 screenshots; **0 horizontal overflow, 0 console errors, 0 network failures** | `capture.json`, `screens/` |
| Relevant workflows, 15 apps | **15 / 15 completed, 0 failed** | `workflows/browser-report.json` |
| Recovery/review captures | 5 businesses, phone and desktop, plus catalogue and information screens | `recovery/` |
| Unit/integration tests | **710 pass, 0 fail** | `bun test` |
| Typecheck | pass | `bun run typecheck` |

Workflows exercised the app’s own controls, not a fixture shortcut:

- **Yarmouth:** searched the gift card, selected two real variant values
  (£5 and £500), added both to the cart, saw the line prices, removed one line
  (the cart total fell from £505 to £5), placed a delivery order, and read the
  order back from the server and dashboard.
- **Padella:** opened Reserve, chose a day and time, requested a table and read
  the booking back from the dashboard. The menu being empty does not block the
  reservation workflow.
- **Pelirocco:** requested a three-night stay for four guests with no live
  availability, and read the booking request back from the dashboard.
- **Blue Tit:** opened a treatment, requested an appointment, and read the
  booking back from the dashboard.
- **AFL:** requested a proposal from the service screen and read the enquiry
  back from the dashboard.

The only failed saved-evidence check is Padella’s concept diversity, described
above.

### Mobile/desktop visual pass

Screens were inspected at 390 and 1280 CSS px, not only counted:

- Padella home, 390: before the fix, the page ended after two buttons with a
  large blank area. The empty-menu note now explains the 8 pages read and that
  nothing was invented. Desktop and phone both render without overflow.
- Pelirocco home and information, 390: the room empty state is explicit; the
  More screen keeps “From their site” policies, locations and press separate
  from rooms.
- AFL home, 390 and 1280: service “Build” appears once with no price, followed
  by “Selected work” with six numbered entries and no shop controls. Review
  portfolio entries are editable and marked “From the website”.
- Blue Tit treatments, 390: the treatment catalogue is usable, but 82 rows have
  no source photograph. The quiet missing-image frame is deliberate; the visual
  check confirms it is a neutral frame, not a broken image. The price gap is
  visible (“Unverified price”).
- Review page, 390 and 1280: header, evidence, rejected destinations, portfolio,
  missing fields and page list are readable. The marketing navigation was
  clipped on a phone; it is now reduced to the brand and the primary action on
  small screens.
- Editor catalogue, 390: recovery summary and bulk paste fit without overflow.
  The paste example follows the trade (room, treatment, product, service).

## 6. What remains unverified

The raw source HTML for the five saved crawls is not in the repository. This
pass can prove what the saved reports recorded and how Plattr interprets it; it
cannot re-fetch the pages, re-parse their DOM, or prove that a caption was not
also a project title. Specifically:

- AFL’s six portfolio titles are the saved article-section strings, not verified
  project names. Several are descriptive fragments (“In the front reception
  rooms…”, “This early 19th-century Georgian house…”). They are proof that the
  content is case-study material, not proof of the project’s name. The owner can
  rename each entry in the review; Plattr does not invent a name.
- The saved Blue Tit report has no price evidence for its seven prices. The
  review correctly shows them as unverified; whether the site published those
  prices in structured data cannot be re-established without the raw page.
- The exact contents of Padella’s and Pelirocco’s policy, location and press
  pages are not available, only their titles, URLs and the reason they were
  refused. Their role is proven; their body copy is not.
- The service reading “Build” is supported by the saved home copy, but whether
  AFL labels it as a separate company, a division or a service cannot be
  determined from the saved excerpt. It is retained as a service because that is
  what the excerpt says, not because the URL structure proves it.

## 7. Remaining defects and priorities

**P1 — AFL portfolio naming.** Six case studies enter the portfolio with
caption-like titles. They must not become services; the destination is correct,
but the owner should rename them before publishing. A future crawl should
capture the article heading separately from the body excerpt.
**P1 — Blue Tit price evidence.** Seven priced treatments have no source
evidence. The app is honest about this, but the importer should record the price
node or visible-text source when the crawl sees one.
**P1 — Raw evidence retention.** Store the source HTML or a content hash with
each crawl report so later reviews can re-check a caption, price or policy body.
**P2 — Padella concept diversity.** Two supported home blocks cannot produce
three genuinely distinct compositions. The failure is now precise; the next
step is more evidence (dish or menu structure), not filler.
**P2 — Blue Tit imagery.** No source photographs exist, and the neutral frame is
low-contrast. It is honest, but an owner-side “add photo” reminder in the review
would make the gap actionable.
**P2 — Owner price reverts without source evidence.** When the stored item never
had a website price, changing a price to an owner value and then back is still
owner-provided; there is no website reading to restore. This is correct, but it
means owner provenance cannot be cleared automatically for those items.
**P3 — Editor JavaScript regression coverage.** The bulk box broke the editor
for a period. The new `new Function` compile test covers the generated script;
keep it as the guard for future editor template changes.

## 8. Commands run

```text
bun run typecheck                  # pass
bun test                           # 710 pass, 0 fail
bun run audit:editability          # no uneditable page content
bun scripts/generation-benchmark-remediation.mjs  # 64/65
bun scripts/generation-benchmark-editor.mjs       # 15/15, 124 checks
bun scripts/generation-benchmark-capture.mjs      # 84 screenshots
bun scripts/generation-benchmark-recovery-capture.mjs
bun scripts/acceptance-browser.mjs # 15/15 workflows (benchmark input)
```

The local builds were reseeded from the saved specs after the editing pass. No
production database, Worker, payment provider or remote crawl was touched.
