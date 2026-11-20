# Second live crawl — before and after

One crawl per site, same limits (10 pages, 900 KB, 6.5 s/page, 20 s wall), no new
sites. First run: `docs/qa/live-discovery-2026-11-20` (untouched). Second run:
this folder.

| Site | Items before → after | Priced before → after | Own photos | Conflicts | Questions | Pages |
| --- | --- | --- | --- | --- | --- | --- |
| buttertales | 4 → 4 | 4 → 4 | 4 → 4 | 0 → 0 | 1 → 1 | 6 → 7 |
| dishoom | **9 → 87** | 9 → **87** | 0 → 0 | 1 → **0** | 2 → **1** | 10 → 10 |
| service | 9 → 9 | **9 → 0** | 0 → 0 | 1 → **0** | 1 → **0** | 19 → 19 |
| store | 136 → 136 | **0 → 0** | 0 → 0 | 0 → 0 | 2 → **0** | 10 → 10 |
| complex | **56 → 9** | **36 → 0** | 0 → 0 | 1 → **0** | 3 → **1** | 18 → 19 |

## P2 — trade-aware source selection: fixed for the site that proved it

Dishoom's crawl now reads `/menu/collection/`, `/menu/breakfast/`,
`/menu/vegan-main/`, `/menu/drinks/`, `/menu/desserts/`, `/menu/group-feast/`
rather than `/store/collections/…`. Result: **87 dishes across Breakfast,
Biryani, Ruby Murray and Daal, Salad**, all priced in GBP, first items
`Bacon Naan Roll £11.70`, `Sausage Naan Roll £12.50`, `X £10.70`.

The gift shop is gone from the catalogue. That is the defect fixed at its cause
(path preference plus the trade's own entry points), not filtered afterwards.

## P1/P3 — price and navigation safeguards: held

- Pimlico: 9 services kept, **0 priced**, 9 prices cleared and recorded. The
  invented £1,000 is no longer customer-visible.
- RHS: 56 → **9 items**, 0 priced, no navigation, no `&rsaquo;`, no "About us".
- ButterTales: all 4 prices and all 4 item photographs unchanged, INR preserved.
  The guard did not swallow real prices.

## P4 — conflicts and questions: materially quieter

Conflicts: **5 → 0** across the five sites (Dishoom's marketing sentence, three
Pimlico title variants, RHS's GBP/USD). Questions: 9 → 3, and no duplicate
fields; only buttertales/contact, dishoom/contact and complex/contact remain, all
justified (none of those sites publishes a contact address on the pages read).

## P5 — concepts: fixed for retail, **not** fixed for four flagship trades

- Retail and the twelve composition trades: three visibly different designs
  (serif single-column editorial, dense square grid, soft rounded cards) —
  verified in `buttertales/concepts/*.png` and the round-2 set.
- Restaurant, hotel, salon and professional services: the three directions change
  **typography and spacing only**; the composition is still shared. Evidenced by
  `docs/qa/directions-2026-11-20/restaurant--editorial.png` against
  `restaurant--modern.png`. These four trades do **not** yet meet "three
  genuinely distinct designs".

## What is still wrong

1. **Present & Correct: 136 names, 0 prices, 0 photos.** Unchanged. Shopify
   product offers and images are still not read.
2. **No images on any site except ButterTales.** Dishoom's dishes have no
   photographs, so its concept shows abstract art where a dish photo belongs.
3. **Eleven of the fifteen live concept screens are unverified by eye** in this
   round; the retail three and two restaurant direction captures were inspected.
4. **P7 is implemented but not exercised in a browser.** An import that read a
   name, a trade and at least one item now lands on Delivery and marks the trade
   and feature steps as read; the four-step walk is skipped. No end-to-end
   browser run is claimed.
5. **Restaurant/hotel/salon/professional concept collapse** (above).

## Verdict

P2, P4 and the acquisition guards are demonstrably improved on the same five
sites, within unchanged limits. The URL-first milestone is **not complete**: one
retailer still yields no prices or photographs, four flagship trades still share
one composition across three concepts, and the questionnaire skip is untested in
a browser.
