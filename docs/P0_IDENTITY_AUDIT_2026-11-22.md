# Plattr P0 — business identity, state isolation and design generation audit

**Date:** 22 November 2026
**Scope:** local Worker + local D1, five live journeys and one draft-restore journey.
**Not done:** no deployment, no production data change, no paid AI or external rendering call.

## Outcome

Both reported defects are reproduced, explained and fixed:

1. A GeeStores read could be previewed with a stale café or florist trade, with café
   navigation, a table-reservation action and no product photographs.
2. A café prompt could inherit a previous GeeStores import — its name, category and
   saree catalogue — and a refresh could restore that other business silently.

The saved builds were never the source of the mismatch: every GeeStores project in the
local database is `vertical: shop`, category `Jewellery shop`, with its own saree,
jhumka and jewellery catalogue. The defect was in the **brief page's client state and
the demo preview contract**: the preview chose navigation and workflow from one trade
and accepted identity and catalogue from another.

All five mandatory journeys now produce their own application, with three different
design directions, and both state-isolation checks pass. Full suite: **783 tests pass,
0 fail, 7,471 assertions, 65 files**; typecheck and build pass.

## A. Root cause

### A1. GeeStores URL showing Florist / café navigation / reservations

Files: `src/worker/views/brief.ts`, `src/worker/index.ts` (`/demo/app`).

1. `applyImport()` rewrote the wish prompt only when the box was empty:
   `if (wishInput.value.trim().length < 3) wishInput.value = …`. A café or florist
   sentence already in the box survived a new GeeStores read.
2. `applyImport()` then called `readWish()`, which re-read that **old sentence**. The
   read returned `cafe` or `florist` (shop), so the trade, features, navigation and
   composition became café/florist even though the site object was GeeStores.
3. `readWish()` / `useRead()` never cleared `imported`, the name, category, tagline,
   accent or logo. `identityPreview()` appended all of them — and
   `imported.menu` — to every concept URL.
4. `/demo/app` treats `biz` as the **source of navigation and workflow** and `name`,
   `cat`, `items` as display/catalogue overrides. A URL like
   `biz=cafe&name=GeeStores&cat=Jewellery%20shop&items=<sarees>` therefore renders
   “Café / Menu / Reserve / Visit”, an `Order takeaway / Reserve a table` pair and a
   café composition around a jeweller's name and sarees. The old florist variant is
   the same mechanism with `biz=shop` and a florist prompt label.
5. The concept preview encoded only `name~price` for each item — no image URL — so
   `/demo/app` had no product photographs to render. That is the grey/typographic
   placeholder surface. The saved app did carry the source images (64 of 93 GeeStores
   rows in the final read), so the loss was in the preview contract, not extraction.
6. `applyImport()` also left the previous trade checked when a read returned no
   vertical, and never cleared old concept cards.

### A2. Café prompt containing GeeStores

Files: `src/worker/views/brief.ts` (`loadDraft`, `applyDraft`, `readWish`, `useRead`,
`identityPreview`).

1. `loadDraft()` fetched the single server draft keyed by the browser cookie and
   **applied it automatically on page load**, with no consent. A draft is always an
   imported business, so opening a new brief restored the previous GeeStores site,
   fields and concepts.
2. Typing a café prompt did not clear the imported site or the fields. The concepts
   were café compositions (`read.vertical` = cafe) with the imported name, category and
   menu appended, exactly the reported GeeStores branding inside café concepts.
3. There was no server check that the site's trade, the submitted trade and the
   category agreed. A browser could post that mixture and the server rendered it.

### A3. Florist prompt showing homeware

`readPrompt()` mapped “florist” to the `shop` trade, whose seed catalogue is ceramics,
textiles and furniture. The prompt response had no category and no business-specific
sample, so a florist build read “Florist” while selling “Stoneware mug”. This is the
same identity contradiction in a different direction.

## B. Fixes

### B1. State isolation — `src/worker/views/brief.ts`

- **`resetBusinessState()`** (new) clears the imported site, last import, prompt sample,
  read, chosen design, concept cards, element choices, price decisions, import receipt
  and all business fields, then repaints the trade's own defaults.
- **`applyImport()`** resets first, always rewrites the wish from *this* read and calls
  `readWish({ fromImport: true })`.
- **`runImport()`** resets before it fetches and discards a saved draft, so a slow or
  failed read cannot leave the previous business on screen.
- **`readWish()`** resets on every user-initiated read; only the import's own follow-up
  keeps the read site.
- **`loadDraft()`** now offers a draft — “Unfinished brief found — GeeStores … Restore
  it / Start a new brief” — and applies nothing. **Restore** is an explicit click.
  `applyDraft()` also resets before loading.
- **`identityPreview()`** sends catalogue rows only when the trade being previewed is
  the trade they belong to. Prompt reads get neutral “Your business”/“YB” identities
  and `media=art`; no demo shop's brand is used as a placeholder.
- Preview rows now carry **section names and the product's own image URL**
  (`encodePreviewSections` / `previewSampleItems`), and `/demo/app` parses them back
  into sections and images.

### B2. Server validation — `src/worker/identity.ts` (new)

`identityIssues({ vertical, category, siteVertical })` rejects:

- a read site's trade different from the build's trade (`trade_mismatch`);
- a category whose trade family (food, retail, beauty, fitness, health, home,
  professional, property, hospitality, education, media) contradicts the trade
  (`category_mismatch`). Unknown wording is allowed: an owner may describe their
  business in words no list contains.

Applied in `POST /api/projects` before a row or budget token is spent, and in
`PATCH /api/projects/:token` before a category change. Response: **422
`identity_mismatch`** with a message naming both trades. `sanitizeImported()` now keeps
the read trade and sample flag, so a browser cannot drop the evidence the guard uses.

### B3. Florist content — `src/worker/prompt.ts`

A `PROMPT_PRESETS` entry adds, for florist/flowers/bouquet wording:

- label and category **Florist**;
- a clearly sample catalogue: Bouquets; Occasions (birthday, wedding, sympathy);
  Plants & gifts (orchid, dried arrangement, local delivery);
- the florist accent.

`buildSpec()` carries `sample: true` for a prompt-supplied catalogue. Sample builds
use the trade engine with that catalogue (cart, delivery, orders) and never borrow the
platform's stock photography.

### B4. Image integrity — `src/worker/index.ts`, `src/worker/app.ts` behaviour

- `/demo/app` accepts `name~price~encodedImage` rows grouped by section
  (`section::rows||section::rows`), so a concept shows the real product with its real
  photograph and its real shelf.
- `withoutStockPhotography()` removes flagship `fx-photo` stock tags from any build
  that has its own website or sample catalogue.
- Sample builds get no stock photo set (`NO_PHOTOS`) and a non-flagship document, so
  missing photography is an explicit empty frame, not ceramics standing in for
  bouquets.
- A prompt business gets `media=art`; no stock coffee or ceramics is presented as its
  product photography.
- Lazy images live inside `.screen` panes, not the window. Evidence capture now
  scrolls those panes and waits for every image, so “not fetched yet” is never
  reported as “missing”.

### B5. Three genuinely different designs — `src/worker/directions.ts`

The café and practice directions were adjusted where two of three shared a type
system:

- café **Neighbourhood bakery**: condensed signage headings + serif reading face,
  sand surfaces, rounded cards.
- practice **Editorial practice**: condensed authority + serif reading face, warm sand.
- salon **Editorial wellness**: serif headings + grotesk reading face.

Each trade now varies composition, display/body pairing, palette, navigation, hero
treatment, catalogue presentation, density and corner language. See the evidence
table in section E.

## C. State-isolation lifecycle

Tested in a fresh CDP tab against the local Worker; details in
`docs/qa/p0-identity-2026-11-22/journeys.json` (`isolation`, `draftRestore`).

| Step | Result |
| --- | --- |
| 1. New project | `/brief` starts with empty name, category, wish, no concepts; a stale cookie shows “That unfinished brief is no longer available”, not old data |
| 2. Text prompt → concepts | `readPrompt('need a website for a cafe in kochi')` → `cafe`, label “Café & bakery”; three café concepts; no imported rows |
| 3. Another new project, different business | `resetBusinessState` clears the previous business before the read; florist journey contains no café or GeeStores words |
| 4. Refresh an unfinished imported brief | Banner: “Unfinished brief found — GeeStores … Nothing has been loaded into this page yet.” Fields empty, 0 concepts. Only **Restore** applies it, and then name/category/3 concepts are correct |
| 5. Two tabs | GeeStores build and Kochi Ledger Partners build open together, distinct URLs and titles; neither name/word set appears in the other |
| 6. Two prompts in a row | Café then florist: each read clears the last site, fields, concepts and price decisions |
| 7. Import after prompt | GeeStores import replaces the wish with the site's own sentence and re-reads; concepts are jewellery, not the old prompt |
| 8. Failed/slow import | Prior business is cleared before the request, so no stale content remains during or after a failure |

Storage inspected: `localStorage`/`sessionStorage` hold only the app's per-token cart
and saved state under `plattr:v2:<token>`; there is no cross-project brief state.
Server drafts are one row per `plattr_draft` httpOnly cookie; project data is keyed by
token. No module-level cache is keyed across businesses (the photo cache is keyed by
trade keyword, the import in-flight map by URL during a single request).

## D. Grounded AI architecture (proposed; not implemented, no spend)

The current implementation is deterministic keyword/archetype selection. It is not an
AI design generator, and should not be described as one.

**Phase 0 — deterministic evidence (already built).** `importer.ts` / `discovery.ts`
produce the source URL, pages read, business fields with provenance, catalogue rows
with item IDs, prices, variants and per-item image IDs, policies, and explicit
unknowns.

**Phase 1 — grounding pack.** Send only the confirmed facts:

- original prompt or the site's confirmed identity and trade;
- category, story, policies, hours, contact;
- every catalogue item by stable `id` with name/description/price/variant/image id;
- available media IDs and their product relationship;
- workflows the trade supports and which the source states;
- missing/uncertain fields and owner answers;
- design constraints/preferences.

**Phase 2 — one structured model call.** The model returns a JSON *design
specification*, never HTML:

```json
{
  "identity": { "category": "...", "trade": "shop", "confidence": "high" },
  "direction": { "id": "gallery", "composition": "editorial", "why": "..." },
  "sections": [
    { "kind": "hero", "copyRef": "tagline", "mediaRef": null },
    { "kind": "productShelf", "sectionRef": "cat_saree", "itemRefs": ["itm_..."] }
  ],
  "copy": [{ "slot": "intro", "text": "..." }],
  "unknowns": ["delivery fee"]
}
```

Allowed values are enums (trade, direction, section kinds, item IDs, media IDs) drawn
from Phase 0. Copy slots are limited to non-factual prose; prices, product names,
policies, contact details and photographs are **references**, inserted by code.

**Phase 3 — deterministic validation (new `identity.ts` plus schema checks).**

- schema validity; every `itemRef`/`mediaRef`/`sectionRef` exists in this project;
- site trade == selected trade; category family == trade family;
- nav/actions derived only from the selected trade; no workflow the trade cannot run;
- no price, policy, contact or photograph created by the model;
- image is the item's own image; missing image stays missing;
- three directions must differ on at least: composition, display/body pairing, palette,
  nav style, hero treatment.
  Failure → 422 to the owner, or deterministic fallback; never publish.

**Phase 4 — render.** Existing AppSpec/Doc validation and renderer; no model output
reaches the browser unchecked.

**Cost.** Provider proposal: Claude Haiku 5.5, approximately **$0.0025 per
generation** (one grounded design specification; three directions selected from the
validated catalogue), **$50/month cap** with deterministic fallback at the cap.
Budget controls: per-visitor and global generation limits, 30-day cache keyed by
source + catalogue hash, no retry storm. See
`docs/AI_PROVIDER_PROPOSAL_2026-11-23.md`. No key, dependency or paid call exists in
this change.

## E. Three designs — evidence

Screenshots are 1440px desktop and 390px mobile, captured after scrolling every app
pane so lazy images are settled.

| Journey | Directions | Evidence of difference |
| --- | --- | --- |
| GeeStores | `minimal`, `editorial`, `lifestyle` | list rows / large-image retail / soft photographic grid; different display faces and catalogue hierarchy; 63–74 real photographs per concept, all loaded |
| Café | `editorial`, `modern`, `warm` | serif ivory list / grotesk paper grid + category chips / condensed signage + serif reading on sand; different hero scale, nav and card language |
| Florist | `minimal`, `editorial`, `lifestyle` | list, large-type retail, and soft grid; sections Bouquets / Occasions / Plants & gifts; no stock imagery |
| Salon (Blue Tit) | `luxe`, `minimal`, `editorial` | noir serif appointment-first / paper humanist day picker / ivory editorial; different nav and treatment presentation |
| Professional | `classic`, `minimal`, `editorial` | ivory serif dock / paper humanist list / sand condensed long-form; different type pairing, palette and section order |

## F. Image integrity

| Journey | Catalogue | Rows with own source photo | Images rendered in concept | Result |
| --- | --- | --- | --- | --- |
| GeeStores | 93 rows, 9 shelves | 64 | 63–74, all loaded (varies with the live read) | Source image shown on its own product card; alt is the item name; genuinely missing rows show an empty frame |
| Café prompt | 7 sample rows | 0 (none supplied) | 0 | Explicit “Image not supplied”; no stock coffee presented as the business's photographs |
| Florist prompt | 9 sample rows | 0 | 0 | No ceramics or other stock; flower names and prices only |
| Blue Tit salon | 82 rows | 0 from the source | 2 (brand mark/hero only) | **Reported limitation:** the source published no per-treatment photographs that the read could tie to an item |
| Professional prompt | 5 sample rows | 0 | 0 | Explicit empty frames |

Product↔image pairing is structural: the renderer uses `item.image` for that item
only; stock libraries are removed for any imported or sample build. A source image
that fails to load falls back to an empty frame, never to another product's image.

## G. Regression matrix

All journeys ran against `http://127.0.0.1:5173` with local D1. Local usage counters
were reset between journeys; no project, report or evidence was deleted. Raw data:
`docs/qa/p0-identity-2026-11-22/journeys.json`.

| # | Input | Detected identity | Data | Concepts | Saved / reload | Isolation |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `https://geestores.com/` | GeeStores — Jewellery shop, shop | 93 rows, 9 sections, 64 photos, ₹ prices | 3 jewellery concepts | `GeeStores · build v2`, stable | No foreign name/category/workflow |
| 2 | “need a website for a cafe in kochi” | Café & bakery, cafe | 7 sample rows, Coffee / Bakery / All day | 3 café concepts | `Kochi Coffee House · build v1`, stable | No GeeStores, saree or jhumka |
| 3 | “I run a florist in Kochi — bouquets, wedding flowers and same-day delivery” | Florist, shop | 9 sample rows: Bouquets, Occasions, Plants & gifts | 3 florist concepts | `Kochi Bloom Room · build v1`, stable | No ceramics, no GeeStores |
| 4 | `https://www.bluetitlondon.com/` | Blue Tit London — Salon & spa | 82 treatments/services, £ prices, 0 per-item photos | 3 salon concepts | `Blue Tit London · build v2`, stable | No jewellery or café content |
| 5 | “I need a website for an accounting firm in Kochi — services, fixed fees and enquiries” | Professional services | 5 sample services: Compliance / Advisory | 3 practice concepts | `Kochi Ledger Partners · build v1`, stable | No restaurant workflow or GeeStores |
| 6 | Two of the saved builds in separate tabs | — | — | — | Distinct URLs and titles | No leakage either way |

For every journey, `mustShow` words were present and `mustNotShow` words absent (see
`mustShow.missing` / `mustNotShow.leaked` = empty arrays in the JSON).

Validation tests (`tests/identity.test.ts`, 7 tests) cover: site trade vs build trade,
cross-family category, consistency accepted (201), and the read trade surviving
sanitising. Prompt tests cover café and florist content.

## H. Before / after evidence

Before screenshots are the **exact old preview URL composition** (same `biz`, name,
category and catalogue the old code produced), reconstructed because no build of the
old page remains in the worktree:

- `docs/qa/p0-identity-2026-11-22/before-geestores-cafe-merged-desktop.png` and `-mobile.png`
  — café navigation, “Order takeaway / Reserve a table”, GeeStores name and sarees.
- `docs/qa/p0-identity-2026-11-22/before-florist-jewellery-leak-desktop.png` and `-mobile.png`
  — “FLORIST” label above GeeStores' saree catalogue.

After screenshots, three per journey at each viewport (30 files):

```
geestores-jewellery-{1,2,3}-concept-{desktop,mobile}.png
cafe-kochi-{1,2,3}-cafe-kochi-{desktop,mobile}.png
florist-kochi-{1,2,3}-florist-kochi-{desktop,mobile}.png
salon-bluetit-{1,2,3}-concept-{desktop,mobile}.png
professional-kochi-{1,2,3}-professional-kochi-{desktop,mobile}.png
```

## I. Checks run

- `bun test` — **783 pass, 0 fail, 7,471 assertions, 65 files**.
- `bun run typecheck` — pass (client and worker configs).
- `bun run build` — pass; 5.6 MiB deploy assets.
- `bun scripts/capture-p0-journeys.mjs` — 5 journeys, 0 leaked/missing identity
  words, draft restore offered and correct, two-tab isolation pass.
- `bun scripts/capture-p0-before.mjs` — 4 before screenshots.
- Visual review of desktop and mobile screenshots for all journeys.

## J. Remaining limitations

1. **No AI model call exists.** The architecture and cost are a proposal awaiting
   provider/budget approval; the shipped behaviour is deterministic.
2. **Prompt-only builds use sample catalogues.** A café/florist/professional brief with
   no website has no source data; the app shows a clearly sample catalogue and no
   photographs, with “Image not supplied”. It cannot invent the owner's products.
3. **Florist workflows are the shop engine** (bag, orders, delivery). The sample has
   Bouquets/Occasions sections, but there is no florist-specific occasion or
   delivery-date workflow.
4. **Salon has no per-treatment photographs.** Blue Tit's read found 82 treatments and
   no item images; the concept's two images are brand/hero, and the app reports the
   missing photography rather than substituting stock.
5. **Remote image hosting.** GeeStores' images load from its CDN. If that host blocks
   or expires a URL, the card falls back to an empty frame. Mirroring source images
   into the project's media store would remove that dependency; it is not part of this
   change.
6. **One draft per browser.** The draft cookie is per browser, not per tab. It is now
   only applied on an explicit Restore, and starting a new import discards it; two
   tabs can still overwrite that one draft (never each other's live page state).
7. **Build/reload** was checked on one concept per journey; tenant isolation and
   identity across the other two concepts were checked by URL/rendered content, not by
   creating all three builds.
8. **Nav comparison** in the evidence JSON reads buttons rather than anchors, so
   `nav` is empty; differences are evidenced by rendered text order and screenshots.
9. **Production remains untouched.** No deployment, no production database writes, no
   release or rollback changes.

## Reproduce

```bash
bun run dev                       # local Worker on 127.0.0.1:5173
bun scripts/capture-p0-journeys.mjs
bun scripts/capture-p0-before.mjs
bun test
```

Local D1 budget rows are reset by the journey script between runs (test-only local
state). Existing projects, evidence and backups are not removed.
