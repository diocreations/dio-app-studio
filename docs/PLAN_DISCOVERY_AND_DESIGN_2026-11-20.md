# Plattr P0 — discovery-first generation and premium design

**Audit and implementation plan, 20 November 2026. Nothing in this document has
been implemented.** No production deployment, no payment activation, no M3 work,
no crawl of a customer site, no change to any project or business data. This is
the investigation and the acceptance plan the milestone asked for before code.

Commit base: `860e4e3`. Local Worker `127.0.0.1:8795`, headless Chrome 157 on CDP
9223, all captures made from the local build.

## 0. What was inspected, and what was not

Read in full or in the cited windows: `src/worker/prompt.ts`, `directions.ts`,
`themes.ts`, `design.ts`, `presets.ts`, `types.ts`, `verticals.ts` (all 27
entries), `doc.ts` (both document generators), `flagship.ts` (entry points and
composition table), `app.ts` (the render pipeline, `renderApp` at 1280–1400),
`importer.ts` (types, budgets, crawl rules), `importImages.ts`, `reimport.ts`,
`index.ts` (routes `/api/prompt`, `/api/import`, `/api/projects`, `/p/:token/app`),
`views/brief.ts` (form, import UI, design previews, payload), `flagshipImages.ts`,
`appCss.ts` at the token layer.

Captured and inspected: 16 screenshots at 390×844 — the ten flagship apps
(`docs/qa/flagship-390/`) and six audit captures (`docs/qa/audit-2026-11-20/`,
three brief concepts plus three non-flagship trades).

Not done in this pass: no generation was run for all 27 trades; no live crawl of
ButterTales, Dishoom or any external site (that spends the importer's outbound
budget and needs an explicit go-ahead); no editor or publishing run; no test
suite run, because no code changed. Every claim below is from code or from a
screenshot named beside it.

## 1. Current generation architecture (deliverable 2)

One generation engine, three entry points, one renderer:

```
/brief (4-step form) ─┐
/api/prompt (words)  ─┼─► createProject ─► pricing.buildSpec ─► AppSpec
/api/import (crawl)  ─┘                                        │
                                                               ▼
                        docFromSpec() / flagshipDocFromSpec() ─► Doc (screens + nodes)
                                                               │
                                     renderApp(spec, {doc, layout, design, structure})
                                                               │
              theme (trade) + direction (doc.design.direction) + layout deck
                                                               ▼
                            /p/:token/app  ◄─ same doc ─►  editor  ◄─► publish
```

| Concern | File | What it does |
| --- | --- | --- |
| Trade catalogue | `verticals.ts` | 27 trades: label, kind, tagline, story, hours, phone, address, accent, features, vocab, seeded menu, offers, loyalty, staff/team/timetable/events |
| Spec build | `pricing.ts` (`buildSpec`) | Fills an `AppSpec` from the form, the import, or trade defaults, and records which parts are still sample content |
| Words → trade | `prompt.ts` | 27 keyword tables, phrase-length scoring, `detectVertical` fallback; also the three global `DESIGNS` |
| Site → brief | `importer.ts`, `importImages.ts`, `design.ts` | Crawl, extraction, palette/type/nav reading, image association |
| Documents | `doc.ts` | `docFromSpec` (generic screens) and `flagshipDocFromSpec` (per-trade home composition) |
| Render | `app.ts` | One renderer for app, preview and published link; document blocks plus layout axes |
| Visual system | `themes.ts`, `directions.ts`, `presets.ts` | Per-trade theme; three directions per trade; optional preset CSS |
| Editing | `views/editor.ts`, `/api/projects/:token/doc` | Edits the document; versions; undo |
| Publish | `publish.ts` | Renders the saved document; no second implementation |

**The single source of truth holds.** The published page, the review link and the
editor all call `renderApp` with the saved document; `flagship` markup is only
used when the document actually contains flagship nodes (`app.ts:1330`), so a
saved document is never bypassed. That is the architecture the milestone asks to
preserve, and it is worth preserving.

**Where the design actually comes from** (`app.ts:1291–1390`):

1. `preview` = the axes saved on the spec (`spec.layout`), overridden by query
   axes on the demo route.
2. A direction is applied only if the document names one; new documents carry
   the trade's first direction.
3. Card layout, density, corners, hero composition, section order and hero scale
   are otherwise **dealt from a 2,304-layout deck keyed on a hash of the token**
   (6,912 including corners). The comment states it plainly: layouts are dealt,
   not chosen.
4. `media` is forced to `art` when no photographs resolve; flagship trades with
   photos render `photo`.

So a build's look is: trade theme × optional direction × a seeded layout × the
document. Of those four, only the document is the business's.

## 2. Inventory of every supported trade (deliverable 1)

27 trades. `home` is the home composition: **flagship** means a dedicated
`flagshipDocFromSpec` branch and renderer; **generic** means the shared document
stack. "Features" is what the build ships, from `VERTICALS[].features`.

| # | id | Intended business | Words recognized | Home | Features | Customer + owner workflows | Missing / incomplete |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `restaurant` | Neighbourhood restaurant | restaurant, bistro, pizzeria, sushi, takeaway… | flagship (dine) | catalog, ordering, booking, loyalty, offers, reviews, gallery | Menu → order (pickup/delivery/table) → book a table; owner: catalogue, orders, bookings, offers | Table plan, allergen fields, service periods, deposits |
| 2 | `cafe` | Coffee bar and bakery | cafe, coffee, bakery, brunch… | flagship (cafe) | catalog, ordering, booking, loyalty, offers, reviews | Order ahead, reserve, rewards; owner: catalogue, orders | Modifiers (milk/size), prep times, sold-out state |
| 3 | `shop` | Independent retail | shop, boutique, bookshop, florist… | flagship (shop) | catalog, ordering, delivery, loyalty, offers, gallery, reviews | Search, browse, bag, pickup/delivery; owner: catalogue, orders | Variants (size/colour), stock counts, returns |
| 4 | `salon` | Hair and beauty | salon, barber, nails, spa… | flagship (salon) | catalog, booking, quote, loyalty, offers, gallery, reviews | Day → treatment → stylist → slot; owner: services, diary | Per-staff availability, durations driving slots, deposits |
| 5 | `gym` | Strength and conditioning | gym, yoga, pilates, boxing… | flagship (gym) | catalog, classes, booking, quote, loyalty, offers, reviews | Timetable, class booking, memberships; owner: plans, classes, bookings | Class capacity and waitlists, recurring membership billing |
| 6 | `clinic` | Dental and health practice | clinic, dentist, physio, vet… | flagship (care) | catalog, booking, quote, reviews, gallery | Treatment → appointment; patient enquiry without medical detail | Clinician availability, appointment types/durations, consent |
| 7 | `trades` | Plumbing and heating | plumber, electrician, roofer… | flagship (trades) | catalog, quote, booking, reviews, gallery, offers | Quote request with photo note, call-out booking; owner: jobs, quotes | Job records, postcode/service area, photo upload on the quote, scheduling |
| 8 | `professional` | Accounting and advisory | accountant, solicitor, consultant… | flagship (`pro-*` fallback) | catalog, quote, booking, reviews | Proposal request, intro call; owner: services, enquiries | Engagement scoping, document requests |
| 9 | `property` | Estate agency | estate agent, lettings, realtor… | flagship (listing) | catalog, quote, booking, gallery, reviews, offers | Listing → viewing request; valuation request | Structured listing fields (beds/baths/EPC), saved searches, sold/let state |
| 10 | `hotel` | Guesthouse | hotel, guesthouse, b&b… | flagship (hotel) | catalog, booking, quote, offers, gallery, reviews | Room → dates → book | **No availability or inventory**: `slots: []`, no room-night model, no rate calendar |
| 11 | `studio` | Photography studio | photographer, videographer… | flagship (studio) | catalog, quote, gallery, reviews, booking | Package browse, shoot brief, call booking | Date holds, deliverable/usage terms |
| 12 | `auto` | Independent garage | garage, MOT, tyres… | flagship (auto) | catalog, booking, quote, reviews, offers | Service → slot; quote; owner: jobs, bookings | Registration lookup, vehicle records, parts/ labour split |
| 13 | `hospital` | Community hospital | hospital, urgent care, medical centre… | **generic** | catalog, booking, offers, reviews, quote | Department list, clinic booking | **No wayfinding, no visiting hours module, no service-status info**; screenshot shows a mono-hero and one row |
| 14 | `ecommerce` | Online store | ecommerce, online store, shopify… | flagship (grid) | catalog, ordering, delivery, offers, reviews, loyalty | Grid → product → bag → delivery; owner: catalogue, orders | Variants, stock, shipping rules, tax |
| 15 | `plants-indoor` | Houseplant shop | houseplants, terrariums… | **generic** | catalog, ordering, offers, reviews, gallery | Browse plants, order | Care-level filters, light/water attributes, pot pairing |
| 16 | `plants-outdoor` | Garden centre | garden centre, nursery… | **generic** | catalog, ordering, offers, booking, gallery | Browse stock, order, planting visit | Seasonal availability, bare-root vs potted, delivery size rules |
| 17 | `courses` | Online learning | online course, MOOC… | flagship (courses) | catalog, ordering, offers, reviews, loyalty | Course → enrol; free first lesson | **No lesson player, progress or access control**: buying a course yields a catalogue row |
| 18 | `tuition` | Tuition centre | tuition, tutor, exam prep… | **generic** | catalog, booking, offers, reviews | Programme → trial lesson | Term blocks, sibling/trial rules, progress reports |
| 19 | `school` | Primary school | primary school, academy… | **generic** | catalog, booking, classes, events, offers, gallery | Clubs, term dates, parents' evening booking | **No parent portal**, absence reporting, letters, calendar subscriptions |
| 20 | `kindergarten` | Kindergarten | kindergarten, nursery, preschool… | **generic** | catalog, booking, offers, gallery, reviews | Sessions, fees, visit booking | Registration forms, waiting list, funding/ratio info, child records |
| 21 | `finance` | Independent adviser | financial adviser, mortgage… | flagship (finance) | catalog, quote, booking, reviews, offers | Services, disclosure, review booking | Suitability/onboarding boundary is deliberately out of scope; must stay explicit |
| 22 | `agency` | Brand and growth agency | marketing agency, digital agency… | **generic** | catalog, quote, reviews, gallery, offers | Capabilities → proposal | **No case-study structure** (results, sectors, credits) |
| 23 | `influencer` | Creator | influencer, content creator… | **generic** | catalog, quote, gallery, reviews, offers, events | Formats, rate card, shoot day | Media kit, audience stats, usage/licence terms |
| 24 | `portfolio` | Designer / art director | portfolio, graphic designer… | **generic** | catalog, quote, gallery, reviews | Work index → project → enquiry | **No project detail page** (role, year, credits, process) |
| 25 | `film` | Film production | film, documentary, cinema… | **generic** | catalog, booking, gallery, reviews, offers | Cast/crew, stills, screening booking | Screening times, certificate/runtime, press kit |
| 26 | `gallery` | Art gallery | gallery, exhibitions, museum… | **generic** | catalog, booking, events, gallery | On view, works, private view | Exhibition dates, artist pages, enquiries per work |
| 27 | `marketplace` | Multi-vendor delivery | marketplace, multi-vendor… | **generic** | catalog, ordering, delivery, offers, loyalty, gallery | Many stores, one basket, tracking | **No vendor model**: `vendor` is a string on an item; no store pages, no per-vendor orders or payouts |

### Data models

Every trade shares one model: `AppSpec` → `MenuSection[]` → `MenuItem` (`name`,
`desc`, `price`, `meta`, optional `tag`/`vendor`/`image`/`media`), plus `offers`,
`loyalty`, `staff`, `team`, `videos`, `socials`. There is **no trade-specific
entity anywhere**: no room-night, no class session with capacity, no job or
vehicle, no exhibition, no lesson, no vendor, no listing attributes. `meta` is a
free string, which is why a hospital department renders as "3 items · from" with
no amount (see §6, F6).

Consequence: the catalogue is genuinely trade-agnostic and that is a strength for
merchandise trades (restaurant, cafe, shop, ecommerce, plants, gallery, film).
For trades whose unit is not a product — hotel nights, class places, jobs,
sessions, enrolments — the model is the ceiling, and no amount of styling fixes
it.

## 3. Audit of trade-specific prompts (deliverable 3)

**There is no generative prompt in this codebase.** `grep` for
`openai|anthropic|gemini|workers-ai|env.AI` returns nothing. `prompt.ts` says it
itself: *"No model is called — the words are matched, so the answer is instant,
free and repeatable."* What the milestone calls a "generation prompt" is, today,
three separate things:

1. **Trade recognition** (`PROMPT_NOUNS`): a dedicated word list for all 27
   trades, scored by phrase length. Coverage is real and per-trade: `salon` has
   salon/saloon/barber/nails/spa…, `trades` has plumber/electrician/roofer…,
   `kindergarten` has kindergarten/nursery/preschool/montessori…. No trade is
   missing an entry. Confidence is `detected` (a noun matched) or `guessed`
   (`detectVertical` fallback), and the brief does surface that distinction.
2. **Trade shape**: `VERTICALS[].features`, vocab, seeded catalogue, CTA, staff,
   timetable, events. Per trade, hand-written, plausible.
3. **Trade composition**: `flagshipDocFromSpec` — a dedicated home composition
   for **14** trades plus a `pro-*` fallback that serves `professional`. The
   other **12** trades get `docFromSpec`: same stack, their own theme.

| Group | Trades | Composition |
| --- | --- | --- |
| Dedicated home composition (14) | restaurant, shop, salon, hotel, cafe, gym, clinic, property, studio, trades, auto, ecommerce, courses, finance | `flagshipDocFromSpec` branch + renderer + CSS |
| Shared fallback (1) | professional | the `pro-*` blocks, written for professional services |
| **Generic stack (12)** | hospital, plants-indoor, plants-outdoor, tuition, school, kindergarten, agency, influencer, portfolio, film, gallery, marketplace | `docFromSpec` only |

**Trades incorrectly using generic or shared generation: the twelve above.**
They are not broken — they render, pass the same shell, and have their own theme
— but they have no composition of their own, which is exactly what the
`hospital`, `kindergarten` and `portfolio` captures show.

**A second, subtler duplication:** the brief's three "designs"
(`prompt.ts:DESIGNS` — editorial/calm/compact) are **global**, identical for
every trade, and are layout structures, not design directions. Each trade also
has three genuine directions (`directions.ts:DIRECTIONS`, all 27 covered, e.g.
restaurant: editorial dining / modern casual / premium luxury; kindergarten:
playful days / gentle start / modern nursery). The directions are better than
the designs presented to the customer, and the customer never sees them at the
brief.

## 4. Why the URL-first experience repeats itself (deliverable 4)

Reconstructed from `views/brief.ts` and `index.ts`:

1. `/brief` opens on step 1: *"What do you need?"* — a free-text box and "Show
   me three designs". This is the primary path.
2. The website field lives in **step 2**, inside a card labelled "Start from
   their website · **Optional**". A small link on step 1 jumps there.
3. `POST /api/import` crawls up to 10 pages and returns a rich `ImportedSite`:
   name, tagline, story, trade + confidence, category + basis, accent, logo and
   logo image, phone, email, address, hours, currency, socials, menu with prices
   and images, features, `design` (palette/type/radius/dark), `structure` (nav
   and hero), `pwa`.
4. `applyImport` fills name, tagline, category, trade, accent, icon text and
   features, then reports what was read, what was not, and what to confirm.
5. The customer is then walked through the rest of the questionnaire: category,
   app shape, one-line promise, brand colour, icon text, element style, features,
   free-text requirements, trailer links, business name, contact name, email,
   platforms, plan. The three concepts are **not** shown on this path at all —
   `useRead()` (the only code that renders them) is called from `readWish()`,
   which is `/api/prompt`.

So the repetition is real but it is not "asking for the name twice". The
specific defects:

| # | Defect | Evidence |
| --- | --- | --- |
| D1 | The URL is optional and buried in step 2; step 1 asks the customer to type what the site could tell us | `brief.ts:152`, labelled "Optional" |
| D2 | Import fills fields but does not shorten the flow: nine visible decisions remain | form steps 2–4 as shipped |
| D3 | **Import never produces the three concepts.** Concepts exist only for the words path | `useRead` ← `readWish` only; `applyImport` never sets designs |
| D4 | **The concept previews are not the app that gets built**: they force `media=art` (abstract motifs, no photos), pass `flagship:false`, and render with no document | `prompt.ts:designsFor`, `index.ts:conceptPreview`, `/p/:token/app` |
| D5 | No per-field provenance, confidence or conflict detection. `missing` is a prose list, `notes` are caveats; a price read from a range or a stale page is not flagged | `ImportReport` type |
| D6 | Owner contact name and email are genuinely not on the site (they are the buyer's), so those are the only justified asks — and they sit in step 4 with everything else | `brief.ts` step 3 |
| D7 | `POST /api/projects` rejects a build without a name, so a failed import silently restores the manual path | `index.ts:895` |

What the site read already does well, and should not be rebuilt: robots.txt is
respected, redirects are re-checked per hop, a sitemap is used when the home page
links nothing, images are tied to their item through structured data/embedded
JSON/og:image with a `method` recorded, prices are never invented, and
`importSummary` is persisted on the spec.

## 5. Website research and extraction pipeline (deliverable 5)

Designed to extend `importer.ts`, not replace it. All limits are budgets, and
every one is reported to the owner when it bites.

### Fetch plan

| Step | Source | Rule |
| --- | --- | --- |
| 0 | pasted URL | normalize, https only, reject IP hosts, private ranges, non-http schemes |
| 1 | `robots.txt` | a disallowed path is never fetched; refusal is explained |
| 2 | `sitemap.xml`, `sitemap_index.xml`, `sitemap-index.xml` | index files followed one level |
| 3 | homepage | metadata, JSON-LD, nav, hero, footer contact |
| 4 | nav + internal links | same host only, depth ≤ 2, priority to /about /contact /menu /services /products /collections /shop /pricing /book |
| 5 | category and product/service pages | up to 24 pages total (today 10); product detail before categories |
| 6 | structured data | `Product`+`Offer`, `LocalBusiness`, `Menu`/`MenuSection`, `Service`, `Course`, `Event`, `BreadcrumbList` |
| 7 | images | item-scoped only, never a page hero reused as a product shot |

Budgets: 900 KB per page, 6.5 s per page, 25 s wall clock per import, 24 pages,
one retry on 5xx/timeout with backoff, dedupe on normalized URL and content
hash, skip fonts/JS/CSS/video, cap images per import at 40, never follow
off-host links, never fetch a URL twice.

### Discovery result (the audit trail the milestone asks for)

```ts
type Field<T> = {
  value: T
  source?: string        // exact URL the value was read from
  selector?: string      // where on that page, for review
  method: 'structured-data' | 'metadata' | 'visible-text' | 'inferred'
  confidence: 'verified' | 'likely' | 'guess'
}

type Discovery = {
  url: string
  pages: { read: string[]; failed: { url: string; reason: string }[]; usedSitemap: boolean }
  business: {
    name: Field<string>; category: Field<string>; trade: Field<VerticalId>
    tagline: Field<string>; story: Field<string>
    palette: Field<DesignKit>; logo: Field<{ url: string; alt?: string }>
  }
  commerce: {
    currency: Field<string>
    sections: { name: string; source: string; items: DiscoveryItem[] }[]
  }
  operations: {
    phone: Field<string>; email: Field<string>; address: Field<string>
    hours: Field<string>; locations: Field<string>[]
    existingWorkflows: ('order' | 'book' | 'enquire' | 'subscribe' | 'quote' | 'none')[]
  }
  conflicts: { field: string; values: { value: unknown; source: string }[] }[]
  missing: string[]                 // blockers only
  needsConfirmation: { field: string; why: string }[]
  tradeCandidates: { id: VerticalId; score: number; evidence: string[] }[]
}
```

`verified` means read from structured data or a single unambiguous element;
`likely` means read from visible text with one consistent reading; `guess` means
inferred and must be shown to the owner as a question, never applied silently.

### Extraction rules (never invent)

| Field | Preferred source | Fallback | Never |
| --- | --- | --- | --- |
| Price | JSON-LD `offers.price` + `priceCurrency` | element with a currency symbol next to the product name | take a range's lower bound without saying so; convert currency |
| Name | JSON-LD `name` / `og:site_name` | `<h1>`, then the logo alt | use a nav label |
| Category | JSON-LD `@type`, breadcrumb | page copy via `detectVertical` | reuse the trade label as if the business said it |
| Hours | JSON-LD `openingHoursSpecification` | a table or dl near "hours" | expand "call for hours" into a guess |
| Address | JSON-LD `address` | `tel:`/map links and footer | geocode |
| Image | item's own structured image | og:image on the item page, first image inside the item's container | use another item's image or stock |

`conflicts` is new and matters: two prices for the same item on two pages, a
name that differs between the header and JSON-LD, hours that disagree. Those go
to the owner as one question each, not as a silent pick.

### Limits to state honestly

- **No headless browser on the Worker.** A site that renders its catalogue in
  JavaScript returns a shell; the importer says so and offers the manual path.
  Fixing this needs an external render service (cost, privacy, approval) — out of
  scope until the owner decides (§10).
- **No LLM.** Semantic classification (is this a "treatment" or a "product"?) is
  regex and heuristics today, which is why `marketplace` and `hospital` struggle.
  An optional model step is the single highest-leverage decision in this plan,
  and it needs an approved, funded provider; it must be grounded: the model may
  classify and write copy from extracted facts, never invent a price or a policy.
- **No multi-page pagination or infinite scroll**, no login-gated content, no
  PDFs.

## 6. Design quality assessment, from screenshots (deliverable 6)

Captures (390×844, this build):

| File | What it is |
| --- | --- |
| `docs/qa/audit-2026-11-20/cafe-brief-editorial.png` | Brief concept 1, café, as the customer sees it |
| `docs/qa/audit-2026-11-20/cafe-brief-calm.png` | Brief concept 2, café |
| `docs/qa/audit-2026-11-20/cafe-brief-compact.png` | Brief concept 3, café |
| `docs/qa/audit-2026-11-20/hospital-home.png` | Generic trade (no composition) |
| `docs/qa/audit-2026-11-20/kindergarten-home.png` | Generic trade |
| `docs/qa/audit-2026-11-20/portfolio-home.png` | Generic trade |
| `docs/qa/flagship-390/*.png` | The ten flagship apps for contrast |

Reproduce: `bun scripts/capture-design-audit.mjs` (new, in this commit) and
`WIDTHS=390 bun scripts/capture-batch2.mjs` / `capture-batch3.mjs`.

### What the three concepts actually are

Side by side, the three café concepts share: the same serif display type, the
same brown palette, the same five-tab bar, the same monogram watermark, the same
two primary buttons, and the same chip row. They differ in hero height and
crop, vertical rhythm, which section comes second, and card shape. They are three
spacings of one design, not three design directions. That is the exact failure
the milestone names.

### Defects, with the evidence

| # | Defect | Seen in | Why it matters |
| --- | --- | --- | --- |
| F1 | Three concepts share type, palette and navigation; only rhythm/order/hero height change | all three café captures | The choice is not a design choice |
| F2 | Concepts show abstract motifs (concentric rings, giant "F", "Aa", monogram watermark), not business imagery, because `media=art` is forced | café concepts, portfolio, hospital, kindergarten | The most important screen looks like a placeholder |
| F3 | Hero occupies 40–55% of the first screen with a watermark and, often, two short lines | hospital, kindergarten, café-calm | Empty space where a product or a reason to trust should be |
| F4 | The built app's layout is dealt from a seeded 2,304-deck; the customer's pick pins only some axes, and flagship homes ignore the rest | `app.ts:1291–1390` | What you choose is not quite what you get |
| F5 | Header carries search and favourite on trades where neither makes sense | hospital, kindergarten | Reads as a template with slots filled |
| F6 | Price prefix without a price: "3 items · from" | hospital | A visible data-rendering bug in a customer-facing app |
| F7 | Duplicated labels: kicker in the header *and* in the hero ("CAFÉ & BAKERY" twice); "Sessions" chip beside "SESSIONS" tab | café, kindergarten | Noise where hierarchy should be |
| F8 | Floating tab bar overlaps content at some densities; five tabs with 9–10px labels | café compact, kindergarten | Touch targets and legibility at 390 |
| F9 | Placeholder art reads as unfinished work in a portfolio ("F", "K", "Aa") | portfolio | The opposite of premium for a visual trade |
| F10 | Quality depends almost entirely on whether the trade is flagship: compare `cafe-390.png` with `hospital-home.png` | flagship vs generic | 12 of 27 trades ship the weaker path |

What is already good and should not be redesigned away: the flagship ten are
genuinely well composed (real photography, editorial type, clear primary
action), contrast is systematically checked (`readDesign` refuses a palette under
4.5:1), the tab bar and sheets feel app-like rather than web-like, and the
document model gives every block a stable id.

**Honest summary: the design system is capable — the flagship apps prove it —
but the default 15 of 27 trades and 100% of concept previews run on a path that
looks like a template.** "Premium" cannot be claimed for the product yet; it can
be claimed for ten screens.

## 7. Gap analysis (deliverable 7)

| Priority | Gap | Trades affected | Impact |
| --- | --- | --- | --- |
| P0 | Concepts are not real design directions, and are previewed without photos or flagship composition | all 27 | The core promise ("three concepts") is not met |
| P0 | URL is optional and the questionnaire still gates the build; import yields no concepts | all 27 | The headline feature is a side door |
| P0 | No provenance/confidence/conflict layer on discovery | all 27 | Owner cannot trust or correct what was read |
| P0 | 12 trades have no composition of their own | hospital, plants ×2, tuition, school, kindergarten, agency, influencer, portfolio, film, gallery, marketplace | They ship the generic path |
| P1 | No trade-specific data models (nights, places, jobs, sessions, enrolments, vendors) | hotel, gym, courses, tuition, school, kindergarten, trades, auto, marketplace, property | Workflow stops at the catalogue |
| P1 | Layout dealt from a seeded deck instead of composed per trade/direction | all 27 | Unpredictable quality; empty heroes |
| P1 | Irrelevant chrome (search/favourite) and duplicated labels | all | Template smell, visible bugs |
| P2 | Image discipline when a trade has no photos (motif art) | all | Placeholder look |
| P2 | Owner management is identical everywhere (catalogue/offers/orders/bookings) | all | No inventory, schedule, capacity or vendor management |

## 8. Proposed implementation stages (deliverable 8)

Each stage is shippable, reversible and independently acceptable. No stage
deploys to production; all evidence is local.

**Stage 0 — baseline harness (no product change).**
New `scripts/check-trade-matrix.mjs`: for each of the 27 trades, create a build
from the trade's seeded spec, render home/catalog/detail, assert no overflow at
320/390/430, no broken image, alt text present, min tap target, no duplicated
on-screen labels, and capture one screenshot. `scripts/capture-trade-matrix.mjs`
for the visual half. Exit criterion: 27/27 render, matrix committed, every
current failure recorded as a known-bad baseline rather than hidden.

**Stage 1 — URL-first entry.**
Move the website field to step 1 and make it the primary action; `/api/import`
returns a `Discovery`; on success the flow becomes: discovery summary → three
concepts → build. Keeps the manual path one click away. Removes steps 2–4 from
the default path and replaces them with a single review screen (name, category,
trade, palette, features) whose fields are already filled.
Files: `views/brief.ts`, `index.ts` (`/api/import`, `/api/projects`),
`prompt.ts` (concept generation independent of the words path).
Exit criterion: importing a site shows three concepts without the customer
typing the business name, and a build made this way has the same document as one
made from the words path.

**Stage 2 — discovery report.**
`Discovery` with provenance/confidence/conflicts; review UI that shows source,
confidence and one question per conflict; `missing` reduced to blockers.
Extend `buildSpec` to persist the report (not just `importSummary`).
Exit criterion: for a fixture site, every price traces to a URL; a deliberately
conflicting fixture produces a conflict, not a silent pick.

**Stage 3 — concept system v2.**
One concept vocabulary. Three **directions** per trade from `directions.ts`,
rendered with the trade's flagship document and its real images (`media=photo`
when the business has photos, never `art` for a concept). Retire the global
`DESIGNS` from the brief, or keep it strictly as an advanced layout override
after a direction is chosen. Concept preview must render exactly what the build
will render, minus saving.
Exit criterion: three café concepts differ in type, palette, navigation, hero
composition and section order; none uses motif art; a screenshot set proves it.

**Stage 4 — the twelve generic trades, in three batches.**
Batch A: hospital, plants-indoor, plants-outdoor, tuition.
Batch B: school, kindergarten, gallery, film.
Batch C: agency, influencer, portfolio, marketplace.
Each trade gets a dedicated composition (as the flagship fifteen have), its own
navigation emphasis, and trade acceptance criteria from §9. Marketplace also
needs the vendor model decision (P1) before its composition can be honest.
Exit criterion: 27/27 have a dedicated home composition and pass the matrix.

**Stage 5 — design hardening.**
Hero composition budget (content in the first 60% of the fold), remove irrelevant
header affordances per trade, fix the "from" price-prefix bug, dedupe labels,
tab-bar overlap and label size, and add a design audit script that measures
empty-space ratio, label duplication, tap targets and contrast on every capture.
Exit criterion: the measured checks pass on 27 trades at 390, plus a human
review of the captures.

**Stage 6 — owner review and safe re-import.**
The imported information becomes an owner-editable panel with provenance; extend
`reimport.ts` so a price or description the owner changed is marked
`ownerEdited` (today only media is), and re-import never overwrites it without
approval. Preserve versions, media isolation and auth boundaries.
Exit criterion: re-importing a changed fixture leaves owner edits intact and
lists the differences.

Sequencing note: Stage 3 is the one that most changes what customers see, and it
depends on Stage 0 for evidence and Stage 1 for the flow. Stage 4 is the largest
by volume and can run in parallel with 3 if batches stay small.

## 9. Acceptance criteria and test matrix (deliverable 9)

### Global gates (every stage)

- `bun run typecheck` exit 0, `bun test` all pass, `bun run build` exit 0.
- The ten flagship apps unchanged or improved: same sections, same document ids,
  screenshots compared before/after.
- Editor parity: edit → save → reload → publish renders the saved document.
- No regression in: media isolation, version history, owner sessions, payments
  boundaries, `sampleContent` honesty.

### Trade matrix — for each of the 27

| Check | Pass condition | Method |
| --- | --- | --- |
| T1 Generates | A build exists from the trade's own prompt words | `check-trade-matrix.mjs` |
| T2 Trade sections | The trade's expected sections and primary action are present (e.g. hotel: rooms + dates; gym: timetable + class booking; courses: course list + enrol) | assertions per trade |
| T3 Design appropriate | The home composition is the trade's own, not the generic stack; screenshot reviewed | capture + review |
| T4 Responsive | 320/390/430: no horizontal overflow, no clamped labels, no tab-bar overlap | matrix |
| T5 Save/reload | Document persists with identical section count and order | harness |
| T6 Edit/publish parity | A title edit and a hidden section appear in the published render | harness |
| T7 Owner management | The owner can manage what the trade needs (catalogue at minimum; inventory/schedule where the trade model allows) | harness + review |

Trades cannot be called complete because T1 passes. T2, T3 and T7 are per-trade
written criteria, in the spirit of `docs/FUNCTIONAL_AUDIT.md`.

### URL fixtures

| Fixture | Why | Expected |
| --- | --- | --- |
| ButterTales | Already the project's proof case; commerce with images | name, catalogue, prices and item images extracted; three concepts with those images |
| Dishoom (restaurant) | Large multi-location site, JS-heavy nav | menu sections and prices; locations and hours; explicit note where the menu is JS-rendered |
| A service business (trades/professional) | No catalogue, quote-led | services, service area, phone; quote flow chosen as primary action |
| An online store (Shopify-like) | Structured data, variants, currency | products with variants flagged, currency correct, no variant collapse |
| A complex site (many sections, sitemap index) | Crawl budget and sitemap handling | sitemap used, 24-page cap reported, no off-host fetch |

Negative cases, each with a written outcome rather than a pretence: unreachable
host; robots-blocked; JS-only catalogue; product pages without images; two
conflicting prices; prices with ranges; a site whose trade is ambiguous (must ask
one question).

### Evidence rules

- No design claim without a capture at 390 (and 320/430 for layout claims).
- No extraction claim without the source URL beside the value.
- No "premium" verdict from tests; only from reviewed screenshots.
- Anything not executed is listed as not executed, with the reason.

## 10. Decisions needed before Stage 1

1. **Model or no model.** Deterministic extraction covers merchandise well and
   trades poorly. A grounded model step (classification, copy, section choice)
   is the biggest quality lever and needs an approved provider and budget.
2. **JS-rendered sites.** Accept the limitation, or approve an external render
   service.
3. **One concept vocabulary.** Adopt the per-trade directions as the three
   concepts and demote the global structures to an advanced override?
4. **Scope of 27.** Keep all 27 and give each a composition (Stage 4), or narrow
   the catalogue to the 15 that have one and say so?
5. **Trade data models.** Approve the P1 model work (nights, places, jobs,
   sessions, vendors) or accept that those trades stop at the catalogue.

Until 1–5 are answered, Stages 0 and 1 can proceed without them; Stages 3–6
depend on the answers.
