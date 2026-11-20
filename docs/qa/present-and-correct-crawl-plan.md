# Present & Correct: final live verification plan

Status: **run once, 20 November 2026, under the authorisation given for that
date.** The nine results and their evidence are in
[`live-discovery-2026-11-20/present-and-correct/notes.md`](./live-discovery-2026-11-20/present-and-correct/notes.md):
seven passed and two failed (only 33 of 706 feed products were published because
of a 30-per-section cap, and no currency was declared so the app formatted
dollars). The plan below is kept as the record of what that run had to decide and
as the script any further run must follow.

Any further read of the site is a new crawl and needs its own authorisation.

## Why this shop

Present & Correct is the hardest available test of the hosted-storefront reader:
a Shopify shop with a large catalogue, product-level images, multi-option
products and prices that exist both in a feed and on rendered product pages. The
reader was built against fixtures from it; only a real run can show the live
endpoints behave as the fixtures assume.

## Gate before the first request

Stop and report, rather than improvising, if any of these is not true:

1. **Authorisation** for this run is recorded in the request that starts it.
2. The dev server (or the deployed preview under test) is the target; no
   production deployment is part of this run.
3. The build budget for the day has room for one build (3 per visitor, 40
   overall). A refused build is reported as a budget stop, not retried.
4. The site is reachable and answers the entry page without a login wall.
5. The site's `robots.txt` allows `/` and `/products.json`. If the feed is
   disallowed the run continues without it and records "feed blocked"; it is
   never fetched past a disallow.

## The nine checks

Each row is one thing the run must decide, with the evidence to keep. Evidence
means the saved import report (`report.json` plus the rendered app), not a
recollection.

### 1. Is `/products.json` available?

- Request `GET https://presentandcorrect.com/products.json?limit=250&page=1`
  through the importer, not by hand, so robots, timeout and body limits apply.
- Pass: `200`, `content-type` JSON, a `products` array with at least three
  products, and the report's source names the feed URL.
- Also record: status, content type, byte size, and whether Shopify signatures
  were present on the entry page (the reader only tries the feed after seeing
  them).
- Fail states to capture distinctly: 403/404, HTML instead of JSON, JSON without
  `products`, or a robots disallow. Any of these ends the feed path and the
  storefront is read as a normal site — with prices cleared, because a page crawl
  publishes no item price without per-item evidence.

### 2. Pagination

- Expect up to three pages at `limit=250`; read until a page returns fewer than
  250 products, a non-ok page, no products, or under 1.5 s of budget remains.
- Record for each page: URL, status, product count, byte size. The sum is the
  catalogue size the build must show.
- Pass: the counts are consistent with the last page being short (for example
  136 products = one short page, or 250 + short page), and the report's page-cap
  note is absent unless more than 750 products exist.
- Fail: a repeated `page` parameter, an infinite-looking sequence of full pages,
  or a count that changes between two reads of the same page (cache or A/B
  storefront). Record the difference; do not average it.

### 3. Product names

- Compare the feed titles with the names rendered on the app's shelf and item
  pages, and with the collection page where one was read.
- Pass: every published name matches the feed title (whitespace-normalised),
  duplicates are not invented, and a name is never borrowed from another
  product or from a collection heading.
- Record: total published, first five names, any name normalised beyond
  whitespace, and any product dropped and why (for example a name the sanitiser
  refuses).

### 4. Product images and their associations

- For each product with images, confirm the app uses an image URL that the same
  product record listed, over https, and that the file actually loads (spot-check
  at least five, including one with a decorative filename).
- Pass: no image is shared between two products unless the feed itself repeats
  it; no stock, placeholder or non-https image is published; each image sits on
  the product that listed it.
- Record: images offered vs used, the five checked URLs with their status, and
  every rejection with its reason (`feedImage` gate).

### 5. Variant names and prices

- Pick at least five products with more than one option across the feed's price
  range, including one where two options share the lowest price.
- For each: the app must show `From £X` and the option count, the item page must
  list each option with its own price, and exactly one option must be marked as
  the source of the published figure.
- Pass: `X` equals the cheapest positive option; option names and prices match the
  feed; a tie produces exactly one marked option (the first at that price); option
  ids survive to the build.
- Transaction check: choose a non-cheapest option in the app, order it, and
  confirm the stored order line's `variant` and `price` match that option, and
  that the total equals it (plus delivery where chosen). Then send an order with
  an option id the item does not have and confirm `422 variant_unknown`.
- Record: the five products, their option tables, the order id and its stored
  lines.

### 6. Currency

- The entry page's declared currency (Shopify `Shopify.currency`, a
  `currenciesAccepted` value or the shop's meta) is the only currency source.
- Pass: every published price is formatted in that currency, no mixed symbols,
  and the evidence's `currency` is a three-letter code on every priced item.
- Fail states: no declared currency (prices remain numeric in the app's default
  formatting and are recorded as such), or a page currency that disagrees with
  the feed (recorded, not converted). No FX conversion is ever performed.

### 7. Price conflicts between feed and product pages

- The reader compares the cheapest option on the feed with the page reading. Every
  disagreement must appear in the brief as **Prices that need your decision**,
  with both readings and both source URLs, and the item must publish **no price**
  until the owner decides.
- Pass: the number of conflicts equals the number of items with two positive
  disagreeing readings; no conflict is averaged or silently resolved; a decision
  (page, feed or a typed correction) publishes exactly that figure at build time
  and keeps both original readings in `spec.review`.
- Record: each conflict with both raw strings, the owner decision made in this
  run, and the built item's price plus evidence method.

### 8. Missing or unavailable products

- "Missing" is decided against evidence, never guessed:
  - a feed product with no positive option price → kept with no price, shown as
    ask-on-request; no figure is borrowed;
  - a product only on a collection page and absent from the feed → kept from the
    page, with no price (page prices carry no per-item evidence);
  - a product whose page 404s → recorded as unavailable, not published with an
    invented price or description.
- Pass: every published product traces to a feed record or a page record, and
  every unpriced product says so instead of showing a placeholder amount.
- Record: counts of feed-only, page-only, unpriced and unavailable products, with
  one named example of each that exists.

### 9. Crawl-budget compliance

- Limits: 10 page reads, at most 3 of them feed pages, 20 s wall clock, 6 s per
  request, 900 KB per body. Feed pages count as page reads.
- Expected for 136 products: one entry page plus one feed page (two reads); a
  larger catalogue adds at most two more feed pages.
- Pass: the report's request log is within every limit, no request was retried
  past a timeout, and the build finished with budget left.
- Record: the request count, the wall time, the largest body, and the remaining
  budget at the end. A run that hits a limit is reported as truncated, with what
  was read, never as complete.

## Evidence to keep

Under `docs/qa/live-discovery-<date>/present-and-correct/`:

- `report.json` — the importer's report, unedited (`site`, `quality`,
  `priceConflicts`, requests, page-cap note).
- `app.html` — the built customer app's HTML for the price, option and currency
  checks.
- `notes.md` — the nine checks with pass/fail, the five products inspected, the
  order id and its stored lines, and every rejection with its reason.
- Screenshots only where a visual claim is made (shelf `From`, item options,
  cart line with the option name).

## What would stop the run

- No authorisation, or a robots disallow for the feed with the entry page also
  disallowed.
- A build budget refusal.
- A feed that answers differently on two reads of the same page (unstable
  catalogue) — record and stop rather than publish a mixture.
- Any conflict the owner has not decided: the affected products stay unpriced,
  which is a correct outcome, not a failure to fix mid-run.

## The run after the fixes (awaiting authorisation)

The 20 November run is complete, and both of its failures are fixed and
fixture-tested ([comparison](./live-discovery-2026-11-20/present-and-correct/comparison.md)).
One further run of this same plan — same site, same budget, same evidence rules —
would verify the two live-only claims: that all 706 products now reach the build,
and that GBP is detected from the live page. It has **not** been run and needs
explicit approval. No new sites, no larger budget, no production change.

## After the run

Turn the nine results into the status line of
[`shopify-feed.md`](./shopify-feed.md): either "live-verified on <date> with these
exceptions" or the exact failing check. Until that line changes, the reader is
fixture-tested and not live-verified.
