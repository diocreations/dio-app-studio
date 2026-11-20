# Fix round after the first five live crawls

Commit base: `5a1f3e8`. Every claim below is backed by a test that reads the
stored live reports, or by a re-captured screenshot. No new crawl has been run in
this round — the second approved crawl waits until the remaining discovery items
(P2 surface preference, P4 normalisation, P7 questionnaire) are fixed too, so the
repeat measures a finished round rather than a half-finished one.

## 1. A repeated number is not a price

**Defect.** Nine Pimlico services came back at exactly `£1,000`; no `£` price
appears on the crawled service pages. A price the source never stated is the most
dangerous failure the importer can have.

**Rule.** When a catalogue has at least three priced entries and every price is
identical, there is no per-item price evidence. Every price is cleared, each
removal is recorded in `quality.suspectPrices`, and the app shows "ask" instead.
Three or more is the threshold because two identical prices can be a real tariff.

**Evidence** (`tests/price-guard.test.ts`, run against
`service/report.json` as crawled):

- raw crawl: 9+ priced items, one distinct value;
- after the guard: 0 priced items, ≥9 recorded suspect prices, catalogue kept;
- ButterTales and Dishoom: every genuine priced item survives, distinct values
  still more than one;
- a two-item page at one price: unchanged.

## 2. Navigation is not catalogue

**Defects.** RHS "sold" `More ernst benary &rsaquo;`, `About us` and
`Indoor plant care`, and an HTML entity survived into an item name.

**Rules.** Item names are entity-decoded before storage; trailing chevrons are
removed; anything still carrying `›`, `»`, `→` or `&entity;` is markup, not a
title, and is dropped; a navigation blocklist rejects chrome labels (About us,
Contact, Delivery & returns, Returns, Sign in, Basket, Gift cards are *kept* —
they are real products, plus the rest of the list in `NAV_NAME`). Each removal is
reported as `reason: 'navigation'`, never silent.

**Evidence** (`tests/price-guard.test.ts` against `complex/report.json`):
no name matches `rsaquo|&entity;|›|»`; no bare chrome labels remain; the drop is
counted in `quality.dropped`. Fixture tests cover footer labels, promotional
cards (`Delivery & returns ›`), an entity in a real product name
(`Ernst Benary &amp; Sons` → `Ernst Benary & Sons`) and a genuine product that
must survive.

## 3. Three concepts are now three designs

**Defect.** Every flagship trade rendered one screen three times; ButterTales
differed only in tab capitalisation (`Home` vs `HOME`). Direction changed the
document metadata, not the application.

**Fix.** The flagship stylesheet now implements a visual system per direction
layout (`editorial`, `rows`, `grid`, `stack`), applied to the flagship markup the
document renderer does not own: `.fx-hero`, `.fx-products`, `.fx-product`,
`.fx-art`, `.fx-search`, `.fx-shop-title`, plus the shared composition classes
(`.tiles`, `.tile`, `.cx-hero`, `.cx-card`, `.cx-row`, `.cx-thumb`, `.tabbar`,
`.label`).

What visibly changes between the three ButterTales concepts
(`buttertales/concepts/*.png`, before in `before--*.png`):

| | editorial | minimal | lifestyle |
| --- | --- | --- | --- |
| Headline | serif, 500, tight | sans 600, 27px | sans 750, 31px |
| Section labels | serif, sentence case | uppercase, 8.5px, 0.16em | default |
| Search | hidden | hidden | visible |
| Products | one per row, 3:2 image | 2-col, 1:1, hairline cards | 2-col, rounded cards, soft shadow |
| Corners | none | none | 22px cards, 16px images |
| Navigation | serif labels, transparent bar | uppercase micro-labels, flat bar | dock with rounded surface |

Three distinct treatments of the same verified facts: hero/search composition,
typography, spacing, card design, product presentation and navigation.

## Still open in this round

- **P2 — trade-aware surface preference.** Not implemented: Dishoom would still
  choose `/store/` over `/menus/` on a fresh crawl. The gift-shop catalogue is a
  regression test that must fail before it can pass.
- **P4 — conflict and question normalisation.** Not implemented: legitimate title
  variants still report as conflicts, and duplicate `trade` questions still fire.
- **P7 — questionnaire skipping.** Not implemented.
- **P6 — second live crawl.** Withheld deliberately until P2, P4 and P7 land.

The five live reports in this folder are the **first-run** artifacts, kept
unchanged as the baseline. The guards above are proven against those stored
reports, not by re-crawling, so no source value has been silently rewritten.
