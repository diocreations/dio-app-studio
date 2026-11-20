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

## What a live run still has to prove

The checks are listed, with pass criteria and evidence to capture, in
[`present-and-correct-crawl-plan.md`](./present-and-correct-crawl-plan.md). That
run has not been authorised; this document claims no live result.
