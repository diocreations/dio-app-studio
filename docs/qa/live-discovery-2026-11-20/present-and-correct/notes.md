# Present & Correct: live verification, 20 November 2026

One authorised read of `https://www.presentandcorrect.com/`, run once, with no
retry. Nothing below was carried over from the fixture work.

- Entry: `https://www.presentandcorrect.com/`
- Run at: 2026-11-20T14:14–14:17Z (crawl 7.9 s)
- Script: `scripts/present-and-correct-crawl.mjs` (the importer with a metered
  `fetch`; the same budget checks run inside the crawler)
- Evidence: `report.json`, `requests.json`, `feed.json`, `checks.json`,
  `spec.json`, `app.html` (rendered from the report), `app-served.html` (the app
  as the dev server serves it), `order-check.json`
- Build used for the app evidence: local dev project
  `/p/a3f7177cff6164d73634dfd4`, built from this report's `site`

**Result: seven checks pass, two fail.** The failures are real and are listed
before anything else.

## Failures found by this run

1. **Only 33 of 706 feed products reached the build** (check 3). The feed
   returned 706 products over three pages. The reader groups products by
   `product_type` and then keeps at most 30 items per group
   (`src/worker/importer.ts`, `items.slice(0, 30)`). This shop has almost all of
   its products in one group, so the build kept 30 + 2 + 1 = 33 items and
   sections `Catalogue` (30), `Pad` (2), `Geyer instructional` (1). The report
   itself says "33 catalogue entries in 3 sections, read from 4 pages", which is
   the symptom: the feed was read, then truncated. No fix was made and no
   second crawl was spent; a fix needs its own authorised run to verify.
2. **No currency was established, so the app shows dollars** (check 6).
   `report.site.currency` is empty, `spec.currency` is absent, and every published
   variant's `currency` is empty. The served app therefore formats the live
   prices with its default symbol — `$7.50`, `$19.50`, `$32` for a shop whose
   prices are in pounds. The reader looks for a declared currency on the entry
   page and found none it recognised on this theme. Prices themselves were read
   correctly (for example `3.00` → 300, `9.50` → 950); only the currency is
   missing. Not fixed, not re-crawled.

## 1. Is `/products.json` available? — PASS

- `GET /products.json?limit=250&page=1` → `200`,
  `application/json; charset=utf-8`; page 2 and page 3 also `200`.
- 706 products were parsed from the three pages.
- The feed was attempted because the entry page carries Shopify signatures; the
  crawler counted no blocked feed and no failed page (`report.pagesFailed: []`).
- Evidence: `requests.json` (status, bytes, ms per request), `checks.json`
  keys `1_feed`, `2_pagination`.

## 2. Pagination — PASS

- 250 + 250 + 206 products = 706; page 3 is short, which is the documented stop.
- No page-cap note: 706 is under the 750 cap, so nothing was cut for length.
- The feed pages cost 3 of the 3 allowed feed reads and 3 of the 9 page reads.
- Evidence: `checks.json` → `2_pagination`; `feed.json` → `pages`.

## 3. Product names — FAIL (33 of 706 published)

- 33 items are published; all 33 match a feed title exactly
  (`matchedFeed: 33`), no item came only from a page (`pageOnly: 0`).
- 673 feed products are absent from the build. First examples: "Snowman & Robin
  Card", "Stripe Bow Christmas Card", "Stuffing Badge Card", "Write a Letter
  Card".
- Cause: the 30-per-section cap described above, not a name rule and not the
  price reader: the truncation happens before cleaning (`quality.discovered` is
  33, `quality.dropped` is 0).
- Published names are intact and readable, for example "'While You Were Out' Pad
  (1990s)", "Osama 'King' Crayons (1960s)", "The Sun Our Nearest Star (1960)".
- Evidence: `checks.json` → `3_names`; `spec.json` → `menu`.

## 4. Product images and associations — PASS for what was published

- 33 published items, all 33 with an image; every image URL is one the same
  product record listed (`listedByFeed: true`, 33/33). No image is shared
  between products.
- Image report: `products: 33, withImage: 33, rejected: 0, ambiguous: 0`.
- Sample: "'While You Were Out' Pad (1990s)" →
  `cdn.shopify.com/s/files/1/0952/3604/files/wywo_…jpg`; "Gift Gift Wrap (1950s)"
  → `…/giftswrap.jpg`; "The Holiday Candy Book (1952)" → `…/candybook1.jpg`.
- Caveat: the images of the 673 unpublished products were never part of the
  build, because those products were not. This check says nothing about them.
- Evidence: `checks.json` → `4_images`; `report.json` → `images`.

## 5. Variant names and prices — PASS on the live catalogue

- 5 published products have more than one option: Candy Cards (2), Wood/Brass
  Angel Ornament (6), Christmas Tapes (8), Honeycomb Tree (2), Graph Sticky Notes
  (3).
- Every published option name and price matches the feed, and the feed's option
  IDs are kept (`idsKept` 2, 6, 8, 2, 3).
- Exactly one option is marked as the source of the published price in every
  item (`selectedCount: 1`), including the all-options-same-price products here:
  Candy Cards' two options are both £3.00, and only "Gingerbread" is marked —
  the tie rule, exercised on live data.
- Display: because every option in each of these products costs the same, the
  shelf correctly shows a single price and no "From" line. The "From … · N
  options" path is therefore **not** live-exercised; it is fixture- and
  automated-test-verified only.
- Transaction on live IDs (local dev project, no extra crawl):
  `POST /p/a3f7177cff6164d73634dfd4/orders` with
  `{ key: "0-8", qty: 2, variant: "39858944671779" }` (Candy Cards, "Bon Bons",
  the non-default option) → `201`, order #2658, total `600`; the stored order
  reads `{ name: "Candy Cards", variant: "Bon Bons", price: 300, qty: 2 }`.
  The same item with `variant: "999999"` → `422 variant_unknown`.
- Evidence: `checks.json` → `5_variants`; `order-check.json`.

## 6. Currency — FAIL (none declared, app shows $)

- Declared currency: empty. Variant currencies: none. `spec.currency`: absent.
- The served app renders `$7.50` for "Christmas Price Cards (1970s)" (feed
  `7.50`) and `$19.50`, `$32` elsewhere — dollars for a GBP shop.
- Prices were parsed correctly; only the currency is unknown, and the app's
  formatting fallback is the dollar sign. No conversion was attempted.
- Evidence: `checks.json` → `6_currency`; `app-served.html`.

## 7. Price conflicts between feed and product pages — PASS, with a scope limit

- 0 conflicts (`quality.priceConflicts: []`).
- Scope: the comparison can only cover products the entry page itself named.
  Here all 33 published products matched feed names and agreed on price, but the
  673 unpublished products were never compared. "0 conflicts" is a statement
  about the 33, not about the catalogue.
- No decision was required, so no owner confirmation was exercised in this run.
- Evidence: `checks.json` → `7_conflicts`; `report.json` → `quality`.

## 8. Missing or unavailable products — PASS, with the cap caveat

- 0 published items without a price; 0 items dropped by cleaning; 0 suspect
  prices; 0 failed pages.
- No stock, availability or inventory claim is made anywhere: the feed carries
  none and the app shows none.
- 673 feed products are "missing" from the build **because of the section cap**,
  not because they were unavailable; none of them was published with an invented
  price or description.
- 0 products came only from a page (`pageOnly: 0`), so no page-only price was
  published without evidence.
- Evidence: `checks.json` → `8_missing`; `report.json` → `quality`,
  `pagesFailed`.

## 9. Crawl-budget compliance — PASS

| Limit | Allowed | Used |
| --- | --- | --- |
| Wall clock | 20 s | 7.9 s |
| Page reads | 10 | 9 non-asset reads (robots, entry, sitemap index, agentic sitemap, product sitemap, pages sitemap, 3 feed pages); the importer's own count is 4 pages (entry + 3 feed) |
| Feed pages | 3 | 3 (250 + 250 + 206, stopped because the last page was short) |
| Per-request timeout | 6 s | longest 1.78 s |
| Body size | 900 KB | largest 530,838 bytes (feed page 2) |

- 11 HTTP requests in total, of which 2 were CSS assets (not page reads).
- The feed page cap was reached exactly: a shop with more than 750 products would
  have been truncated, and this one is under it.
- Evidence: `checks.json` → `budget`, `9_budget`; `requests.json`.

## What this run does not claim

- It does not verify the 673 products the section cap dropped.
- It does not verify "From" pricing, because no published product had
  differently-priced options.
- It does not verify a conflict decision, because there were no conflicts.
- It does not verify a GBP symbol in the app, because no currency was declared.
- The crawl was not repeated; no second read was made to test stability.
