# Plattr generation-quality benchmark — 21 November 2026

## What was tested

Five previously unseen public businesses, each crawled once through the existing importer, then used to generate three concepts. The apps are local benchmark builds, not production deployments. No payment, paid-AI or infrastructure change was made.

| Business | Source | Vertical | Concepts |
| --- | --- | --- | --- |
| Yarmouth Oilskins | https://yarmouthoilskins.com/ | Retail / shop | Minimal boutique, Gallery retail, Contemporary lifestyle |
| Padella | https://www.padella.co/ | Restaurant | Editorial dining, Modern casual, Premium luxury |
| Hotel Pelirocco | https://www.hotelpelirocco.co.uk/ | Hotel | Coastal luxury, Editorial stay, Quiet modern |
| Blue Tit | https://www.bluetitlondon.com/ | Appointments / salon | Luxury beauty, Modern minimal, Editorial wellness |
| Architecture for London | https://www.architectureforlondon.com/ | Professional services | Classic counsel, Modern advisory, Editorial practice |

The five source sites are the five benchmark URLs. All fifteen generated apps are listed with links in the per-business sections below. Screenshots and contact sheets are under `screens/` and `contact-sheets/` in this directory.

## Discovery results

The discovery stage records a value, a method and a confidence for each fact. A missing or uncertain value is left empty; it is not filled with a sample fact.

| Business | Identity / trade | Catalogue evidence | Contact and location | Currency |
| --- | --- | --- | --- | --- |
| Yarmouth Oilskins | `yarmouthoilskins`, from metadata (likely); trade `shop`, verified | 90 source rows; 74 usable products, all 74 priced, all 74 with a photo, all 74 with variants/categories | Phone, email and address not extracted; recorded as missing and asked as a question | GBP, visible text, likely |
| Padella | `Padella`, metadata (likely); trade `restaurant`, verified | 5 rows, all navigation/policy/location pages (`Cookie Policy`, `Privacy Policy`, the three restaurant pages); 0 prices, 0 photos | Phone, email and address not extracted | GBP, metadata, likely |
| Hotel Pelirocco | `Hotel Pelirocco`, metadata (likely); trade `hotel`, verified | 9 rows, all policy/hire/blog/packages pages; 0 prices, 0 photos | Phone, email and address not extracted | blank, inferred guess |
| Blue Tit | `Blue Tit London`, metadata (likely); trade `salon`, verified | 82 real service names; only 7 priced; 0 photos | Phone captured (`01702412486`); address not extracted | GBP, metadata, likely |
| Architecture for London | `Architecture for London`, metadata (likely); trade `professional`, verified | 8 rows: 6 Instagram/journal captions plus `Build` and `Projects Archive`; 0 prices, 0 photos | Phone and email captured; address not extracted | GBP, metadata, likely |

### Identity extraction

| Business | Accent | Display type | Notes |
| --- | --- | --- | --- |
| Yarmouth | `#2a5a8f` | Old Standard TT | Best identity result: palette and a real display face were recovered. The business name is lowercased (`yarmouthoilskins`), which reads as a defect in the app header. |
| Padella | `#c8452b` | none extracted | Warm cream/red palette is credible. No display face recovered, so the app falls back to a system serif; the result still reads as Padella but is not type-faithful. |
| Pelirocco | `#de4528` | Indie Flower | Dark, playful palette recovered; the handwritten display face is a plausible brand choice but was chosen from available font evidence, not a full identity audit. |
| Blue Tit | `#0d6efd` | none extracted | The accent is a generic Bootstrap blue, not a verified brand colour. Pink-tinted surfaces are a weaker heuristic. |
| AFL | `#007aff` | Arial | Generic iOS blue and Arial; identity is essentially a default, not a recovered architectural-studio identity. |

Missing facts were not invented in the discovery records. They were, in several cases, replaced in the generated app by platform defaults (see defects).

## Per-business results

### 1. Yarmouth Oilskins — strongest result

Source: https://yarmouthoilskins.com/

Discovery found a genuine Shopify catalogue: 74 usable products across clothing, hats, jackets, trousers, shirts, knitwear, smocks, coats, bags, shorts, vests, oilskins and dungarees. Prices, product photos and variant option groups survived. GBP is supported by visible currency symbols. The app carries 74 items, all priced and all with a photo, plus size/colour variants. The variant-price chips now render once (`£5`, `£10`, …), not `£5.00 £5`.

| Concept | App | A/20 | V/20 | D/20 | W/15 | E/15 | R/10 | Total | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Minimal boutique | http://127.0.0.1:5173/p/057de9ae4ebc6422bd1bf470/app | 15 | 15 | 17 | 14 | 15 | 10 | **86** | PASS |
| Gallery retail | http://127.0.0.1:5173/p/942deee4857399325c3befac/app | 15 | 17 | 18 | 14 | 15 | 10 | **89** | PASS |
| Contemporary lifestyle | http://127.0.0.1:5173/p/cd7eb9e7ff2c03e823cec8c9/app | 15 | 16 | 16 | 14 | 15 | 10 | **86** | PASS |

Screens: `screens/yarmouth/{minimal,editorial,lifestyle}-{390,430,768,1280}.png`, plus `-catalog.png` and `-detail.png`. Contact sheet: `contact-sheets/yarmouth.png`.

What works: real catalogue depth; correct currency; item-photo association; size/colour variants; variant-price selection; bag, pickup/delivery selector,
place-order flow without payment; distinct list-led, image-led and narrative-led homes; catalogue and detail screens on all four widths.

Defects and limits:

- Business name is lowercased (`yarmouthoilskins`), not the visible brand casing.
- Phone, email and address were not discovered. The app does not display them, but a retail app without contact details is incomplete.
- The app offers `Pickup` and `Delivery` with a `£2.99` delivery fee. Neither the pickup option nor that fee appears in the discovery evidence. These are platform defaults and must be treated as unverified, not as Yarmouth facts.
- Variant-specific photography is not available from the source. The same product image is shown for every size/colour; prices switch correctly, but image parity per variant is unverified.
- No contact page or store-locator content exists because no address was discovered.

### 2. Padella — catalogue failure

Source: https://www.padella.co/

The crawler returned only five rows: Cookie Policy, Privacy Policy, and the Shoreditch, Borough Market and Soho restaurant pages. It did not capture the menus, dishes, prices or food photography. The generated catalogue therefore contains policy and location pages presented as catalogue entries, with gradient placeholders where food images should be. No dish or price was invented, which is correct, but the resulting restaurant app cannot perform its primary job.

| Concept | App | A/20 | V/20 | D/20 | W/15 | E/15 | R/10 | Total | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Editorial dining | http://127.0.0.1:5173/p/5220795666d50b3456e0d89a/app | 4 | 13 | 15 | 9 | 15 | 10 | **66** | FAIL |
| Modern casual | http://127.0.0.1:5173/p/2051894d3f3f3c4f8b42a445/app | 4 | 12 | 14 | 9 | 15 | 10 | **64** | FAIL |
| Premium luxury | http://127.0.0.1:5173/p/9186b1ba520b37987e5e6a83/app | 4 | 14 | 15 | 9 | 15 | 10 | **67** | FAIL |

Screens: `screens/padella/*`. Contact sheet: `contact-sheets/padella.png`.

What works: the three directions are visibly different (light editorial, compact two-column modern, dark reservation-first luxury); the reserve flow accepts party size, date and time; the editor and responsive layout pass.

Defects and limits:

- No menu, dishes, descriptions, prices or food images. The catalogue is five policy/location pages, not a restaurant menu. This is the dominant failure.
- Phone, email and address were not extracted.
- The reserve flow offers generic party/date/time choices that were not verified against the source's booking availability. The interaction works, but availability is invented by the platform.
- No source-specific offers, chefs, story or reviews were available; the app must not pretend otherwise.

### 3. Hotel Pelirocco — catalogue failure

Source: https://www.hotelpelirocco.co.uk/

Discovery returned nine policy, hire, blog, press and packages pages. It did not capture rooms, room names, rates, amenities or interiors. The app presents those nine pages as its catalogue, with no prices and no photos. The result has a strong visual mood but not a usable hotel inventory.

| Concept | App | A/20 | V/20 | D/20 | W/15 | E/15 | R/10 | Total | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Coastal luxury | http://127.0.0.1:5173/p/2bfd6e7c88cae4b30d3e45bc/app | 4 | 14 | 13 | 9 | 15 | 10 | **65** | FAIL |
| Editorial stay | http://127.0.0.1:5173/p/5481f05213d1957d8a3590b6/app | 4 | 13 | 14 | 9 | 15 | 10 | **65** | FAIL |
| Quiet modern | http://127.0.0.1:5173/p/e2816a0bf35c40e28f8a2640/app | 4 | 12 | 14 | 9 | 15 | 10 | **64** | FAIL |

Screens: `screens/pelirocco/*`. Contact sheet: `contact-sheets/pelirocco.png`.

What works: the dark coastal-luxury direction is visually coherent; the check-availability sheet opens and accepts dates; all three concepts pass editing and responsive checks.

Defects and limits:

- No rooms, rates, occupancy, amenities or hotel photography. The catalogue is policy/hire/blog content, not a room list.
- Phone, email and address were not extracted.
- Currency is blank and marked as a guess. A hotel app must not show a price or currency it cannot support.
- Availability dates and guest counts are generic platform inputs, not source availability.
- The concept names imply room-led experiences that the data cannot support.

### 4. Blue Tit — usable service directory, incomplete commerce data

Source: https://www.bluetitlondon.com/

Discovery found 82 genuine service names and a phone number. Only 7 services had a price; none had a photograph. The generated apps present the real service list and an appointment flow, but most services are unpriced and every service falls back to a placeholder/gradient rather than a salon image. The address was not captured.

| Concept | App | A/20 | V/20 | D/20 | W/15 | E/15 | R/10 | Total | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Luxury beauty | http://127.0.0.1:5173/p/4e287ddd74771d2ce9365c45/app | 10 | 15 | 16 | 13 | 11 | 10 | **75** | FAIL |
| Modern minimal | http://127.0.0.1:5173/p/00fc5e576eacdc414d84869c/app | 10 | 14 | 16 | 13 | 15 | 10 | **78** | PARTIAL |
| Editorial wellness | http://127.0.0.1:5173/p/5139619f8e5e3e215691f624/app | 10 | 14 | 15 | 13 | 15 | 10 | **77** | PARTIAL |

Screens: `screens/bluetit/*`. Contact sheet: `contact-sheets/bluetit.png`.

What works: the 82-service catalogue is real and navigable; the appointment flow offers service/date/time and customer fields; price edits reach the customer app; minimal and editorial pass the full editor acceptance; all widths are responsive.

Defects and limits:

- 75 of 82 services have no price, and no service has a photo. The app cannot show a complete price list or a service gallery without inventing either.
- The postal address was not extracted; only the phone is present.
- `Luxury beauty` fails editor acceptance: the visible heading edit saves in the input but never reaches `state.doc` or the customer app. `FAIL heading edit saves` and `FAIL heading edit reaches the customer app` in `editor.json`. Catalogue price, undo and reload still pass. This is a genuine per-app editability failure, not a score deduction only.
- Generic appointment times are platform defaults, not live availability.
- The extracted brand accent is generic Bootstrap blue, so the visual identity is weaker than the design quality suggests.

### 5. Architecture for London — journal captions used as services

Source: https://www.architectureforlondon.com/

Discovery found six Instagram/journal captions plus the navigation labels `Build` and `Projects Archive`. Those eight rows were treated as a catalogue. No service descriptions, fee basis, project prices or project photography were recovered. Phone and email were captured; the address was not.

| Concept | App | A/20 | V/20 | D/20 | W/15 | E/15 | R/10 | Total | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Classic counsel | http://127.0.0.1:5173/p/8ededdb9bb97ce5f99eebe0d/app | 5 | 12 | 14 | 11 | 15 | 10 | **67** | FAIL |
| Modern advisory | http://127.0.0.1:5173/p/f782d22f88d7f1eefbfec58b/app | 5 | 11 | 13 | 11 | 15 | 10 | **65** | FAIL |
| Editorial practice | http://127.0.0.1:5173/p/d5fe8fda6873684c7c23262e/app | 5 | 13 | 14 | 11 | 15 | 10 | **68** | FAIL |

Screens: `screens/afl/*`. Contact sheet: `contact-sheets/afl.png`.

What works: the proposal-enquiry flow opens and submits; the three directions differ in typography, density and opening screen; phone/email are real; editing and responsive checks pass.

Defects and limits:

- The catalogue is journal/social captions and navigation labels, not a service or project list. `Build` and `Projects Archive` are not offerings with descriptions or prices.
- No verified project photographs, fee model, project types or address.
- The booking/quote flow is a generic form; it is not verified against the practice's actual enquiry process.
- The `#007aff` accent and Arial display face are defaults, not a recovered identity.

## Scoring

Rubric: accuracy 20, visual 20, differentiation 20, workflow 15, editability 15, responsive 10. Missing facts are not rewarded; an invented fact is a defect even when the design is strong.

| App | Accuracy | Visual | Differentiation | Workflow | Editability | Responsive | Total | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Yarmouth / Minimal | 15 | 15 | 17 | 14 | 15 | 10 | **86** | PASS |
| Yarmouth / Editorial | 15 | 17 | 18 | 14 | 15 | 10 | **89** | PASS |
| Yarmouth / Lifestyle | 15 | 16 | 16 | 14 | 15 | 10 | **86** | PASS |
| Padella / Editorial | 4 | 13 | 15 | 9 | 15 | 10 | **66** | FAIL |
| Padella / Modern | 4 | 12 | 14 | 9 | 15 | 10 | **64** | FAIL |
| Padella / Luxe | 4 | 14 | 15 | 9 | 15 | 10 | **67** | FAIL |
| Pelirocco / Luxe | 4 | 14 | 13 | 9 | 15 | 10 | **65** | FAIL |
| Pelirocco / Editorial | 4 | 13 | 14 | 9 | 15 | 10 | **65** | FAIL |
| Pelirocco / Minimal | 4 | 12 | 14 | 9 | 15 | 10 | **64** | FAIL |
| Blue Tit / Minimal | 10 | 14 | 16 | 13 | 15 | 10 | **78** | PARTIAL |
| Blue Tit / Editorial | 10 | 14 | 15 | 13 | 15 | 10 | **77** | PARTIAL |
| Blue Tit / Luxe | 10 | 15 | 16 | 13 | 11 | 10 | **75** | FAIL |
| AFL / Classic | 5 | 12 | 14 | 11 | 15 | 10 | **67** | FAIL |
| AFL / Minimal | 5 | 11 | 13 | 11 | 15 | 10 | **65** | FAIL |
| AFL / Editorial | 5 | 13 | 14 | 11 | 15 | 10 | **68** | FAIL |

Result definitions:

- **PASS**: real evidence-backed catalogue, no invented catalogue entry, no editability blocker, no responsive/console failure.
- **PARTIAL**: usable and mostly real, but a material completeness gap prevents a clean pass.
- **FAIL**: the primary business content is missing or misclassified, or a required editor interaction fails.

The aggregate hides the distribution: Yarmouth is the only business whose generated apps can stand in for the source. Three of the five businesses fail on catalogue evidence, and one Blue Tit concept fails on editability. The mean score (about 72) is not a quality signal because it mixes genuine apps with designed but empty ones.

## Differentiation

`validateConcepts` reports `ok: true` for all five triples, with seven layout axes different per pair. The concepts change opening screen, navigation, card treatment, typography, image treatment, section order and density. In the screenshots the three Yarmouth and Blue Tit directions are clearly different; Padella, Pelirocco and AFL also change mood and layout, but their shared five-to-nine-row content makes the differences feel like skins on the same thin catalogue.

One systematic limitation remains: within each business, every pair shares the same block set (`same block set` in the diversity report). The concepts do not add different section types or interactions; they rearrange and restyle the same blocks. That is enough for visible differentiation but weaker than a true information-architecture rewrite. Scores of 13-18/20 reflect this.

## Automated and browser verification

- Capture: 15 apps × (390, 430, 768, 1280, catalogue, detail) = **90 PNGs** in `screens/`.
- Responsive: **0 horizontal-overflow reports** across all 60 width captures.
- Runtime: **0 console errors** and **0 failed network requests** in `capture.json`.
- Editability coverage: `editability.json` reports **15/15 PASS**, with no missing or duplicate editable slots.
- Editor acceptance: `editor.json` reports **14/15 pass**. The only failure is Blue Tit / Luxury beauty: heading edit does not save or reach the customer app. Catalogue price edits, undo and editor reload pass there.
- Workflow probes:
  - Yarmouth: variant selection, bag, pickup/delivery and place order work; no payment is taken.
  - Padella: reserve sheet accepts party, date and time.
  - Pelirocco: check-availability sheet accepts dates and guests.
  - Blue Tit: appointment booking works against all 82 services.
  - AFL: proposal enquiry opens and submits.
- Typecheck: `bun run typecheck` passes.
- Tests: `bun test` passes **680/680** across 57 files.

Screenshots are viewport captures. Product images are lazy-loaded; the capture log records 15-29 of 71 Yarmouth images present at the first viewport, and more after the catalogue/detail screens. Where an image is shown, it is a real source image; absence of a photo in a viewport is not treated as a failed image request.

## Defects found and fixed during the benchmark

These were found by the pilot and fixed before the final captures; the sites were rebuilt from the saved reports rather than recrawled.

1. **Variants dropped during discovery/site conversion.** `sourceId`, variants and option groups are now preserved. Yarmouth's size/colour options and prices survive into the app.
2. **Price-only option labels duplicated.** The detail screen showed `£5.00 £5`. The price-only test now uses a backslash-free character class, so the served client receives a working regex; the Yarmouth detail capture shows single `£5`-style labels.
3. **Unsubstantiated teaser rows in the catalogue.** Items with no price, description, image or variants are dropped unless an owner price decision names them. This removed `View Now`/`Shop Now` rows while preserving an item whose price is supplied later by an owner decision.
4. **Imported sites inherited sample content.** Imported projects no longer inherit fabricated contact details, opening hours, offers, team, staff or menu fallbacks. Empty fields remain empty, which is why several apps show no contact block instead of a plausible fake one.

## Limitations and out-of-scope items

- No production deployment, no payment activation and no paid-AI calls. All apps and tests are local.
- Padella, Pelirocco and AFL need a second, broader crawl (menu/room/project extraction) before they can be re-benchmarked. That was deliberately not done here; each site was to be crawled once.
- Yarmouth's missing contact data and lowercased brand name need discovery work, not a visual fix.
- The default `Pickup`/`Delivery` and `£2.99` fee on Yarmouth are platform defaults, not source facts. They remain a content-accuracy defect.
- Generic booking/enquiry availability is generated by the platform and was not checked against live availability.
- The renderer produces one image per product; source variant photography was unavailable, so variant-image parity is unverified.
- No Lighthouse/accessibility audit was run. The review covers rendered screenshots, structural slots, editor behavior, workflows, responsive width and runtime logs.
