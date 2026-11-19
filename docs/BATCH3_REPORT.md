# Batch 3 — five more trades, end-to-end report

November 2026. Local Worker at `127.0.0.1:8795`, local Chromium through CDP.
No production deployment was made. All viewport results are browser emulation,
not physical-device testing.

## 1. Audit: what was left and what was chosen

After batch 2, fifteen of twenty-seven trades had a flagship composition. The
remaining twelve were `hospital`, `plants-indoor`, `plants-outdoor`, `tuition`,
`school`, `kindergarten`, `agency`, `influencer`, `portfolio`, `film`, `gallery`
and `marketplace`. Their gaps are recorded in `docs/TRADE_MIGRATION.md`; the
common ones are department/ward navigation, season and care attributes, term
calendars, tutor matching, age-group structure, case-study proof, audience
proof, trailers, exhibition structure and vendor-scoped checkout.

The five selected were not the five easiest. They were the five that add a
different **customer journey** while reusing the established document, cart,
booking, enquiry and dashboard model:

| Trade | Why it was next | Journey it proves |
| --- | --- | --- |
| `trades` | highest-intent local service; quote and emergency call-out are the real actions | describe a problem → quote request; choose a slot → call-out booking |
| `auto` | workshop booking has different language (jobs, plates, bays) than a service list | choose work → book a bay slot; or ask for a diagnosis quote |
| `ecommerce` | fulfilment, not just a catalogue: delivery fee, pickup, loyalty, dispatch copy | quick-add → cart → delivery/pickup → guest checkout |
| `courses` | paid enrolment with a learning path, not a product grid | view course → enrol → checkout; free-lesson entry |
| `finance` | regulated, fee-only advice needs disclosure and a meeting, not a cart | read fees → book a first meeting or send an enquiry |

Missing shared components found in the audit and added for this batch: job
ticket rows with numbers and rates, vehicle-type and number-plate blocks,
coverage/response facts, a delivery panel with two fulfilment modes, a course
path and course cards, a fee-disclosure panel and adviser rows. No existing
block was replaced, and the first ten trades keep their compositions.

## 2. Screens and navigation

Every app keeps the shared screens (home, catalogue, detail, search, saved,
more) plus the screens its features enable.

| Trade | Visible tabs | Screens present |
| --- | --- | --- |
| Trades | Home · Services · Call-out · Quote · Contact | home, catalog, book, quote, more, search, saved, detail |
| Auto | Garage · Work · Book · Quote · Visit | home, catalog, book, quote, more, search, saved, detail |
| Online store | Shop · Browse · Visit | home, catalog, more, search, saved, detail; cart is a sheet |
| Courses | Learn · Courses · More | home, catalog, more, search, saved, detail; cart is a sheet |
| Finance | Advice · Services · Meeting · Enquiry · Contact | home, catalog, book, quote, more, search, saved, detail |

The quote tab is ordered before Visit for trades, auto and finance, so the five
visible tabs follow the journey rather than document insertion order.

## 3. Distinct design

| Trade | Visual identity | Typography and surfaces | Sample content |
| --- | --- | --- | --- |
| Trades | printed work-order ticket; numbered jobs, dashed rules, amber urgency stamp | condensed display, amber, square corners, hairlines | Mercer & Okafor; leak repair, bathroom refit, boiler service; 24/7 call-out; 2h/24h/1wk response facts |
| Auto | workshop job card; GB number plate, bay photo, torque labels, hazard stripe | heavy grotesk, steel blue, plate yellow, square controls | Dock Road Motors; interim/full service, MOT, brakes, clutch; vehicle types; next available bay |
| Online store | small-batch drop feed; rounded cards, quick-add, warm rust delivery panel | warm rust, soft radii, serif display | Fielding Goods; tote, ceramics, throw, wooden product; delivery $2.99; rewards card |
| Courses | learning path with connected numbered nodes and module cards | navy/indigo, geometric display, rounded panels | Goodwork Courses; accounts, writing for work, bookkeeping; 6 courses; free first lesson |
| Finance | advisory note; serif masthead, fee disclosure, adviser rows | cream paper, deep green, editorial serif | Marsh & Shah; review, retirement, first-time buyer, remortgage, life cover; fee basis per service |

Presentation-only blocks (promise, coverage, learning path, rewards, adviser
list, disclosure copy) are clearly copy, not claims of live data. Every action
button either navigates, opens a real form, adds to the cart or opens the bag.
No decorative controls were added.

## 4. Customer workflows verified

Each flow was driven through the shipped app JavaScript in Chromium, then read
back through the owner dashboard API. The success sheet was checked in the
browser as well.

| Trade | Flow | Browser result | Stored record |
| --- | --- | --- | --- |
| Trades | quote with name, email and problem description | “Request sent” sheet | enquiry from Nadia Whitfield (`new`) |
| Trades | call-out booking with name and phone | “Request sent” sheet | booking from Nadia Whitfield (`requested`) |
| Auto | booking with service and third slot | “Request sent” sheet | booking from Callum Reid (`requested`) |
| Online store | quick-add tote → cart → delivery checkout | “Order #7683”, $70.99 ($68.00 + $2.99 delivery) | order for Imogen Vale (`new`, unpaid) |
| Courses | Courses tab → course detail → enrol → confirm | “Order #7773”, $149.00, online fulfilment | order for Owen Finch (`new`, unpaid) |
| Finance | enquiry with retirement question | “Request sent” sheet | enquiry from Priya Raman (`new`) |
| Finance | first meeting booking | “Request sent” sheet | booking from Priya Raman (`requested`) |

The demo apps were run twice; the dashboard showed two bookings and two
enquiries for trades, two bookings for auto, two orders for the store, one order
for courses and one booking plus one enquiry for finance. Order totals are
computed server-side; the browser sends item keys and quantities only.

## 5. Owner dashboard

No new dashboard module was needed. The existing gated modules serve the new
trades: Orders and Products for the store and courses; Bookings for trades, auto
and finance; Enquiries for trades and finance; Customers across all five;
Offers where enabled. Status changes remain owner-driven (`new` → `confirmed` →
`done`, booking `requested` → `confirmed` → `completed`). The finance app's
disclosure is template copy and does not create a compliance record; course
enrolment creates an order but does not provision lesson access.

During QA the store's demo offer still promised “Free delivery over $60” while
checkout charged a flat $2.99. The offer copy was corrected in the vertical seed
and in the existing demo (catalogue API), and the shop seed's equivalent claim
was corrected too. A free-delivery threshold is **not** implemented.

## 6. Editor verification

`scripts/verify-batch3-editor.mjs` drove the real editor for the trades app with
an owner session:

- tapping a section inside the phone preview selected it in the layer list;
- editing the heading autosaved; the stored document contained the edit;
- undo restored the heading;
- adding a component from the library changed the document; undo removed it;
- a drag drop moved the third component above the second; undo restored order;
- hide persisted, the section disappeared from the published app, undo restored
  it;
- duplicate and delete changed the section count and returned it;
- version history listed saved versions and restored one.

The script PUT the baseline document back at the end. Editor and published app
read the same stored document, so no separate renderer was introduced.

## 7. Responsive and accessibility results

Twenty cells: five apps × 320/375/390/430, height 844, mobile emulation.

| Trade | 320 | 375 | 390 | 430 | Images / broken / missing alt |
| --- | --- | --- | --- | --- | --- |
| Trades | pass | pass | pass | pass | 13 / 0 / 0 |
| Auto | pass | pass | pass | pass | 10 / 0 / 0 |
| Online store | pass | pass | pass | pass | 19 / 0 / 0 |
| Courses | pass | pass | pass | pass | 10 / 0 / 0 |
| Finance | pass | pass | pass | pass | 8 / 0 / 0 |

A pass means `scrollWidth === innerWidth`, no loaded image with zero intrinsic
width, no unnamed interactive control, no clipped navigation label and no
sub-30px target. Two target findings were fixed rather than accepted: short
header links (“All 7”, “All services”) now have a 44px minimum, and the search
clear control grew from 24px to 40px. Course card actions are 38px. Captures are
`screenshots/batch3/<trade>-<width>.png`.

## 8. Checks

- `bun test` — **316 passed, 0 failed, 4,570 assertions**, 29 files.
- `bun run typecheck` — exit 0.
- `bun run build` — exit 0.
- Security probes: anonymous document read `401`; foreign-origin document write
  `403`; owner dashboard without a session `303` to owner login; another
  project's owner cookie `401`; the customer app remains publicly readable at
  its token URL.
- Document persistence rehearsal for all five apps: edit title and hide a
  section, confirm both in the published HTML, restore the original.
- Image library: 84 new WebP files (28 scenes × 3 widths), all served from the
  local Worker; the matrix found no broken image.

## 9. Files

| Area | Files |
| --- | --- |
| Document compositions | `src/worker/doc.ts` (27 new variants, five compositions, quote tab order) |
| Renderers and CSS | `src/worker/flagship.ts` (renderer cases, trade CSS, 320px overrides, target fixes) |
| Content | `src/worker/verticals.ts` (teams, quote notes, corrected delivery offers) |
| Photography metadata | `src/worker/flagshipImages.ts` |
| Shared app | `src/worker/app.ts` (course CTA wording), `src/worker/appCss.ts` (search clear target) |
| Images | `public/images/flagship/*.webp` (84 new files) |
| Tooling | `scripts/build-batch3-images.mjs`, `scripts/create-batch3-demos.mjs`, `scripts/check-batch3-matrix.mjs`, `scripts/capture-batch3.mjs`, `scripts/verify-batch3-docs.mjs`, `scripts/verify-batch3-editor.mjs`, `scripts/workflows-batch3.mjs` |
| Tests | `tests/flagship.test.ts`, `tests/flagshipImages.test.ts`, `tests/media.test.ts` |
| Evidence | `screenshots/batch3/` (20 captures), `.wrangler/qa-batch3/` (local QA records, not committed) |
| Records | `docs/TRADE_MIGRATION.md`, `docs/DESIGN.md`, `docs/EDITOR.md`, `docs/FUNCTIONAL_AUDIT.md`, `docs/PHOTOGRAPHY.md`, `docs/PRODUCT_READINESS.md`, this report |

## 10. Limitations and next milestone

Implemented and verified: the five compositions, photography, responsive
rendering, customer actions with D1 records, dashboard reads, editor operations,
document persistence and access control.

Implemented but deliberately limited: delivery is a flat $2.99 fee with no
threshold or tracking; loyalty stamps remain local device state; reviews remain
a local confirmation; orders are unpaid because no payment provider is
connected; notifications stay in the outbox with no provider.

Not implemented: route planning or engineer assignment (trades), vehicle
registration records and parts inventory (auto), stock levels and dispatch
tracking (store), lesson access, progress and certificates (courses), suitability
checks and regulated records (finance), and physical-device testing.

The ten generated photographs are sample imagery, not photographs of any real
business, and the finance copy is a disclosure template rather than regulated
advice. Owners must replace sample photography and have their own compliance
copy reviewed.

**Next milestone:** the remaining twelve trades, starting with `hospital`,
`marketplace`, `school`, `plants-indoor` and `agency`. Before that, the highest
value shared work is a free-delivery threshold stored on the spec, order status
lookup for guests, and course access provisioning, because the new journeys make
those gaps visible.

Code commit: recorded in the repository history for this batch.
