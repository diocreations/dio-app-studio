# Present & Correct: the live run, and what changed after it

The one authorised read on 20 November 2026 published 33 of 706 products and
showed `$` where the shop charges `£`. Both failures are now fixed and tested
against the saved feed from that run. Nothing here is a new read of the shop.

Evidence for the original run stays where it was:
`docs/qa/live-discovery-2026-11-20/present-and-correct/`.

## What the live run found, against what the build does now

| Check | Live evidence, 20 Nov | Now | How it was checked |
| --- | --- | --- | --- |
| Products imported | 33 of 706 (30 + 2 + 1) | 706 of 706 | Fixture: the saved `feed.json`, served as three pages of 250/250/206 |
| Why products were lost | a hard 30-per-product-type cap in `shopifyProducts`, then again in `sanitizeMenu` and `sanitizeImported` | no product-type quota; a shelf of 703 is one shelf | Fixture (706 retained, `Catalogue` 703 / `Pad` 2 / `Geyer instructional` 1) |
| Product IDs, variants, prices | kept for the 33 published | kept for all 706; 275 multi-option products keep every option, its feed ID, its price and exactly one `selected` marker | Fixture, e.g. `Candy Cards` → `39858944639011` / `39858944671779` at 300 |
| Images | 33/33 belonged to their product | 706/706 carry their own photograph | Fixture |
| Currency | `site.currency` empty, app showed `$7.50` | `GBP`, from `og:price:currency`, stored on the build as `currencySource`; the app shows `£7.50`; no dollar anywhere | Fixture (import) + browser (rendered build) |
| Currency with no evidence | silently `$` | amounts shown with no symbol, and the brief asks the owner to confirm a code | Fixture: missing, GBP, EUR, INR, USD and a two-code conflict |
| Two currencies declared | not exercised | nothing is published; the brief asks which is right; a conflict is never resolved by picking one | Fixture (EUR + USD) |
| Owner confirms a currency | not exercised | saved on the draft, applied as method `owner`, prices unmoved | Fixture |
| Unknown code (`XYZ`) | not exercised | dropped; the build shows bare amounts | Fixture |
| Long catalogue on the first screen | n/a (33 items) | 12 cards per shelf, then 24 at a time; "Showing 15 of 706 pieces" beside the count | Fixture + browser |
| Order payload | variant + price, unknown option `422` | unchanged, plus the build's `currency` on the create and read responses | Fixture (unit + HTTP) |
| Stale-cart reconciliation | verified in `b832871` | unchanged, still covered | Existing test |

## How the catalogue is shown now

- The whole catalogue still ships in the app's `DATA.menu`, so search, detail
  pages, the bag and offline use all see every product. Only the DOM is bounded:
  the server renders the first 12 products of each shelf, and a `Show 24 more`
  button appends the next page from `DATA` with the same markup, photographs and
  price rules.
- A line above the catalogue says `Showing N of M pieces`, where M is everything
  imported and N is what is on screen; it updates as pages load and when a shelf
  filter hides the others.
- Ordering, keys and prices are unchanged: a product's key is still its
  `section-index` position in the full catalogue, so the bag, the order and the
  server agree whether or not its card has been rendered.
- Search always covers the whole catalogue, not the rendered page.

## Browser check (local dev server, the 706-product build)

- First paint: 12 rows on the `Catalogue` shelf, `Showing 15 of 706 pieces`
  (12 + 2 + 1 across the three shelves), `Show 24 more`.
- Two real clicks: 36 rows, then 60 rows; 60 unique keys, last `0-59`, count
  `Showing 63 of 706 pieces`, label `Showing 60 of 703`.
- Appended products arrive with their own photograph and `£` price
  (e.g. `0-12` at `£4.75`).
- Searching `Geyer` from the home screen found the one product in that shelf
  before any of that shelf had been rendered.
- Filtering to `Pad` left one shelf visible.
- Every price seen in the app was `£`; no `$` appeared in the page text.

The browser check also found an unrelated defect: the splash screen kept an
invisible full-width sheet over the top of the app after its fade, swallowing
taps in that area. It now takes no pointer events once dismissed.

## Status, kept separate

- **Implemented:** the cap removed at every layer; currency signals, resolution,
  evidence and conflict handling; owner confirmation in the brief; `moneyForSpec`
  and bare amounts for unconfirmed imported shops; order currency in the API;
  catalogue paging with imported/displayed counts.
- **Fixture-tested:** all of the above against the saved 706-product feed, plus
  GBP/EUR/INR/USD/missing/conflicting currency pages. `bun test`: 580 pass,
  0 fail (19 new in `tests/catalogue.test.ts`).
- **Browser-tested:** paging, counts, search, a shelf filter and GBP display on a
  local build made from the saved feed. Not tested in the browser: checkout,
  variant selection on a live build (no live product has differently-priced
  options), and the brief's currency confirmation control.
- **Live-source-verified:** the original run only, for the parts it covered.
  Nothing has been read from the shop since.

## One further run, if you want it

The fixes are verified against the saved feed, but two things can only be proven
against the live shop: that the reader now keeps all 706 products from its own
pages, and that it detects GBP from the live page rather than the fixture's meta
tag. I would like your approval for **exactly one** more read of
`presentandcorrect.com`, using the original plan
([`present-and-correct-crawl-plan.md`](../present-and-correct-crawl-plan.md)) and
its limits unchanged: 20 s wall clock, 10 page reads, 3 feed pages, 6 s per
request, 900 KB per body. The run would re-record evidence in a new dated
folder, compare against this one, and change nothing about the crawl budget,
the site list or production.
