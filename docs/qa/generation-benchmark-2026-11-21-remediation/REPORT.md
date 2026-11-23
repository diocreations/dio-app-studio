# Generation intelligence remediation — 21 November 2026

This report covers the work done after the [original benchmark](../generation-benchmark-2026-11-21/).
The original directory is unchanged and remains the record of what the generator
did before this work. Everything here was produced from the **same five saved
crawls**: no website was recrawled, no paid model was called, nothing was
deployed and no payment flow was activated.

The benchmark is not marked passed as a whole. Each business is judged below,
including the one criterion that still fails.

## What changed

| Area | Change |
| --- | --- |
| Page and item judgement | New `src/worker/catalogue.ts`: page roles (inventory, policy, article, location, contact, about, navigation, promotion), trade-specific inventory paths, per-trade evidence rules and a single `assessItem` verdict. The importer, discovery and the verification harness all use it. |
| Crawl selection | Sitemaps and aisle queues rank inventory pages only; policy, journal, project-case-study, location, promo and navigation URLs never enter the queue. |
| Evidence | Every item records source URL, extraction method, original text/value, confidence, price evidence, image, currency evidence and validation status. Rejected rows keep their name, section and refusal reason. |
| Identity | Business-name casing is preserved (`yarmouthoilskins` stays as the source wrote it). Contact details are harvested from every crawled page. A name that came from the host, not the page copy, raises a confirmation question. |
| Fulfilment | `AppSpec.fulfilment` records whether options came from the website, the owner, or a Plattr default. No delivery fee is published unless verified or owner-set. |
| Editor | Heading limit unified at 90 characters in the editor and on the server. The Blue Tit defect was a **client-side 60-character clamp** applied before the server saw the value. Empty catalogues now offer the owner a first section and item instead of rendering nothing. Action-only blocks no longer show a Heading field they never draw. |
| Concepts | No filler sections were added. `dine-note` no longer prints a stock "Seasonal · cooked to order" sentence when it has no text. |
| Tests | `tests/trade-catalogue.test.ts` (23 tests) covers the classifier directly; price-evidence and checkout acceptance tests updated. |

## Headline results

| Business | Saved report | Before | After | Rejected rows | Verdict |
| --- | --- | --- | --- | --- | --- |
| Yarmouth Oilskins | 90 rows | 90 | **74** | 16 | Pass on inventory, evidence, identity, currency, concepts, editor, visual and responsive |
| Padella | 5 rows | 5 | **0** (honest empty) | 5 | Pass on honesty and evidence; **fails concept structural distinctness** (see below) |
| Hotel Pelirocco | 9 rows | 9 | **0** (honest empty) | 9 | Pass on honesty and evidence |
| Blue Tit | 82 rows | 82 | **82** | 0 | Pass on inventory, identity, editor (including the reported defect); photographs still absent from the source |
| Architecture for London | 8 rows | 8 | **1** | 7 | Pass on honest thin inventory and disclosed gaps |

Verification: **64 of 65** checks pass. The one failure is Padella's concept
diversity, explained under that business. 695 project tests pass, typecheck
passes.

## Yarmouth Oilskins — retail

- **Inventory.** 74 items across 13 sections (Catalogue 20, Shirts 12, Trousers 9,
  Shorts 8, Jackets 5, Hats 4, Oilskins 4, Smocks 3, coats 3, plus knitwear,
  dungarees, vests, bags). All 74 carry a validated price and their own
  photograph (74 photographs, 74 distinct URLs).
- **Rejected.** 16 rows: two navigation labels ("View Now", "Shop Now"), a gift
  card with no evidence, and 13 colour-only rows ("The Engineer Jacket - Navy"
  and similar) that are variants of an existing product, not separate products.
- **Evidence.** Every accepted row keeps `sourceUrl`, `sourceMethod`, the
  original price text and its validated price evidence.
- **Identity.** `yarmouthoilskins` is the host name, not a title-cased guess; the
  owner is asked to confirm it. Tagline "Yarmouth Oilskins Est." is source text.
- **Currency.** GBP, stated by the source's product records.
- **Concepts.** Minimal, Editorial and Lifestyle differ on all seven architectural
  axes and in section order; no extra sections were added to force a difference.
- **Editor.** 3/3 apps: heading edit, save, customer parity, undo, redo, variant
  price edit, reload.
- **Visual / responsive.** 390, 430, 768 and 1280 px: no overflow, no console or
  network failures. Screenshots in `screens/yarmouth/`.
- **Gap.** The name still needs the owner's confirmation; that is a question, not
  a published guess.

## Padella — restaurant

- **Inventory.** Empty, correctly. The five saved rows were a Cookie Policy, a
  Privacy Policy and three location pages (Shoreditch, Borough Market, Soho).
  None is a dish, and the saved crawl contains no menu item with a price.
- **Disclosure.** The catalogue screen states that nothing has been added yet and
  why; the owner is asked for the menu. The editor now lets them add the first
  section and item, price it, and publish it (verified live, then removed).
- **Identity.** Padella, tagline and story preserved; category from the nearest
  trade; GBP.
- **Concepts.** **The structural-diversity check fails.** Editorial, Modern and
  Luxe differ on all seven architectural axes (navigation model, header,
  catalogue, cards, detail page, type system, image treatment) and in opening
  screen and palette, but both surviving home blocks (`dine-title`,
  `dine-actions`) appear in the same order in Editorial and Luxe. With no dish,
  no hours, no address and no contact, there is no third real section to place.
  I tried the published story as an editorial "kitchen note"; it rendered as a
  sticky one-line banner and looked worse, so it was removed rather than kept to
  turn the check green. This is the honest limit of the saved evidence, and the
  reason the run is 64/65.
- **Editor.** 3/3 apps pass, including the empty-catalogue flow.
- **Visual / responsive.** No overflow and no failures at any width; screenshots
  in `screens/padella/`. The app is visually complete but thin, as the source is.

## Hotel Pelirocco — hotel

- **Inventory.** Empty. The nine saved rows were a privacy policy, four
  promotion/hire rows (loyalty club, venue hire, business hire, private hire,
  private party, packages), a blog post and press quotes. No room with a name,
  description and rate was captured.
- **Disclosure.** Empty catalogue disclosed; owner asked for rooms.
- **Identity / currency.** "Hotel Pelirocco", GBP with no rate to publish.
- **Concepts.** Distinct on all seven axes and order; no rooms invented to fill
  them.
- **Editor.** 3/3 apps pass.
- **Visual / responsive.** No overflow/failures; screenshots in `screens/pelirocco/`.

## Blue Tit — salon

- **Inventory.** 82 treatments in one section, from the site's own service records.
  Seven carry a verified price; the rest are real services whose price the source
  did not state, so they remain unpriced rather than guessed.
- **Photographs.** The saved evidence contains no per-treatment photographs.
  Cards therefore show empty media, not stock imagery. This is a source
  limitation and is disclosed; it is the weakest visual result of the five.
- **Identity.** "Blue Tit London" casing preserved; the 68-character tagline is
  real source text.
- **Editor defect.** Reproduced, root-caused and fixed: the editor's optimistic
  patch clamped headings to 60 characters while the server allowed 90, so the
  saved title was silently truncated and the customer app never received the
  edit. After the fix the luxe concept passes edit → save → reload → undo → redo
  → customer parity, with the full 68-character heading. All three Blue Tit
  concepts pass (3/3 apps).
- **Currency.** GBP, with the £26 price on the one priced treatment shown in the
  app.
- **Concepts.** Distinct on all seven axes and order.
- **Visual / responsive.** No overflow and no failures; screenshots in
  `screens/bluetit/`. Heading wraps to four lines at 390 px, which is expected for
  a 68-character source tagline.
- **Editor after fix.** 3/3 apps, every assertion passing.

## Architecture for London — professional services

- **Inventory.** One real service retained: **Build**. Seven rows rejected: six
  project case studies (proof of work, not services) and the "Projects Archive"
  navigation label.
- **Evidence.** The service carries its section, source page and method; no price
  is published because the practice quotes.
- **Identity.** Real phone, email and hours imported; the address is missing from
  the saved crawl and is asked for, not invented.
- **Concepts.** Classic, Minimal and Editorial differ on all seven axes and order.
- **Editor.** 3/3 apps: heading, save, parity, undo, redo, price edit, reload.
- **Visual / responsive.** No overflow/failures; screenshots in `screens/afl/`.

## Verification detail

- `bun scripts/generation-benchmark-remediation.mjs` → `verification.json`, 65
  checks, 64 pass.
- `bun scripts/generation-benchmark-editor.mjs <site>` → `editor.json`, 15 apps,
  97 assertions pass, 0 fail. Sixteen checks are skipped for stated reasons:
  twelve variant checks where the live catalogue has no variant prices
  (Padella, Pelirocco, Blue Tit, AFL), three Yarmouth base-price checks because
  every row is variant-priced (its variant edit ran instead), and one heading
  check on Padella Modern because its catalogue-first opening screen shows no
  section title. Yarmouth's variant edit and AFL's price edit ran.
- `bun scripts/generation-benchmark-editability.mjs` → `editability.json`, 15/15
  apps pass with no missing or duplicated elements.
- `bun scripts/generation-benchmark-capture.mjs` → `capture.json`, 15 apps at
  390/430/768/1280 px: **0 overflow, 0 console failures, 0 network failures**,
  84 screenshots under `screens/<site>/`.
- `bun run typecheck` passes; `bun test` passes 695/695.

## Limitations

1. **No raw HTML was saved** for the five crawls. The remediation re-runs
   classification over the recorded crawl output (rows, prices, images, page
   lists, price evidence). It proves what the generator publishes from that
   evidence and refuses to invent the rest; it cannot re-prove page-level
   extraction beyond what the saved report recorded.
2. **Padella concept diversity** fails as described; it was not forced green.
3. **Blue Tit imagery** is absent from the saved evidence; the cards are empty
   rather than stock-filled.
4. **Yarmouth's name** is the source's own lowercase host string and needs owner
   confirmation before publication.
5. The local dev D1 daily budget counters were reset to complete seeding. This is
   a local QA database only; no production data was touched.
6. Nothing was deployed, no crawl was made and no paid model or payment provider
   was activated.

## Reproduce

```sh
bun run typecheck
bun test
bun scripts/generation-benchmark-remediation.mjs
BENCH_ROOT=docs/qa/generation-benchmark-2026-11-21-remediation \
BENCH_APPS=.chrome-qa/generation-benchmark-apps-remediation.json \
  bun scripts/generation-benchmark-editor.mjs yarmouth   # and padella/pelirocco/bluetit/afl
```
