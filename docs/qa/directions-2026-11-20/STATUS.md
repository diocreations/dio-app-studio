# Third workstream: evidence, storefront feed and composition

## Tested in code

- **Prices carry proof.** Every extracted price now records `priceEvidence`:
  method (`json-ld`, `shopify-variant`, `meta`, `text`), source URL, the raw
  value, currency and `validated` (true only when the number sat inside that
  item's own record or card). `importWebsite` runs `cleanMenu` with
  `requireEvidence: true`, so an unproven price is cleared and listed in
  `quality.suspectPrices` with `reason: 'unverified'`.
- **The identical-price heuristic is no longer the only guard.** It survives
  only for stored catalogues that predate evidence. Five new tests cover: nine
  identical prices with individual evidence kept, nine identical without
  evidence cleared, nine *different* fabricated prices cleared, different
  verified prices kept, a missing price left empty (`tests/price-evidence.test.ts`).
- **Hosted storefront feed.** A Shopify store's `/products.json` is read
  (bounded to 3 pages, robots-checked) and each product contributes its title,
  its cheapest variant price with the variant's own raw value, its variants and
  its first accepted image. The feed is used only when it yields three or more
  products, and its requests count against the page budget.
- **Regression against the round-2 report.** The saved Present & Correct report
  is the baseline (136 names, 0 prices, 0 photographs). A feed built from those
  same 136 names now yields 136 verified prices, 133 paired photographs and
  per-product image association; the two products literally named "Cover" still
  lose their photograph to the decorative-filename gate and keep their price.
- **Brief page script fixed.** The page's inline JS had a syntax error (an
  unescaped apostrophe in "trade's") that stopped every handler from running.
  Nothing on `/brief` worked before this; it now parses.

## Verified in a browser

Against the running dev server, with the import response served from the saved
round-2 Dishoom report (no live crawl):

1. `/brief` → "Paste the link" → URL → "Read the site".
2. The page filled: name `Dishoom Indian Restaurants`, 87 items, steps 2 and 3
   marked "Read from your site", and it went straight to the design step; the
   four-step questionnaire was not shown.
3. Three concepts were generated for the read trade and rendered as selectable
   cards: Editorial dining, Modern casual, Premium luxury.
4. Features arrived pre-ticked from the import (cart, bookings, loyalty, offers,
   reviews, gallery) with a $2,580 quote.
5. A build created from the same page opened its editor; changing the design
   direction to Premium luxury saved ("Saved") and survived a reload, with the
   business name intact.

## Not verified — reported, not hidden

- **Selecting a concept after an import did not advance to the features step.**
  The cards render and the handler is wired, but my click produced no state
  change, so concept → features → build through the imported path is unverified.
- **No live Shopify read.** Present & Correct was not crawled again, as
  instructed. The feed implementation is proven only against the fixture built
  from the saved report.
- **Prices from live text menus** (Dishoom, ButterTales) are recorded as
  validated only because the number sat in the item's own card; the evidence
  rule has not been re-run against a fresh crawl.

## Checks

`bun test` 529 pass, 0 fail · `bun run typecheck` 0 · `bun run build` 0 · the
first- and second-round crawl reports are untouched · 15 direction screenshots
in this folder, every one inspected by eye.
