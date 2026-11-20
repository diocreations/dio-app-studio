# Present & Correct: the final authorised read

One read of `presentandcorrect.com`, made once on 20 November 2026 with the
original plan and limits unchanged: 20 s wall clock, 10 page reads, 3 Shopify
feed pages, 6 s per request, 900 KB per body. It was not retried, no second
website was touched, and nothing was deployed or charged.

This folder holds that run's evidence. It sits beside, and does not replace:

- `docs/qa/live-discovery-2026-11-20/present-and-correct/` — the first read and
  its after-the-fact comparison;
- `docs/qa/shopify-feed.md` — the feed reader's notes.

## The run, as it happened

```
crawled https://www.presentandcorrect.com/ in 7148 ms · requests 11 (pages 9) · feed pages 3 · products 706 · published 706
variants 275 · conflicts 0 · unpriced 0 · images 706 (unassociated 0) · currency INR
```

| Limit | Allowed | Used |
| --- | --- | --- |
| Wall clock | 20 s | 7.148 s |
| Page reads | 10 | 9 |
| Feed pages | 3 | 3 (250 + 250 + 206) |
| Per request | 6 s | under |
| Per body | 900 KB | 530,838 B (page 2) |

Files: `report.json` (the build), `feed.json` (all 706 feed products),
`spec.json`, `app.html`, `page-2.html`, `requests.json`, `checks.json`,
`recheck.json` (see below).

## Check by check

| Check | Result | Evidence |
| --- | --- | --- |
| Products | **pass** — 706 of 706, three feed pages, last page short | `checks.json` `1_feed`, `2_pagination` |
| Product names | **pass** — 705 exact, 1 differs only by a doubled space (`Braun  Calculator`) | `checks.json` `3_names` |
| Images | **pass** — 706 photographed, 705 matched to the feed by URL, 0 unassociated | `checks.json` `4_images` |
| Variants | **pass** — 275 products with options, every option keeps its feed ID, name, price and exactly one `selected` | `checks.json` `5_variants`, `11_ids` |
| Variant IDs | **partial in the run** — 1190 IDs for optioned products; simple products were published without their single ID. Fixed after the run; see `currentReader` in `recheck.json` | `checks.json` `11_ids`, `recheck.json` |
| Customer-facing currency | **fail** — the build published `INR` and printed `₹`, because the storefront told the reader it was in India | `checks.json` `6_currency`, `12_currency_visible`, `report.json` |
| Currency detection | **fail** — the only signal was `shopify-analytics` | `report.json` `site.currencyEvidence` |
| No dollars | **pass** — zero `$<digit>` in the rendered app | `checks.json` `12_currency_visible` |
| Catalogue paging | **pass** — 19 first-paint cards across three shelves (12 + 2 + 1), `Show 24 more`, second page 24 cards starting at key `0-12`, rendered by the same server renderer, no `<html>` and no second card function | `checks.json` `10_paging`, `page-2.html` |
| Budget | **pass** — within every limit | `checks.json` `9_budget` |

## Why the currency was wrong, and what changed

`ShopifyAnalytics.meta.currency` was `INR`. That value is Shopify's
**presentment** currency: what the storefront shows the current visitor, chosen
from the visitor's country. The reader was in India, so the shop offered rupees.
Its `/products.json` prices are the shop's own base-currency amounts — the feed
lists `3.00` for a `£3` card.

The reader had treated that presentment code as proof. Two changes now keep it
from doing so:

1. **Presentment is a hint.** `shopify-analytics` and `shopify-currency` no
   longer publish a currency; they are listed as candidates so the brief can
   ask. A code is published only from meta, JSON-LD, a money format, the shop's
   own option labels, or the owner's answer.
2. **The shop's own option labels are evidence, not proof on their own.** This
   shop names options `£10`, `£20` … `£200` at prices of 1000, 2000 … 20000,
   which is the shop printing its own money. A label counts only when it agrees
   with that option's own price; two or more products agreeing on one code
   publish it; one product is a hint the brief offers the owner; two label
   codes, or a label code that contradicts a proven page code, are a conflict
   and nothing is published.

Applied to this run's saved feed, the labels are a **hint of GBP, not proof**:
they come from one product (the gift card), so `recheck.json` records
`labels: [{ code: "GBP", products: 1, validatedPairs: 12, rejectedPairs: 0 }]`,
`labelProof: false`, and the brief must ask the owner. That is a local
recomputation over `feed.json`; no request was made. Live GBP detection is
therefore **not** verified — the run detected INR, and the saved evidence does
not settle it on its own.

The run also surfaced a truncation the earlier read could not: two products
(`Alphabet Notebook`, 26 options; `French Alphabet Blotter (1960s)`, 25) lost
their last options to a 24-option cap. The cap is now 200, which is only a guard
against a malformed feed.

## What the browser showed

Local dev build of the saved 706-product catalogue, after the paging refactor:

- first paint 12 cards on `Catalogue`, `Showing 15 of 706 pieces`, `Show 24 more`;
- two loads: 36 then 60 cards, 60 unique keys, `0-12` … `0-59`,
  `Showing 63 of 706 pieces`, label `Showing 60 of 703`;
- appended cards carry their own photograph and `£` price (`0-12` at `£4.75`).

## Status, kept separate

- **Live-verified by this run:** 706 products, 3 feed pages, images, the
  275-optioned-product catalogue with its IDs, the absence of dollar amounts,
  catalogue paging, and the whole crawl budget.
- **Failed live, fixed and fixture-tested:** currency. The run itself published
  INR; presentment-only evidence is now refused, the shop's own `£` option
  labels are a hint rather than proof, and the brief asks the owner. Live GBP
  detection has not been seen on a live page, and under this approval it will
  not be: the one run is spent.
- **Fixed after the run, fixture-tested only:** simple products keep their
  single Shopify variant ID, price, currency, image and `selected` marker; the
  reader now ships all 1624 feed variants (275 optioned products, 431 simple)
  when it re-reads this run's saved feed (`recheck.json`, `currentReader`).
- **Not verified live:** checkout and payment were not exercised (neither is
  activated); the brief's currency control was not clicked in a browser.
- **`bun test`:** 590 pass, 0 fail at the time of the run's report; see the
  section below for the current count. `bun run typecheck` and `bun run build`:
  clean.

## After the review: what changed since this run

These changes are fixture-tested and browser-tested; none of them is a new read
of the shop, and the evidence above is unchanged.

- **The cards route is bounded.** `from` and `count` are clamped at the route
  (`from` 0–5000, `count` 1–60) and again in the renderer, so `count=9999`,
  `from=-4` or a far `from` cannot ask for an unbounded or imaginary render.
  A non-number answers 400; a page past the end answers 200 with an empty body.
- **A single product's labels are a hint.** As above: the live gift card alone
  cannot publish GBP. Two products whose labels each match their own option
  price do; a label that disagrees with its own price is discarded; a page code
  and a label code that disagree are a conflict and the owner is asked.
- **Simple products keep their option.** Every Shopify product now carries its
  variant list, including the 431 with exactly one option, keeping the ID,
  price, currency, image association and `selected` marker. The bag records the
  option for those products too, so the order names the Shopify variant; an old
  bag that names only the product resolves to that single option. The order
  read now returns `variantId` alongside `variant`.
- **Paging is tested per shelf.** Multiple shelves, independent shelf pages,
  sequential pages with no duplicate or missing key, concurrent fetches for two
  shelves, repeated clicks, search and filter after paging, and detail views of
  appended products from the shipped payload without a request.
- **Commerce consistency is tested** for one product: card, fragment, bag line,
  bag total, order creation, order retrieval, dashboard and payment page all use
  the same variant, price, currency and amount; an unconfirmed currency stays
  bare on every one of them.

Current checks: `bun test` 605 pass, 0 fail; `bun run typecheck` and
`bun run build` clean.

### Browser check after the review

Local dev app of the 706-product build:

- first paint 12 cards on `Catalogue`, `Show 24 more`; two loads → 60 cards, then
  one more → 84, all unique keys (`0-0` … `0-83`), `Showing 87 of 706 pieces`;
- three presses on `Show 24 more` in one tick appended one page only (60 → 84,
  no duplicate row): the disabled guard holds;
- the `Pad` and `Geyer instructional` shelves were untouched while `Catalogue`
  grew (2 and 1 cards before and after);
- search after paging for a product only present at `0-83` found it (`£6`);
- filtering to `Pad` after paging left that shelf alone; `All` restored all 84
  rows, so filtering does not reset the loaded page;
- with `fetch` forced to reject before opening `0-83`, the detail screen opened
  from the shipped payload with `£6` and made zero requests;
- bag: `0-0` at `£7.50` matched its card, `0-8` at `£3` matched its option,
  totals added up, and no `$` amount appeared anywhere (113 `£` amounts, 0
  dollar amounts).

A local fixture build (one simple product, one two-option product) checked the
new option identity in the browser:

- the simple product shows no option chooser, prices `£7.50` on card, detail and
  bag line, and its bag key is `0-0::vp-single`;
- choosing `Large` on the shirt moves detail to `£48`, the bag line to
  `Linen Shirt — Large £48`, totals to `£55.50`;
- the order the browser sends names both options (`vp-single`, `vp-large`) with
  their keys; the request was intercepted and answered locally, so no order row
  was written;
- a bag saved the old way (`{"0-0":1}`, no option) still shows `£7.50` and sends
  `variant: "vp-single"`, so an old bag keeps its identity.
