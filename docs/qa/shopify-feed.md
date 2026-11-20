# Hosted storefront feed: how it is read, and what is not yet live-verified

Status: **live-verified with exceptions, 20 November 2026; both failures fixed
and fixture-verified, not yet re-read live.** One authorised read of
`presentandcorrect.com` was run (see
[the run notes](./live-discovery-2026-11-20/present-and-correct/notes.md) and
[the comparison](./live-discovery-2026-11-20/present-and-correct/comparison.md)).
The feed, pagination, images, variant fidelity, missing-product handling and
crawl budget passed. Two checks failed: only 33 of the 706 feed products reached
the build (a 30-per-section cap), and no currency was declared so the app
formatted dollars. Both are fixed and tested against the saved feed; confirming
them against the live pages needs one further authorised run.

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
The published price is the **cheapest positive variant price**, chosen
deliberately so a "from" figure is never above what a customer can pay. Nothing
is lost to that choice: the item records every variant up to 24 as
`variants: [{ id?, name, price, currency, selected? }]`, each with its own price
and the shop's currency, and exactly one marked `selected: true` — the variant
the published figure came from. Selection is decided by the **index of the first
cheapest variant**, never by comparing prices, so two options at the same lowest
price still produce exactly one `selected` (the earlier one, as the feed listed
it). The feed's own variant `id` is kept when it is a trimmed string of 1–40
letters, digits, `_` or `-`; an unusable id is dropped without dropping the
option. The evidence's `raw` value is that variant's price exactly as the feed
wrote it, its `variant` is the variant's name, and `currency` comes from the
entry page's declared currency.

Products are never flattened to one anonymous number: a two-size or twelve-pack
product keeps its whole option list on the build (`sanitizeMenu` re-validates
ids, names, positive prices, three-letter currencies and the single `selected`
flag, and drops anything else).

In the customer app a product whose priced options differ leads with `From £42`
and an option count (`3 options`), shows each option with its own price on the
item page, and remembers the chosen one per item. The footer price follows the
selection. A product with one price (or with options that all cost the same)
keeps the plain single price. Nothing about stock or availability is invented:
the feed carries none.

The chosen option is authoritative for the transaction. The cart keys a line by
item plus option, the order payload sends only the item key and the option's
id-or-name, and the server looks that option up on its own stored catalogue and
charges its price. An option the item does not have is refused with
`variant_unknown` (422); a `price` in the request body is ignored. Order lines
store both `variant` (the name shown to the kitchen) and `variant_id`.

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
3. When a product exists on both with two different positive prices, the
   disagreement is recorded in
   `quality.priceConflicts: [{ name, page, feed, pageSource, feedSource }]`
   (in cents, with the page URL and the `/products.json` URL that supplied each
   reading). It is never averaged, rewritten or silently dropped. The item is
   kept in the catalogue with **no price** — two disagreeing readings are not
   one verified figure — until the owner answers in the brief.
4. Collection-page crawling is skipped once the feed yields three or more
   products, because the feed is the same catalogue in one request and its
   values carry provenance the collection cards do not.

Conflicts compare the cheapest positive variant only; other variants are not
checked against the page.

## Owner confirmation in the brief

Each conflict is listed in the brief under **Prices that need your decision**,
with the product name, both readings, both source URLs, and which reading
Plattr proposes (the page price). The owner can take either reading or type a
correction; a deferred conflict keeps showing "Ask on request".

The decision is stored on the draft as
`{ name, choice, value, decidedAt, page, feed, pageSource, feedSource }`. At
build time `applyPriceDecisions` turns the chosen value into the item's price
with `priceEvidence.method: 'owner'`; the evidence string keeps **both original
readings and both sources** plus the decision timestamp, so the project still
explains itself after the draft is discarded. Re-checked server-side:
`sanitizeImported` drops unknown choices, non-positive or absurd amounts and
non-http sources.

## Unfinished briefs

`/brief` autosaves to `brief_drafts`, keyed only by a random `drf_…` id in an
httpOnly, SameSite=Lax cookie (30 days). The row holds the import report, the
business fields, features, the three concepts and the chosen one, the current
step and the price decisions. A refresh restores it and nothing is re-read or
re-built; "Discard it and start again" deletes the row and clears the cookie.
There is no address-based lookup, so a second visitor on the same network reads
an empty draft. Writes are same-origin only, capped at 200 KB and one row per
visitor cookie. Covered by `tests/briefDraft.test.ts`.

Lifecycle: a draft older than 30 days (the life of its cookie) is deleted on the
next save (`pruneBriefDrafts`). A cookie whose row is gone is answered with
`{ draft: null, unavailable: true }` and the page says the brief is no longer
available instead of pretending it is new. A successful build deletes the draft
and clears its cookie server-side, so the build's price decisions live on the
project (`spec.review`) and a later restore cannot rebuild or overwrite it.
Discarding deletes the row and the cookie; a refresh after that is an empty
brief.

## Automated evidence

- `tests/shopifyVariants.test.ts`: variant prices and currency, the marked
  option, the tie case (two cheapest options → exactly one `selected`), id
  retention and validation, a 12-option list kept whole, image association, the
  public build's sanitised variants.
- `tests/variants.test.ts`: the shelf's `From £42` and option count, the
  single-price product left simple, the order charged at the selected option,
  two options as two lines, a browser price ignored, and unknown/foreign/absent
  options refused.

## Live run, 20 November 2026

The run followed [`present-and-correct-crawl-plan.md`](./present-and-correct-crawl-plan.md)
once, within budget (7.9 s, 3 feed pages, 9 non-asset reads, largest body 519 KB).
Evidence: `docs/qa/live-discovery-2026-11-20/present-and-correct/`
(`report.json`, `requests.json`, `feed.json`, `spec.json`, `app.html`,
`app-served.html`, `order-check.json`, `notes.md`).

- **Passed:** feed available (3 × `200`, JSON, 706 products); pagination
  250 + 250 + 206 with a short last page; the 33 published names match the feed
  and 33/33 images belong to their own product record; 5 multi-option products
  keep their option names, prices and feed IDs with exactly one marked (all
  same-price here, so the tie rule ran on live data); 0 unpriced items, 0 drops,
  0 failed pages; 0 conflicts among the compared products; order #2658 charged
  the chosen option ("Bon Bons", 2 × 300 = 600) and an unknown option was
  refused with `422`; budget respected.
- **Failed — product coverage:** the reader groups feed products by
  `product_type` and kept at most 30 per group. This shop is almost one group,
  so 33 of 706 products were kept. **Fixed:** the per-type cap was removed at
  every layer (`shopifyProducts`, `mergeSections`, `sanitizeMenu`,
  `sanitizeImported`), and a long shelf is paged in the app instead. Verified
  against the saved feed: `tests/catalogue.test.ts` keeps all 706 products
  (703 + 2 + 1) with their options and photographs.
- **Failed — currency:** the entry page declared no currency the reader
  recognised, so `site.currency` was empty and the app showed `$7.50` where the
  shop charges £7.50. **Fixed:** the reader now collects every public currency
  statement (Shopify analytics, `Shopify.currency`, price/currency meta,
  JSON-LD, unambiguous money symbols), publishes a code only when the evidence
  agrees, keeps the source on the build as `currencySource`, and asks the owner
  when nothing or two things are declared. An imported shop with no confirmed
  currency shows bare amounts, never dollars. Verified with fixtures and in the
  browser on a build made from the saved feed; the live page itself has not been
  re-read.
- Not live-exercised: "From" pricing (no product with differently-priced
  options was published), a conflict decision (no conflicts), and the 673
  products the cap dropped. All three now have fixture coverage; whether the
  live pages produce the same result still needs an authorised re-run
  ([`live-discovery-2026-11-20/present-and-correct/comparison.md`](./live-discovery-2026-11-20/present-and-correct/comparison.md)).

## A long catalogue on screen

Every product the feed lists is kept and shipped in the app's catalogue, so
search, detail pages, the bag and offline use all see the whole shop. Only the
first paint is bounded: the server renders the first 12 products of each shelf
and a `Show 24 more` control appends the next page from the same data. A line
above the catalogue reads `Showing N of M pieces`, where M is everything
imported and N is what is currently on screen; it updates as pages load and
when a shelf filter hides the others. Product keys, prices and order lines are
unchanged by paging: a key is still the product's position in the full
catalogue, rendered or not.

## Currency

A currency is published only when the shop's own pages prove one. Signals read,
in order of authority: `ShopifyAnalytics.meta.currency`, `Shopify.currency.active`,
`product:price:currency` / `og:price:currency` / `currency` meta, JSON-LD
`priceCurrency` or `currenciesAccepted`, and an unambiguous `£`/`€`/`₹`/`¥` in the
shop's money format. One distinct code is published and stored with its method
and source (`currencySource`); two become a conflict that publishes no code and
asks the owner; none becomes a request for confirmation. The owner's answer is
stored with method `owner`. An imported build with no confirmed currency shows
amounts without a symbol — only generated demo builds, which have no source
shop, keep `$`. Order responses carry the build's currency beside the
minor-unit amounts.

## Re-running

That run was a single authorised read. Another one needs explicit authorisation,
and the plan's budget and evidence rules still apply.
