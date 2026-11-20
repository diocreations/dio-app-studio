# Hosted storefront feed: how it is read, and what is not yet live-verified

Status: **fixture-tested, not live-verified.** Present & Correct has not been
crawled since the second approved round; nothing below claims a live result.

## Endpoint

`GET {origin}/products.json?limit=250&page=N` on the store's own host. It is the
storefront's public product feed: title, handle, body HTML, product type,
variants (title, price) and images per product.

## Robots and crawl budget

- The feed is only attempted when the entry page shows Shopify signatures
  (`cdn.shopify.com`, `/cdn/shop/`, `Shopify.theme`, `shopify-section`), and
  never for a restaurant (a menu is not a store).
- Each feed request is checked against the site's robots rules with the same
  matcher as page loads (`robotsAllows`). A disallowed feed is not fetched, is
  counted as blocked, and the crawl falls back to the visible catalogue.
- Requests run under the same 20 s wall clock, 6 s per-request timeout and 900 KB
  body limit as pages, and each successful feed request counts as a page read
  against the 10-page budget. At most three feed pages are requested.

## Pagination

`page=1..3`, `limit=250`. Reading stops when the feed returns fewer than 250
products (last page), when a page is not `ok`, when the JSON has no products, or
when fewer than 1.5 s of budget remain. A shop with more than 750 products keeps
the first 750 and the report's page-cap note still applies.

## Variant price selection

Every variant is parsed with the same money parser as the rest of the importer.
The published price is the **cheapest positive variant price**; the item records
`variants: [{ name, price }]` (up to eight) so the owner sees the options. The
evidence's `raw` value is that chosen variant's price exactly as the feed wrote
it, and `currency` comes from the entry page's declared currency.

## Product image association

Only `product.images` (the first three) are candidates, so an image can only
belong to the product record that listed it — never a sibling's, never a
collection banner. `feedImage` applies the shared gate but with
`allowDecorative: true`: a product literally called "Cover" keeps `…-cover.jpg`,
because the feed has stated which product the file belongs to. Stock and
placeholder libraries, non-image paths and non-https URLs are still refused.
Images carry `source: 'website'`, `method: 'public-data'`.

## Missing prices

A product whose variants carry no positive price is kept with `price: 0` (shown
as "Ask on request"), no `priceEvidence`, and no guessed figure. Nothing is
inferred from a sibling product or from the page's first number.

## When the endpoints are unavailable

- robots disallows it → not fetched, counted blocked, page crawl continues.
- 404/403/5xx, or a body that is not JSON → reading stops at that page; if fewer
  than three products were gathered the storefront is crawled as a normal site.
- A page-crawl fallback never publishes a price, because those prices arrive
  without per-item evidence and `cleanMenu(requireEvidence: true)` clears them.

## Reconciliation with page data

The feed does not overwrite what the page already said:

1. Entry-page products are read first and kept.
2. Feed products are merged **after** them, so a name the page already listed
   keeps the page's entry and the feed only adds what was missing.
3. When a product exists on both with two different positive prices, the page's
   price is kept and the disagreement is recorded in
   `quality.priceConflicts: [{ name, page, feed }]`. It is never averaged,
   rewritten or silently dropped.
4. Collection-page crawling is skipped once the feed yields three or more
   products, because the feed is the same catalogue in one request and its
   values carry provenance the collection cards do not.

Not yet implemented: surfacing `priceConflicts` in the customer-facing report
copy (it is recorded in the import report JSON, not yet shown in the brief's
"Not found — please confirm" list), and any conflict check for variants beyond
the cheapest.

## What a live run still has to prove

- That `presentandcorrect.com/products.json` is readable under robots.txt and
  returns the catalogue (it may be blocked or disabled).
- That all 136 live product images pass the gate and belong to the right product.
- That live variant prices match the storefront's displayed prices in GBP.
- That a real product named with a decorative word keeps its photo.
