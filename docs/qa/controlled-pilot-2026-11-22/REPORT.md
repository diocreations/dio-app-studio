# Controlled pilot readiness — final report

Date: 22 November 2026

Status: **eligible for an owner-supervised pilot in retail, restaurants, salons
and professional services. Not public-production ready. Hotels remain disabled.
Live payments remain disabled.**

No live crawl, paid AI generation, payment activation, deployment, commit or
push was performed for this work. Evidence comes from saved reports, the local
Worker and its local D1/R2 state.

## 1. What was tested

| Gate | Result | Evidence |
| --- | --- | --- |
| Typecheck (`tsc` app + Worker) | pass | `bun run typecheck` |
| Production build | pass, 79 modules | `bun run build`; postbuild removed `.dev.vars` and source maps |
| Full automated suite | **753 pass, 0 fail**, 62 files, 7,280 assertions | `bun test` |
| Owner journey in a real browser | **46/46 pass** | `journey-final/owner-journey.json` |
| Four eligible trades, customer workflow + owner dashboard | **4/4 pass** | `acceptance-final/pilot-acceptance.json` |
| Hotel stay request, browser to dashboard | pass | section 3 below |
| Visual matrix | 111 screens, 0 network failures, 0 console errors | `concepts-final2/visual.json` |
| Concept architecture tests | pass, at least 5 architecture axes differ per pair | `tests/blueprints.test.ts` |

The clean dataset is `.chrome-qa/pilot-clean-apps-v6.json`: five saved-evidence
businesses, three concepts each, fifteen builds. The four eligible businesses
are Yarmouth Oilskins (retail), Padella (restaurant), Blue Tit London (salon)
and AFL Build (professional services). Pelirocco is the saved hotel evidence and
is excluded from the pilot.

## 2. Defects fixed

### Hotel booking

- Added a real room booking contract: selected room, check-in, check-out,
  guests, nightly rate, nights and calculated total are retained through detail,
  navigation, the booking form, submission and the dashboard.
- The server validates dates, date order, guest capacity, the selected room and
  the total; a stay is stored as `requested`, never as confirmed availability.
- Hotel ordering/cart is suppressed; the home action is **Request a stay**.
- The confirmation states: “This is a request, not a confirmed reservation.”
- Browser evidence: Garden double, 23–25 November 2026, 2 guests, $180/night,
  2 nights, $360 total; dashboard shows the same room, dates, rate, total and
  guest name. A second Loft suite stay is also present and correctly priced.
- Hotels remain disabled for the pilot.

### Application defects found during acceptance

| Defect | Fix |
| --- | --- |
| Tapping a catalogue item could throw `ReferenceError: mediaMark is not defined` and leave the customer on the catalogue | Defined the missing-media mark in the client bundle; added a regression test; verified the detail screen opens |
| Stale editor media-library response could overwrite a just-uploaded image | Added a request sequence guard |
| The service worker cached `/api/` owner responses cache-first | API routes now bypass the cache; PWA tests added |
| Restaurant home offered **See the menu** even when no dish was published | Empty menus now offer **Request a table**; a menu with empty sections is counted by dishes, not sections |
| Missing photographs rendered as blank dark fields or tiny illegible labels | Small catalogue fields carry a two-letter mark; detail fields carry the item name and an explicit “Image not supplied” note |
| Blue Tit’s luxe treatments were cramped two-up on a phone and its catalogue rail hid most of 82 treatments | One-up cards on phones, two-up from 520px; catalogue is a two-up tile index, not a horizontal rail |
| Professional home advertised a proposal but could send it to the booking screen | Home now leads to the proposal workflow; consultation booking keeps its own **Request a consultation** label |
| Desktop app was capped at 980px from 1120px | Tablet uses up to 880px, desktop up to 1200px; content remains readable and the journey has no horizontal overflow at 1280 |
| SEO description was used as brand story | Generated story copy filters search-result metadata; the Padella SEO paragraph is gone |
| Generic trade CTAs (“See the menu”, “Book an appointment”, “Get a quote”, “Reserve”) | Trade defaults are now View product/Add to cart, View menu/Request a table, View room/Request a stay, View treatment/Request appointment, View service/Request a proposal; labels remain owner-editable |
| Spec-sheet and story detail concepts looked like the feature concept | The catalogue-first concept now hides the photograph and reads as a spec sheet; the image-first concept runs the photograph to the page edge |

## 3. Hotel acceptance detail

Browser run against the saved hotel app with rooms:

```text
Garden double · $180 a night · 2 guests
2026-11-23 → 2026-11-25 · 2 nights
$180 a night × 2 = $360
Request sent — not a confirmed reservation
```

Dashboard payload:

```text
room: Garden double
date: 2026-11-23
checkOut: 2026-11-25
nights: 2
nightlyRate: 18000
total: 36000
party: 2
customer: Hotel Pilot
status: requested
```

This is a booking **request**, not an availability confirmation. No availability
service is integrated, and the UI says so before and after submission.

## 4. Concept differentiation

Each trade receives three architecture blueprints, not three colour skins.
Across the three concepts the app changes:

- initial screen (home vs catalogue-first),
- header model (masthead, utility bar, overlay),
- navigation model and tab order,
- home block order and which blocks are present,
- catalogue grammar (journal, index, stories/tiles),
- card grammar (editorial, compact, campaign),
- detail composition (feature, spec, story),
- type family and image proportion.

The automated architecture validator requires at least five differing axes for
every pair. The visual matrix confirms the visible outcomes:

| Business | Concept A | Concept B | Concept C |
| --- | --- | --- | --- |
| Yarmouth (retail) | minimal: catalogue-led list, no large hero | editorial: magazine cover and large product imagery | lifestyle: image-first, serif display, campaign cards |
| Blue Tit (salon) | minimal: compact treatment index, no photography | editorial: large treatment image, single-column list | luxe: dark image-first home, two-up treatment tile catalogue |
| Padella (restaurant) | editorial: wordmark home, table request | modern: opens on the menu, compact chrome | luxe: dark, opens on the menu, centred display type |
| AFL (professional) | classic: title-first, services index, proposal | minimal: opens on the service index, spec-sheet detail | editorial: service-led home, story detail, full-bleed image |
| Pelirocco (hotel, excluded) | minimal list | editorial image-led | luxe dark image-led |

**Why some trades still look closer than Yarmouth:** Yarmouth has 74 real
products and real photography, so all three concepts have material to arrange.
Padella has no publishable dishes, Pelirocco has no rooms and AFL has one
service. Where there is no content for a concept’s chosen composition, the
generator keeps the honest empty state; it does not invent dishes, rooms,
services or photographs. That limits visible catalogue/detail differentiation
for those businesses, and is a content limitation, not a styling decision.

## 5. Visual quality

Reviewed manually from the 111-screen matrix and five trade contact sheets, plus
four responsive sheets at 320, 390/430, 768 and 1280.

**Improved:**

- Hero composition uses the verified wordmark, real photography where it exists,
  and an intentional typographic/colour field where it does not.
- Yarmouth’s real photography leads its editorial and lifestyle concepts.
- Blue Tit’s absent treatment photographs are now composed monogram fields, not
  blank rectangles; detail pages explain the absence.
- Empty catalogues state what was read and why nothing was published, in the
  owner’s language, instead of showing an empty grid.
- Missing or unsuitable SEO copy is not published as the brand story.
- Desktop uses up to 1200px, with content capped for readable line lengths; no
  horizontal overflow was measured.
- Phone layouts remain first; 320px and 390px keep their hierarchy.

**Remaining visual flags in the final matrix (24):**

- 6 horizontal filter-chip edges on Yarmouth at narrow widths. These are
  intentional scrollable filter rows, not body overflow.
- 2 circular-art clipping flags on Yarmouth lifestyle imagery. Decorative crop,
  not lost content.
- 6 “detail did not open” rows for Padella and Pelirocco. Both have zero
  catalogue entries, so there is deliberately no detail page to open.
- 10 missing-art fields on Blue Tit editorial/luxe. These are intentional
  photographic-absence states; the business supplied no treatment photography.

No broken image requests, console errors or network failures were recorded.

## 6. Pilot acceptance

### Owner journey — 46/46

The complete owner journey passed in a real browser:

- landing page and saved website read;
- one price conflict shown with both readings and resolved by the owner;
- three concepts presented, visibly different, one selected;
- build created, owner review and missing-information list;
- dashboard and settings;
- visual editor load, block and element selection, autosave;
- catalogue editor, media upload, applied photograph served by the customer app;
- background and visibility controls;
- new navigation screen added and published to the bottom bar;
- save, reload and persistence through logout/sign-in;
- customer preview, no overflow at 1280, local approval and approved status.

### Four-trade customer acceptance — 4/4

| Trade | Business/concept | Customer action | Server result | Dashboard |
| --- | --- | --- | --- | --- |
| Retail | Yarmouth / editorial | product detail → add to cart → checkout | order #5005 created | orders 0 → 1 |
| Restaurant | Padella / editorial | Request a table, 2 guests, tomorrow 18:30 | booking request created | bookings 0 → 1 |
| Salon | Blue Tit / editorial | treatment detail → Request appointment | booking request created | bookings 0 → 1 |
| Professional | AFL / classic | Request a proposal with contact and message | enquiry created | enquiries 0 → 1 |

All confirmations used request language where availability is not confirmed.
No customer action invented a product, price, service or review.

### Local/staging publication simulation

The owner journey approves the build locally and the approved/published-ready
status is visible. No production deployment or public publication was performed.
The deployment path remains simulated locally.

### Concepts exercised

For every eligible business all three saved builds returned 200 and exposed the
expected architecture: retail index/immersive/lead; restaurant
immersive/index/lead; salon index/lead/immersive; professional
lead/index/immersive.

## 7. Production blockers

These block **public production**, not the supervised local/staging pilot:

1. **No production D1 or R2 resources** exist or are bound. Local Miniflare
   state is the only verified data store.
2. **No scheduled backup or offsite copy** is running. The backup, offsite
   upload, fetch and restore scripts exist and were rehearsed locally and on
   staging; no production schedule, bucket or retention job is configured.
3. **No production restore or rollback rehearsal.** D1 point-in-time recovery
   and Worker version promotion are provider operations that have not been
   exercised against production.
4. **No monitoring or alert owner.** Workers observability is enabled in
   configuration, but there is no uptime monitor, no Cloudflare notification
   wiring, no backup heartbeat endpoint and no named on-call owner.
5. **Production secrets are not configured.** `OWNER_SECRET` and `STUDIO_KEY`
   must be provisioned as Worker secrets; this workspace only has local
   `.dev.vars`.
6. **Single owner principal.** One derived owner key per build, no named staff
   accounts, no roles and no actor-level audit trail. Suitable for one supervised
   owner, not a multi-staff business.
7. **No per-project key rotation with overlap.** Rotating `OWNER_SECRET`
   invalidates every owner key at once.
8. **No data-retention or erasure procedure** for real customer data. Deletion
   and retention need an owner/legal decision and an operator runbook.
9. **No CSP.** Inline styles/scripts still need hashes or nonces before a strict
   policy can be enforced.
10. **No real iOS/Android device pass.** Browser emulation at 320–1280 is not a
    substitute for installed-PWA testing on physical devices.
11. **Payments are disabled** and no payment provider is active. Do not enable
    checkout payments in the pilot.
12. **Hotels remain disabled.** Room evidence is missing for the clean hotel
    business and no availability service exists.

## 8. Exact recommended pilot scope

**Trades:** retail, restaurants, salons, professional services only.

**Businesses:** up to five owner-supervised businesses across those four trades,
starting with the four accepted here:

- **Yarmouth Oilskins** — retail, full browse → cart → guest order journey.
- **Blue Tit London** — salon, treatment browse → appointment request; no
  treatment photography, monogram absence states.
- **Padella** — restaurant, table requests only. No menu or ordering until the
  owner publishes dishes.
- **AFL Build** — professional services, proposal requests only; one service in
  the saved evidence.
- Pelirocco is **excluded** until rooms and hotel acceptance exist.

**Enabled:** customer app, owner dashboard, editor, catalogue, requests,
owner-supervised onboarding, local/staging publication simulation.

**Disabled:** hotels, live payments, public indexing, automatic production
deployment, paid AI, live crawling.

**Operating model:** one named pilot operator, one named backup, owner keys sent
out of band, no real customer payment data, and a manual review of each
business’s generated copy and catalogue before customers see it.

## 9. What is not claimed

- This is not public-production readiness.
- The 753 tests and 46-step journey are not a substitute for production restore,
  monitoring, physical-device or live-payment testing.
- The hotel workflow is verified as a **request** workflow, not availability.
- Padella, Pelirocco and AFL do not have enough saved catalogue evidence to show
  every concept at its best; the report keeps that limitation rather than
  filling it with invented content.
- No deploy, commit or push was performed.

## 10. Evidence index

- `journey-final/owner-journey.json` and screenshots — 46/46 owner journey.
- `acceptance-final/pilot-acceptance.json` and confirmation screenshots — 4/4
  trade acceptance.
- `acceptance-final/hotel-and-summary.json` — hotel request fields, visual
  totals and the four-trade summary.
- `concepts-final2/visual.json`, `concepts-final2/*.png` — 111 screens.
- `sheets-final2/trade-*.png` — three concepts per business at 390px.
- `sheets-final2/responsive-*.png` — 320, 430, 768, 1280.
- `.chrome-qa/pilot-clean-apps-v6.json` — clean saved-evidence dataset (tokens
  and owner cookies; untracked).
- `OPERATIONS-CHECKLIST.md` — operational status by area.
- `docs/qa/release-readiness-2026-11-22/REPORT.md` — prior release audit,
  preserved.
