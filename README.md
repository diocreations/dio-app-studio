# Plattr

An app production line for studios that serve local business. A customer fills in
a short brief, the brief becomes a working app in *their* trade — restaurant,
café, shop, salon, gym, clinic, trades, professional services, property, hotel,
creative studio, garage — the customer edits it or asks for changes, and approval
unlocks the packages: installable PWA, Android TWA project and iOS Capacitor
project.

Every build is an app shell rather than a page: splash, fixed chrome, pushed
detail screens, bottom sheets, haptics, safe-area insets, and a design system
that changes with the trade (four layout archetypes, three navigation styles,
twelve palettes and type pairings).

## Run and check

```sh
bun install
bun run dev        # http://localhost:5173
bun test
bun run typecheck
bun run build
```

Local builds and data live in D1 (`DB` binding, `.wrangler/state` in
development). Send the deployed build to Freebuff Sites with `sites_deploy` and
`deploy.json` after provisioning `DB` with `sites_add_storage`.

## Proof on the landing page

The landing page's `#proof` section shows an actual run: the URL, the pages it
opened, the items and prices that came back, and the app rendered from exactly
that data at `/proof/app`. The snapshot lives in `src/worker/proof.ts` and is
generated — never hand-written — by `bun scripts/capture-proof.ts <url>`. The
section's **Re-run this URL live** button calls `/api/import` again, so a
visitor can confirm the numbers are produced by the importer rather than stored
prose. `/brief` links to it from the website panel.

## Routes

| Route                              | What it does                                          |
| ---------------------------------- | ----------------------------------------------------- |
| `GET /`                            | Studio marketing page, switchable live demo builds    |
| `GET /brief`                       | Business type, features, free-text ask, live quote    |
| `GET /privacy`                     | Privacy and terms, with the deletion contact          |
| `GET /robots.txt`                  | Crawl rules; keeps `/studio`, `/p/`, `/api/`, `/demo/` out |
| `GET /sitemap.xml`                 | The three public pages, absolute to the asking origin |
| `POST /api/import`                 | Read a customer's website into a draft brief          |
| `POST /api/projects`               | Create a build, returns a private token               |
| `POST /api/quote`                  | Price a feature/platform/plan combination             |
| `GET /p/:token`                    | The customer's build page: preview, edit, notes       |
| `PATCH /api/projects/:token`       | Save brand/feature/catalogue/custom edits, bumps v    |
| `POST /api/projects/:token/notes`  | Free-text change request                              |
| `POST /api/projects/:token/approve`| Sign off, marks open requests handled                 |
| `GET /p/:token/app`                | The generated app (server-rendered, interactive)      |
| `GET /p/:token/edit`               | Visual editor: sections, properties, live canvas      |
| `GET /api/projects/:token/doc`     | The stored section document (synthesised if absent)   |
| `PUT /api/projects/:token/doc`     | Autosave the document; normalised server-side         |
| `POST /api/projects/:token/doc/ai` | Preview an AI edit; nothing saved until accepted      |
| `GET /p/:token/export/:kind`       | `pwa` · `android` · `ios` zips (approved builds only) |
| `GET /demo/app?biz=salon`          | Live demo build for any trade                         |
| `GET /proof/app`                   | The app built from the captured real import           |
| `GET /studio`                      | Operator board, behind the `STUDIO_KEY` secret        |

## Where things live

- `src/worker/types.ts` — the vertical-agnostic build spec (catalogue, vocab, features).
- `src/worker/verticals.ts` — the trade catalogue: vocabulary, seeded content, default features, CTA shape.
- `src/worker/themes.ts` — one design system per trade: palette, type pairing, radius, layout archetype, nav style, motif.
- `src/worker/importer.ts` — reads an existing website: JSON-LD, product markup, brand colour, trade detection, contact details.
- `src/worker/pricing.ts` — capability catalogue, prices, quote engine, spec builder.
- `src/worker/app.ts` — the generated app (one self-contained document that adapts to the spec), manifest, icon, service worker.
- `src/worker/export.ts` — store-only ZIP writer and the three package builders.
- `src/worker/db.ts` — D1 schema/migrations, versioning, notes and activity.
- `src/worker/doc.ts` — the shared section document: model, normalisation, operations, local design commands.
- `src/worker/views/editor.ts` — the three-pane visual editor and its canvas bridge.
- `src/worker/views/*` — marketing, brief, customer build page, operator board.
- `docs/EDITOR.md` — editor architecture, what is shared with the app, and what is next.
- `docs/MOBILE.md` — the screen application model, PWA vs native distribution, and remaining work.
- `docs/DESIGN.md` — the generated-app design audit, direction system, tokens and media pipeline assessment.

## Starting from an existing website

A customer can paste their site instead of answering the brief: `/brief` (or the
URL box on the landing page) fetches the page, and `POST /api/import` returns a
draft — name, promise, brand colour, trade, category, catalogue with prices,
phone, email, address, opening hours, social profiles and a suggested feature set. The brief
fills itself in, every field stays editable, and the saved build records the
source URL in its spec. The customer's own contact details appear in the app's
“Find us” block with directions, call, email, website and social links, and can
be corrected on the build page like any other field.

It does not stop at the pasted page. From the entry page it collects same-origin
links that look like an aisle — `shop`, `collections/…`, `products`, `menu`,
`services`, `treatments`, `rooms`, `listings`, `portfolio` — and opens up to five
of them, merging what each one lists into sections named after the page or the
structured data. When a shop's front page offers no aisles, up to three product
links are opened directly. The crawl is bounded to **6 pages and 16 seconds**,
then reports how many pages it read and whether the cap cut a large shop short.
Cart, checkout, account, search, blog, about, legal and sorting/filter URLs are
never followed, and every hop goes through the same host guard.

What it reads on each page, in order: JSON-LD (`Organization`, `LocalBusiness`,
`Product`, `Menu`, `ItemList`, `OfferCatalog`), OpenGraph/meta tags,
`theme-color`, product-card markup with the name and price inside the card,
`tel:`/`mailto:`/social links, then page copy for the trade. Up to two of the
page's own stylesheets are fetched for the **look** and the brand colour.

### The look comes from their site

A pasted URL does not just fill fields — the app is rendered in the customer's
own design language, read out of their stylesheet and manifest:

- **palette** — `background`/`foreground`/`text` custom properties, then the
  `body` rule, with a WCAG contrast check; an unreadable pair is discarded and
  the trade's own pair stands in. A pure-white site still gets a lifted card
  surface, because a card the same colour as the page is not a card.
- **typeface** — the Google Fonts link, or the highest-ranked `font-family`
  declaration (heading, then body, then utility), mapped to a stack that keeps
  the family first and falls back to a system face offline. Icon faces
  (Glyphicons, Font Awesome) are ignored, since they are declared like type.
- **corners and light/dark** — the most common `border-radius` in px (0–26) and
  the luminance of their background. No declared radius means the trade's corner
  language stays.
- **PWA** — their `<link rel="manifest">` is read for name, display mode, theme
  and splash colours, and we report whether the site registers its own service
  worker. A site that already installs as an app is called out as such.
- **nav and hero** — their mobile navigation and first screen decide our
  structure. A header that collapses behind a hamburger becomes a drawer (the
  app bar grows a menu button, the bottom tabs move into a sheet); a row of
  links keeps tabs. Their hero becomes ours: a photo-backed first screen, words
  beside an image, centred copy, or — when they have no hero — a compact header.
  Their own top-level labels are collected (a logo link is not a label) and
  reported, and the basis line says what was read: “nav in a drawer · hero
  split”.

What is *not* claimed: colours are only applied when the site really declared
both a background and an ink (`palette: true`). A background from their manifest
is used with a neutral ink, and the basis says “splash colour … with a neutral
ink” rather than passing it off as a measured pair. Sites whose CSS we cannot
read keep the trade palette, and sites that render their header in JavaScript
(the buttertales case) yield no structure at all rather than a guess.

Structure beyond that stays ours: layout archetype, screens and the generated
artwork come from the trade shape, so the result is a real app rather than a
screenshot. Measured on live sites: buttertales.com → Plus Jakarta
Sans, `#f5f8f4`/`#111a24`, `standalone` manifest; papier.com → SuisseIntl, 4px
corners, white splash; books.toscrape.com → Helvetica Neue, 4px corners.

The **category** is the site's own, not one of our twelve: a schema.org type
first (`BookStore` → “Bookshop”, `HairSalon` → “Hair salon”, ~45 mapped), then
retail nouns the copy names outright (`bouquets` → “Florist”, `vinyl` → “Record
shop”), and only then the nearest trade's name. Whichever it picks comes with the
reason — “read as Bookshop — from the words on the page” — and lands in an
editable free-text field, so a ceramicist, a mobile dog groomer or a bookshop that
is also a café is described in the customer's words. The twelve trades are now
only **shapes**: which layout, navigation and screens the app renders. A category
outside them still gets a working app.

Every read is the live page. Subrequests use Workers' documented bypass
(`cache: 'no-store'`), plus `cache-control: no-cache, no-store` and
`pragma: no-cache` request headers, so neither a CDN in front of the site nor
Cloudflare's own cache hands back yesterday's HTML — an edit the owner made this
morning is in the brief, and an import always pays for a trip to the origin.

Limits, stated plainly:

- Sites that render their catalogue in JavaScript (most Next.js shops) return
  the shell only. The importer says the catalogue was missing instead of
  inventing products; the build then uses trade-seeded items.
- Photos are not copied — they belong to the owner or their supplier, and
  hotlinking breaks the offline app. The app uses its own generated artwork.
- Their **markup, CSS and JavaScript are not copied either**. A byte-for-byte
  clone would be their copyright, would ship without their consent, and would
  break the first time it went offline or they redeployed; a React or Next.js
  page has no working life inside a packaged shell. What is reproduced is the
  design language (palette, type, shape) and the facts (name, catalogue,
  contact), assembled into an app built for this purpose. Packaging the customer's
  own existing PWA as-is is a different product and is not built here.
- No AI model is called at import time. Layout choice, copy and the artwork are
  deterministic code, so an import is fast, free and repeatable; adding a model
  would mean a key, a budget and a slower brief for a result no more faithful
  than reading the site's own tokens.
- Bot protection (Cloudflare challenges, 403s) is reported as a failed read,
  with the manual brief as the fallback.
- Requests are HTML-only, capped at 900 KB and 9 s, and every host is checked
  against private ranges, link-local addresses and metadata endpoints — before
  each request and on each redirect hop.
- `POST /api/import` is JSON-only and same-origin: another site's page cannot
  trigger a crawl from a visitor's browser, and a plain form post cannot reach
  it. Requests for the same URL while one is already running share that crawl.
  The deployment stops after 400 imports a day (`import_budget` in D1; override
  with the `IMPORT_DAILY_CAP` variable, `0` closes the importer) and one isolate
  holds a burst of three that refills every 20 seconds, so the most a day can
  spend is bounded even under abuse. One visitor also gets three reads a day
  (`daily_budget`, keyed by the hash of `cf-connecting-ip`), so a single browser
  cannot drain the shared allowance and leave everyone else filling the brief
  in by hand. The per-visitor figure is a constant rather than a variable:
  there was no reason to tune it separately from the shared cap. A link is checked against the same scheme
  and host guard as the crawler before it is counted, so junk requests cannot
  drain the day's allowance.
- Counter rows are kept per UTC day. The first shared build or the first import
  of a new day deletes every older row from `daily_budget` and `import_budget`,
  so the tables hold today plus at most a stray row recreated by a request that
  began before midnight. A failed sweep is logged and left for the next day; it
  never fails the build or import that triggered it.

## Deliberate limits

- Store binaries need the customer's signing identity, so exports are projects +
  commands, never pre-signed `.apk` / `.ipa` files.
- The free-text "anything else" ask is stored and shown, not auto-implemented:
  logic that needs a real backend (stock reservations, POS sync, ticketing) is
  quoted as custom work.
- Builds are metered before anything is written: three a day per visitor and
  forty a day for the studio (`daily_budget` in D1). The visitor key is a
  hash of Cloudflare's `cf-connecting-ip`; `X-Forwarded-For` is ignored on
  purpose, because a caller can choose it and would otherwise get a fresh
  allowance per header value. Requests with no connecting-IP (local dev) share
  one bucket.
- `/privacy` publishes the deletion contact from the `CONTACT_EMAIL` variable.
  Unset, it tells people to ask whoever sent their build link — set it before
  announcing the site.
- `/studio` is gated by a single operator key: the `STUDIO_KEY` Worker secret,
exchanged for an HMAC session cookie by `/studio/unlock`. With no key set the
board returns a locked page instead of the customer list. Customer build links
stay private through their 24-character tokens.
- Payment collection is not implemented: plans and prices are, invoices are not.
