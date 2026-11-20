# Live discovery acceptance — site selection (recorded before crawling)

Five sites, five different structures. Each is crawled **once**. robots.txt was checked before selection with the importer's own user agent; no page
content was fetched to make this choice.

| # | Site | URL | Why this one | robots.txt |
| --- | --- | --- | --- | --- |
| 1 | ButterTales | `https://www.buttertales.com/` | Small independent bookshop. Already the project's proof case: the home page links few products, so the **sitemap** has to supply them. Tests: product JSON-LD, item-scoped images, prices with a currency. | 200, no rule against us |
| 2 | Dishoom | `https://www.dishoom.com/` | Restaurant group, not a single restaurant. Menus sit behind navigation, multiple locations, heavy front-end. Tests: **trade classification as restaurant**, menu sections, hours and address, and what happens when the menu is partly client-rendered. | 200, no rule against us |
| 3 | Service business | `https://www.pimlicoplumbers.com/` | Established plumbing/heating firm: service pages with prices, no basket, enquiry-led. Tests: **services rather than products**, "from £x" prices, no cart, a quote path. | 200, only `/wp-admin/` disallowed |
| 4 | Online store | `https://www.presentandcorrect.com/` | Hosted storefront (Shopify): collection pages, pagination, product JSON-LD with offers and images. Tests: **large catalogue bounded by the page cap**, item-to-image association, currency, variants. | 200, cart/admin disallowed |
| 5 | Complex website | `https://www.rhs.org.uk/` | Large institution: sitemap index, tens of thousands of URLs, many sections (gardens, events, shop, advice), heavy navigation. Tests: **crawl budget and sitemap handling**, section choice, honest reporting when the cap bites. | 200, only a few file types disallowed |

Rejected before crawling: `nationaltheatre.org.uk` and `waterstones.com` both
answer `robots.txt` with **403**, which is a refusal to crawlers. They are not
used; a site that blocks robots is not a fair test of extraction, it is a test of
whether Plattr ignores a refusal.

## Limits unchanged

`MAX_PAGES = 10`, 900 KB per page, 6.5 s per page, 20 s wall clock per import,
one retry, same-host only, robots checked before the first page, sitemap read
only when the entry page is thin. Nothing in this run raises a budget.

## Reproducing

```
bun scripts/live-discovery.mjs            # all five, skipping any already done
bun scripts/live-discovery.mjs buttertales
FORCE=1 bun scripts/live-discovery.mjs store   # only if a crawl is repeated
```

Artifacts land in `docs/qa/live-discovery-2026-11-20/<site>/`: `report.json`,
`discovery.json`, `questions.json`, three concept specs, three concept documents
and three rendered screens per site. A failed crawl writes `failure.json` with its
code and reason instead of pretending to have data.
