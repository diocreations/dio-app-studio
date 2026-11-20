# Live website discovery — five approved crawls, run once

Run: `bun scripts/live-discovery.mjs` on 20 November 2026. Each URL was crawled
**exactly once**; no crawl was repeated, no budget was raised. Selection and
robots.txt pre-checks: `SELECTION.md`.

Limits in force: 10 pages, 900 KB/page, 6.5 s/page, 20 s wall clock, same host,
robots respected, sitemap only when the entry page is thin.

## Results at a glance

| Site | Read as | Name | Items | Priced | With own photo | Conflicts | Questions | Pages | Time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| buttertales | shop (verified) | Butter Tales™ | 4 | 4 | 4 | 0 | 1 | 6 | 4.3 s |
| dishoom | restaurant (verified) | Dishoom Indian Restaurants | 9 | 9 | 0 | 1 | 2 | 10 | 6.8 s |
| service (Pimlico) | trades (verified) | Pimlico Plumbers | 9 | 9 | 0 | 1 | 1 | 19 | 17.2 s |
| store (Present & Correct) | shop (verified) | Present & Correct | 136 | 0 | 0 | 0 | 2 | 10 | 9.8 s |
| complex (RHS) | shop (verified) | RHS | 56 | 36 | 0 | 1 | 3 | 18 | 18.7 s |

All five crawled successfully; none wrote a `failure.json`.

## Verification against the source

| Check | Source says | Plattr says | Verdict |
| --- | --- | --- | --- |
| ButterTales currency | `INR` ×41, `₹` | INR | **correct** |
| ButterTales price, Letterloo | product JSON-LD `"price":"522.00"` | 52200 (₹522) | **exact** |
| ButterTales item images | 4 item-scoped images | 4, tied per item | **correct** |
| ButterTales name | `og:site_name` | Butter Tales™ | **correct** |
| Dishoom name/trade | restaurant group | restaurant, "Dishoom Indian Restaurants" | **correct** |
| Dishoom catalogue | store merchandise (hampers, books), menu lives at `/menus/` | 9 store products, `£37` Chai Gift Set etc. | **wrong surface**: a restaurant app built from its gift shop |
| Dishoom prices | meal kits £20–£35, hampers £37–£55 | £37, £39, £27, £55 | **prices match the store pages** |
| Dishoom images | product images exist | 0 attached | **missing** |
| Pimlico services | `/services/` lists service pages | 9 services | **correct surface** |
| Pimlico prices | no `£` price appears on `/services/` | every service `£1,000` | **wrong** — a single repeated value, not a price |
| Present & Correct prices | Shopify product JSON has prices | 0 of 136 priced | **missing** |
| Present & Correct images | product photography exists | 0 attached | **missing** |
| RHS catalogue | bookshop + plant pages | 56 "items", including `More ernst benary &rsaquo;`, `About us` | **wrong** — navigation captured as products |
| RHS heading | "…leading gardening charity" | truncated mid-word at 90 characters | **truncated** |

## Findings, in order of severity

**F1 — The three concepts are one document.** For every flagship trade the three
directions render the *same* screen: same type, same palette, same layout, same
density. The only visible difference in the ButterTales set is the tab label
(`Home` vs `HOME`). This fails the approved condition that three concepts must be
three genuinely distinct applications, and it is visible in
`buttertales/concepts/*.png` and `store/concepts/*.png`.

My Stage-0 test asserted three distinct rendered strings and passed because the
page embeds a different document JSON per concept — a false positive. The test is
corrected to assert what is true (each document records its own direction) and
the visible-distinctness requirement is recorded here as **not met**, not as
passing.

**F2 — A restaurant is being built from its gift shop.** Dishoom's crawl chose
`/store/` product collections over `/menus/`. The trade is right, the catalogue
is the wrong surface, and the concept shows "Chai Gift Set £37.00" under "FROM THE
KITCHEN". The crawler needs a trade-aware surface preference: for a restaurant,
menu pages outrank shop pages.

**F3 — Fabricated-looking prices are accepted.** Nine Pimlico services all cost
exactly `£1,000`, and no `£` price appears on the crawled service pages. This is
the most dangerous failure in the run: it is a price the source never stated.
Needed: drop a price when it is identical across unrelated items, and ask.

**F4 — Prices and images are missed on hosted storefronts.** Present & Correct
yields 136 correct product names with **no prices and no photos**, so the concept
shows 136 unpriced, unillustrated cards. Shopify exposes both; the extraction
does not read them.

**F5 — Navigation is captured as products.** RHS "sells" `More ernst benary
&rsaquo;`, `About us` and `Indoor plant care`, and an HTML entity survives into
the item name. Section links must never become catalogue entries, and entity
decoding must be complete.

**F6 — Name conflicts are noisy.** Three of five sites report a `name` conflict
that is not a conflict: Pimlico's page titles are three legitimate variants of
one name, and Dishoom's "conflict" compares the business name with a marketing
sentence. Conflicts need normalisation before they are shown to an owner.

**F7 — Trade questions fire without cause.** "Which trade?" appears on Dishoom,
Present & Correct and RHS because a keyword scan matched inside item names. A
question an owner cannot act on is worse than no question.

**F8 — Names are truncated mid-word.** `slice(0, 90)` cuts "gardening" to
"gardenin". Truncation must land on a word boundary or a whole clause.

## Questions actually presented

| Site | Blockers | Confirmations |
| --- | --- | --- |
| buttertales | — | contact (no phone/email published) |
| dishoom | — | contact; trade |
| service | — | trade |
| store | — | trade; trade |
| complex | — | contact; trade; trade |

Only the contact questions are justified. The duplicate `trade` questions are F7.

## The questionnaire has not yet been shortened

`/api/discover` returns what was extracted and which questions remain, but the
brief still walks the same four steps after an import. **Acceptance item 4 is not
met.** The data needed to remove steps exists; the UI change does not.

## What is verified and what is not

Verified: correct business identification on 5/5, correct trade on 5/5, exact
prices on ButterTales and on Dishoom's store pages, item-scoped images on
ButterTales, and five successful crawls within unchanged limits.

Not verified: prices on Pimlico (wrong), prices or images on Present & Correct
(missing), catalogue correctness on Dishoom and RHS, distinctness of the three
concepts (fails), and the shortened questionnaire (not built).

## Reproducing one site

```
bun scripts/live-discovery.mjs buttertales        # skipped: already crawled
FORCE=1 bun scripts/live-discovery.mjs buttertales  # a deliberate second crawl
bun scripts/capture-concepts.mjs                  # re-shoot the 15 concepts
```

No crawl in this run has been repeated. A second crawl of any site should wait
until F2–F7 are fixed, so the repeat measures the fix rather than the same faults.
