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
| Variant IDs | **pass for optioned products** — 1190 IDs, all numeric feed IDs | `recheck.json` |
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
2. **The shop's own option labels are proof.** This shop names options `£10`,
   `£20` … `£200` at prices of 1000, 2000 … 20000, which is the shop printing
   its own money. The reader records one non-dollar mark used beside a number in
   the option names (unique currency → published; two → conflict, owner asked).

Applied to this run's saved feed, the label evidence resolves **GBP**
(`recheck.json`: `labels: [{ code: "GBP", raw: "£ in the option name \"£10\"" }]`).
That is a local recomputation over `feed.json`; no request was made.

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
  INR; presentment-only evidence is now refused, and this shop's own `£` option
  labels resolve GBP against the saved feed. The end-to-end GBP result has not
  been seen from a live page, and under this approval it will not be: the one
  run is spent.
- **Not verified live:** single-variant products keep name, price, photograph
  and shelf, but not their Shopify variant ID (unchanged from the earlier
  design); checkout and payment were not exercised (neither is activated);
  the brief's currency control was not clicked in a browser.
- **`bun test`:** 590 pass, 0 fail. `bun run typecheck` and `bun run build`:
  clean.
