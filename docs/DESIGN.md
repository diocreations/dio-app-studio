# Plattr design system

This document is about the **generated mobile application**, not the Plattr
dashboard. It records what the audit found, the system that replaced it, and the
quality checks run against real mobile viewports.

## 1. Audit of the previous generation (before this change)

All 27 trades were rendered and their themes and components read from the HTML
and stylesheet.

| Finding | Evidence |
| --- | --- |
| Palettes were distinct, structures were not | 27 themes, but only 4 layout archetypes (`editorial`, `grid`, `rows`, `stack`) and 3 navigation styles shared across all trades. |
| One card grammar everywhere | Every trade used the same `tile` markup: 1px border, two layered drop shadows, 6px inset, 26px circular action. Variety came from four modest variants, not a different component. |
| Typography collapsed into four stacks | 27 trades shared serif / humanist / grotesk / condensed. Several unrelated trades therefore looked typographically identical. |
| One spacing rhythm | `18px` screen gutters, `30px` section margins and fixed card padding. The three “density” modes only nudged padding; there was no spacing scale. |
| Shadows used as hierarchy | The same `--shadow-1/2/3` tokens were applied to cards, icon buttons, search fields, sheets and sticky action bars. Lots of soft grey rectangles. |
| Repeated section heading | Almost every screen used a 9.5px uppercase tracked label plus a count pill, producing a recognisable template rhythm. |
| Weak product-card hierarchy | Name and price were close in size; long names wrapped awkwardly next to an absolutely positioned arrow; imagery was always the same aspect ratio. |
| Navigation was generic | The same tab item (21px icon, 8.5px uppercase label) was reused in bar, floating and dock forms. Labels were below comfortable reading size on small screens. |
| Forms were identical | The same field, slot and stepper components appeared in every trade, with no direction-specific treatment. |
| Sparse detail pages | Short items left several hundred pixels of empty space above the sticky action bar. |
| Duplicated metadata | Editorial and rows homes repeated opening hours in the hero and again in a meta strip or status card. |
| Empty/loading states were thin | One centred `.empty` message; loading relied on the splash screen only. No skeleton treatment. |
| Artwork was the fallback for everything | Without stock photography, every product image was the same gradient-and-monogram treatment, so catalogues looked repetitive. |

## 2. Design tokens

The app stylesheet now ships a shared token layer (`src/worker/appCss.ts`):

- **Type scale:** `--text-2xs` 10px → `--text-3xl` `clamp(34px, 10vw, 46px)`.
- **Spacing:** `--space-1` 4px → `--space-7` 40px.
- **Radii:** `--r-xs` 6px, `--r-sm` 10px, `--r-md` 16px, `--r-lg` 24px, `--r-full`.
- **Elevation:** existing `--shadow-1/2/3`, now reserved for overlays and sheets;
  cards use a hairline and tinted surface instead.
- **Motion:** `--dur-fast` 140ms, `--dur-base` 240ms, `--dur-slow` 380ms, one
  `--ease` curve. All motion respects `prefers-reduced-motion`.
- **Touch:** `--tap` 44px; nav items and primary controls meet it.
- **Safe area:** `--safe-top` / `--safe-bottom` wrap `env(safe-area-inset-*)`;
  app bar, tab bar, sheets and sticky CTAs all use them.
- **Direction tokens:** `data-direction` supplies the font pairing, layout,
  card shape, button shape, navigation and density together.

## 3. Directions

Every trade has three named directions (`src/worker/directions.ts`). A direction
changes the type system, layout archetype, navigation, palette family, corner
language, card/button geometry and density — not only the accent.

| Trade | Directions |
| --- | --- |
| Restaurant | Editorial dining · Modern casual · Premium luxury |
| Café & bakery | Daylight editorial · Counter service · Neighbourhood bakery |
| Shop & retail | Minimal boutique · Gallery retail · Contemporary lifestyle |
| Salon & spa | Luxury beauty · Modern minimal · Editorial wellness |
| Gym & studio | Performance · Studio minimal · Editorial fitness |
| Clinic & health | Calm clinical · Modern practice · Considered care |
| Trades | Direct trades · Modern service · Trusted local |
| Professional services | Classic counsel · Modern advisory · Editorial practice |
| Property | Editorial property · Modern agency · Premium homes |
| Hotel | Coastal luxury · Editorial stay · Quiet modern |
| Creative studio | Gallery · Modern studio · Editorial portfolio |
| Garage & auto | Workshop technical · Modern garage · Performance garage |
| Hospital | Clear care · Modern hospital · Human care |
| Online store | Minimal commerce · Boutique commerce · Contemporary lifestyle |
| Indoor plants | Botanical editorial · Modern plant shop · Green living |
| Garden centre | Grower technical · Nursery editorial · Modern garden |
| Online courses | Modern learning · Editorial academy · Practical school |
| Tuition | Editorial tuition · Modern tuition · Friendly centre |
| School | Friendly school · Modern school · Editorial school |
| Kindergarten | Playful days · Gentle start · Modern nursery |
| Finance | Classic advice · Modern advisory · Editorial finance |
| Agency | Bold studio · Modern agency · Editorial agency |
| Influencer | Creator bold · Editorial creator · Modern creator |
| Portfolio | Gallery portfolio · Modern portfolio · Editorial portfolio |
| Film | Cinematic · Editorial film · Modern film |
| Gallery | White cube · Editorial gallery · Modern gallery |
| Marketplace | Modern market · Weekend market · Editorial market |

A new document is born with its trade's first direction. Existing builds keep
their seeded rendering until a direction is chosen, so legacy output does not
change under them.

## 4. Components and interactions

- **App bar:** transparent in editorial, solid in modern/minimal, circular mark
  in luxury, mark omitted in gallery. Safe-area padding is preserved.
- **Bottom navigation:** larger labels, 44px targets, shape inherited from the
  direction; floating/dock/bar remain available and are now a customer choice.
- **Hero:** editorial magazine cover, dark luxury cover, restrained classic
  masthead; duplicate hours were removed from editorial homes.
- **Products:** 2-up, horizontal, list and overlay cards remain, but shadows are
  replaced by hairlines/tinted surfaces; editorial and gallery make imagery the
  hierarchy; minimal becomes a row list. Cards meet 44px action targets.
- **Detail:** a real “You might also like” rail built from the catalogue fills
  sparse pages with a useful next step, for menu, session, care and listing
  shells.
- **Forms/booking:** same reliable behaviour, re-shaped by the direction; slot
  and stepper controls use the shared radius and motion tokens.
- **Empty/loading:** empty states keep their plain-language copy; a skeleton
  utility and reduced-motion-safe shimmer are available for image loading.
- **Motion:** screen transitions, sheet spring, button press scale, card press,
  saved-heart pop, add-to-cart toast and haptic buzz. Durations stay under
  400ms and radial/shadow animation is avoided.

## 5. Customisation

`Doc.design` is part of the shared document:

```ts
design?: {
  direction?: string
  typography?: 'editorial' | 'modern' | 'compact'
  buttons?: 'square' | 'soft' | 'round'
  cards?: 'square' | 'soft' | 'round'
  nav?: 'bar' | 'floating' | 'dock'
  density?: 'cozy' | 'standard' | 'roomy'
}
```

The editor exposes these under **Design direction** and **Fine tune** whenever
no component is selected. Changing a direction replaces the fine-tune overrides
so the result is the direction the owner actually picked. Values are sanitised
against the trade's direction list; unknown values never reach the renderer.
Preview, review link and published app all read the same `doc`.

## 6. Visual QA

Rendered at **390 × 844** in the local Chromium preview:

- Restaurant — editorial: catalogue and detail.
- Retail — editorial boutique: home/catalogue.
- Salon — luxury beauty: home and booking.
- Professional services — classic counsel: home.
- Hotel — coastal luxury: home.

Screenshots are in `docs/qa/*-final-390.png`. Cart and booking behaviour were
checked in the browser: add-to-cart opens the sheet with a real line item and
totals; booking shows party stepper, days and seven selectable slots, and
confirm produces the confirmation sheet.

What reads well: strong display type, a clear single accent, generous editorial
pacing, luxury dark surfaces, consistent booking and cart controls, and a real
detail hierarchy. Remaining known limitations: without stock photography the
generated artwork is still repetitive across a large catalogue; some directions
(e.g. editorial) are intentionally sparse and can look empty on very short
catalogues; the mobile browser preview screenshot captures surrounding desktop
chrome, so the PNGs include blank space to the right of the 390px app.

Regression coverage is in `tests/designSystem.test.ts`: three directions per
trade, distinct signatures, legacy rendering unchanged, document overrides
reaching the app, and rejection of unknown values. Existing tests were not
removed.

## 7. Media pipeline (R2)

Implemented in `src/worker/media.ts`, with the editor UI in
`src/worker/views/editor.ts`. Workers cannot run an image codec, so decoding and
resizing happen in the owner's browser and the server verifies every byte it
stores.

1. **Authenticated upload** — `POST /api/projects/:token/media` under the
   project's owner session, same-origin checked, 18 MB request ceiling.
   The browser never receives R2 credentials. The `MEDIA` binding is server-only.
2. **Validation** — the original is sniffed by magic bytes (PNG/JPEG/WebP only;
   SVG and forged extensions are rejected), limited to 8 MB and 24 MP. Every
   stored variant must independently carry a WebP header, match its declared
   dimensions and stay under 2 MB.
3. **Normalisation** — the browser uses `createImageBitmap` (auto-orienting),
   draws 320/640/1280-wide canvases and encodes WebP at quality 0.82. The
   original file is never stored.
4. **Storage** — R2 keys are
   `projects/{projectId}/media/{sha256}/{width}.webp`; D1 stores the media id,
   dimensions, bytes, alt text, focal point and variant list. A unique
   `(project_id, hash)` pair deduplicates the same upload.
5. **Replacement and crops** — the document stores a `MediaRef` (id, alt,
   intrinsic dimensions, focal X/Y, fit and aspect), never a URL. Replacing,
   repositioning, fitting and crop shape all persist through the normal doc
   autosave; the stored photograph is never destructively edited.
6. **Delivery** — `/p/:token/media/:id/:width.webp` serves the closest stored
   variant with `image/webp`, `nosniff`, and
   `Cache-Control: private, max-age=31536000, immutable`. Access requires the
   app's token, so media stays private to the app link. The renderer emits
   `srcset` at 320/640/1280 with intrinsic `width`/`height`, `sizes`, lazy
   loading and async decoding.
7. **Limits** — 24 files and 40 MB per project, surfaced in the editor; the API
   returns `quota_files` or `quota_bytes` before writing.
8. **Deletion** — deletion is refused with `in_use` while the current document
   references the image. Retained versions are scrubbed of the reference before
   the R2 objects and D1 row are removed, so a restore shows an empty photo
   block rather than a broken image. R2 failures return `storage_failed` and
   leave no metadata behind.

The media editor also offers trade-aware photo briefs (subject and reason, such
as "a drink and pastry on the counter" for a café). They are prompts for the
owner's own photography, never generated photographs or claims about the
premises. The image inspector exposes replace, upload, library, focal point,
fit and aspect controls; the catalogue editor covers product names,
descriptions, prices and offers.

## 8. Flagship composition layer (November 2026)

### Audit method

The five reference trades were rendered in the local Chromium at **390 × 844**
and inspected as screens, not just as CSS. The restaurant was also captured
before the change (`docs/qa/before-restaurant-390.png`). The remaining 22 trades
were checked in the server-rendered DOM and their family/direction CSS; they
retain the existing shells until each gets its own flagship pass.

### What the rendered audit found

| Problem | Where it showed up | Response |
| --- | --- | --- |
| A website-style hero dominated the first screen | Restaurant opened with a 3-line display name, tagline, hours and address before the first dish. | Replaced with a compact menu lead: one line of promise, hours/location, then the menu immediately. |
| Repeated card grammar | Shop and restaurant both read as the same bordered rectangles with a small arrow. | Retail uses an edge-to-edge two-column product feed; restaurant uses a photographic menu index; salon uses a date rail and service rows; hotel uses a cinematic stay stack; professional uses an index of numbered services. |
| Weak product imagery | With no stock key, every image slot was a monogram on a flat tint. | Deliberate abstract artwork (gradient, grain, geometric marks) is now used, never an initial pretending to be a product. Retail varies the composition per card. |
| Oversized empty first screen | Hotel's fallback image consumed most of the viewport without information. | Reduced, given a room preview tag with real name and price, and followed immediately by the availability control. |
| Sticky actions covered content | Salon's booking action sat across the service list. | It is now a viewport-anchored action above the tab bar with reserved scroll padding, or a normal inline action on wide screens. |
| Navigation did not express the journey | Restaurant showed Menu/Book/Order/Visit but no discoverable path to the food's story; retail used Home/Shop/Bag/More with no filters in the header. | Each flagship keeps its trade's actual journey: restaurant menu-first, retail search/filter-first, salon appointment-first, hotel availability-first, professional service-index-first. |
| Touch targets and labels were inconsistent | Several icon actions and small labels were below 44px or 10px. | Flagship icon controls are 40px with 48px nav items; labels are at least 9.5px, buttons at least 46–50px. |

### The five experiences

1. **Restaurant — editorial menu book.** Compact menu lead, category chips,
   dish index with abstract plate marks, inline add controls, tab bar
   Menu / Book / Order / Visit. The menu is the product; no decorative hero.
2. **Retail — modern commerce feed.** Search is the first control, followed by
   a concise collection statement, category rail, and a two-column product feed.
   Prices and names sit below the image; the bag is always one tap away.
3. **Salon — appointment-first calm.** A date rail, service list with duration
   and price, staff names when the owner supplied them, and a persistent booking
   action. No cart and no irrelevant catalogue chrome.
4. **Hotel — immersive stay.** A restrained full-bleed stay image, room preview
   card, arrival/departure fields, then room stack. Dark surface, quiet type,
   availability before inventory.
5. **Professional — professional precision.** Typographic practice statement,
   numbered service index, fixed fees, and a booking or enquiry CTA depending
   on the trade's enabled features. No stock-photo hero and no invented proof.

### Design archetypes

The existing curated directions remain the source of truth. The flagship layer
selects among them by trade and keeps the owner able to switch alternatives in
the editor:

| Archetype | Flagship use | Direction |
| --- | --- | --- |
| Editorial Luxury | Restaurant, hotel | `editorial`, `luxe` |
| Contemporary Minimal | Retail, salon | `minimal` |
| Immersive Visual | Hotel | `luxe`, `editorial` |
| Modern Commerce | Retail | `lifestyle` |
| Professional Precision | Professional services | `classic`, `minimal` |
| Playful Contemporary | Available to the remaining trades | trade-specific directions |

### Editing and preservation

Each flagship home is generated as a document (`flagshipDocFromSpec()`), and the
published customer app and editor canvas render that exact document. Every
visible flagship block has a stable `sec_fx_*` id, can be selected directly in
the phone preview, edited, photographed, reordered, duplicated, hidden or
deleted, and is covered by autosave, undo/redo and version restore. The
compositions stay trade-specific: the document supplies order, copy, media and
visibility, while the flagship variants keep their own markup and CSS.

The final quality pass removed duplicated restaurant hours, made the salon and
professional actions inline instead of fixed over the service list, and kept the
bottom navigation as the persistent route to booking/enquiry. The shared
catalogue, cart, booking, enquiry, media, dashboard, version history and PWA
paths are unchanged.

Flagship captures after this pass: `docs/qa/unified-restaurant-390-final.png`,
`docs/qa/unified-shop-390-final.png`, `docs/qa/unified-salon-390-final.png`,
`docs/qa/unified-hotel-390-final.png`,
`docs/qa/unified-professional-390-final.png`; the direct editor is
`docs/qa/unified-editor-selection-390-final.png`.

### Files

- `src/worker/doc.ts` — `flagship` document kind, validated variants,
  `flagshipDocFromSpec()` and stable `sec_fx_*` ids.
- `src/worker/flagship.ts` — five flagship block renderers, catalogue leads,
  deliberate fallback artwork and the scoped mobile CSS.
- `src/worker/app.ts` — renders flagship document blocks through their variants
  and keeps the generic document path for older builds.
- `src/worker/index.ts` — supplies the same saved document to the editor and the
  customer app, so the published app is exactly what the editor saved.
- `docs/qa/` — browser captures used for the before/after review.

### Imagery and content intelligence

The geometric artwork remains the fallback for trades without a photo library,
but the five flagship trades now open with licensed, local photography:

- 37 distinct scenes across restaurant, retail, salon, hotel and professional,
  each stored as 320/640/1280 WebP (111 files, 4.8 MB total).
- A local library is the keyless default; Pexels is still used when a key is
  configured. Owner uploads stored in R2 override stock imagery per document
  block.
- Menu, product, service, room and professional imagery is assigned by stable
  item order rather than one repeated hero image. The catalogue and same item’s
  home card intentionally share that item’s scene.
- Seeded content is labelled sample in the editor, with shortcuts to items,
  prices and details. Professional builds gain two sample team profiles with
  portraits, names, roles and credentials; salon and professional bookings carry
  named sample staff.
- Restaurant, retail and salon default catalogues were aligned with their new
  photography so a furniture item is not shown under a kitchen shot.

After captures: `docs/qa/imagery-restaurant-390.png`,
`docs/qa/imagery-shop-390.png`, `docs/qa/imagery-salon-390.png`,
`docs/qa/imagery-hotel-390.png`, `docs/qa/imagery-professional-390.png` and
`docs/qa/imagery-editor-selection-390.png`. The before set remains the
`unified-*-390-final.png` captures. Photo sources and licence are in
`docs/PHOTOGRAPHY.md`; loading, width and flow evidence is in
`docs/DESIGN_QA.md`.

Additional files: `src/worker/flagshipImages.ts` (scene sets, alt text and
responsive markup), `src/worker/photos.ts` (local fallback), and
`public/images/flagship/` (delivered WebP variants).

## 9. Batch 3 — five more journeys (November 2026)

Five trades were added after the batch-2 acceptance: `trades`, `auto`,
`ecommerce`, `courses` and `finance`. Each has its own composition, type
system, surface treatment and navigation order; all reuse the shared document,
cart, booking, enquiry, media and dashboard paths. The implementation table and
acceptance evidence are in `docs/BATCH3_REPORT.md`.

### Identity per trade

| Trade | First screen reads as | Type / surface | Navigation |
| --- | --- | --- | --- |
| Trades & home services | a printed work-order ticket: job numbers, dashed rules, urgency stamp | condensed display, amber accent, square corners, hairline rules | Home · Services · Call-out · Quote · Contact |
| Garage & auto | a workshop job card: number plate, bay photo, torque-spec labels | heavy grotesk, steel blue, plate yellow, hazard stripe | Garage · Work · Book · Quote · Visit |
| Online store | a small-batch drop feed: rounded product cards, quick-add, delivery panel | warm rust, soft radii, serif display | Shop · Browse · Visit (cart in the app bar) |
| Online courses | a learning path: connected numbered nodes, course modules | navy/indigo, geometric display, rounded panels | Learn · Courses · More (cart in the app bar) |
| Financial advice | an advisory note: serif masthead, fee disclosure panel, adviser rows | cream paper, deep green, editorial serif | Advice · Services · Meeting · Enquiry · Contact |

### What the browser review changed

- Service and job rows no longer carry a thumbnail chosen by list index. The
  first three trades had photographs that did not match the job name; the rows
  are now work-order numbers with the photograph moved to a deliberate
  three-frame “recent work” strip. This also keeps the owner's item photo in the
  home composition.
- The ecommerce delivery panel had lost its copy padding when the photo was
  added; its heading overlapped the eyebrow. The panel now has an explicit copy
  wrapper, and the fulfilment rows are inset with it.
- The demo offer “Free delivery over $60” did not match the flat $2.99 delivery
  fee in checkout. The copy now says “Delivery $2.99, tracked”, and the shop
  vertical's equivalent offer was corrected the same way. A threshold-based free
  delivery rule is still not implemented.
- Short header actions (“All 7”, “All services”) were under 30px wide. They now
  have a 44px minimum target, as do the other trade header actions. The search
  clear button grew from 24px to 40px across every app.
- Course cards now use a 38px “View course” target, and the course detail CTA
  reads “Enrol on this course” with “Confirm enrolment” at checkout.

### Width matrix

All five apps were rendered through Chromium device metrics at 320, 375, 390 and
430px. Every cell had `scrollWidth === innerWidth`, no image that had loaded with
zero intrinsic width, no image without alt text, no unlabelled control, and no
navigation label clipped. Images per home screen: trades 13, auto 10, ecommerce
19, courses 10, finance 8. Captures are `screenshots/batch3/<trade>-<width>.png`.

Editor verification in this batch covered preview tap-selection, autosaved text,
undo/redo, library add, drag reorder, hide (including the published app),
duplicate, delete and version restore — see `docs/EDITOR.md`. What remains
unverified is physical-device rendering and touch behaviour; all checks used
browser emulation.
