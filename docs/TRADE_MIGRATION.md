# Trade migration audit

Fifteen trades now use a flagship composition: restaurant, retail (`shop`),
salon, hotel and professional in the first wave, café, gym, clinic, property and
studio in batch 2 (`docs/BATCH2_REPORT.md`), and trades, auto, ecommerce,
courses and finance in batch 3 (`docs/BATCH3_REPORT.md`). Twelve trades still
use the generic app shell and `docFromSpec` document. The table below is the
original audit, kept as the gap analysis that drove batches 2 and 3; its
café-to-studio and trades/auto/ecommerce/courses/finance rows have been
delivered.

## Audit

Features come from `src/worker/verticals.ts`; counts are the seeded catalogue
sizes. The generic document gives every trade a home, catalogue, detail, booking
or quote screen where the feature exists, and a More screen. None of these
trades has a dedicated flagship composition yet.

| Trade | Features | Menu sections / items | Special business function | Document shape | Gap |
| --- | --- | --- | --- | --- | --- |
| `cafe` | catalog, ordering, loyalty, offers, reviews | 3 / 7 | pickup ordering, loyalty | generic home + catalogue + checkout | no dedicated food composition; no booking (by design) |
| `gym` | catalog, classes, booking, loyalty, offers, reviews | 2 / 5 | classes, timetable, coach booking | generic home + catalogue + booking | timetable is a spec field, not a document block; no quote |
| `clinic` | catalog, booking, quote, reviews, gallery | 3 / 6 | appointment + clinical enquiry | generic home + catalogue + booking + quote | no clinician/room composition; quote and booking live as separate screens |
| `trades` | catalog, quote, booking, reviews, gallery, offers | 3 / 5 | job request + site visit | generic home + catalogue + quote | no service-area/visit block; booking is secondary |
| `property` | catalog, quote, booking, gallery, reviews, offers | 2 / 4 | listing enquiry + viewing | generic home + catalogue + detail + quote | no listing map, floor area or viewing slot block |
| `studio` | catalog, quote, gallery, reviews, booking | 3 / 5 | project brief + call | generic home + catalogue + quote | no case-study/reel composition |
| `auto` | catalog, booking, quote, reviews, offers | 2 / 6 | service booking + repair quote | generic home + catalogue + booking + quote | no vehicle/registration fields |
| `hospital` | catalog, booking, offers, reviews, quote | 2 / 5 | department booking + enquiry | generic home + catalogue + booking + quote | no department/ward navigation |
| `ecommerce` | catalog, ordering, delivery, offers, reviews, loyalty | 3 / 7 | delivery checkout | generic shop-like home | no dedicated fulfilment/delivery composition |
| `plants-indoor` | catalog, ordering, offers, reviews, gallery | 3 / 7 | plant care + delivery | generic catalogue + checkout | no care attributes or light/water filters |
| `plants-outdoor` | catalog, ordering, offers, booking, gallery | 3 / 7 | garden centre + advice visit | generic catalogue + booking | no seasonal stock or visit slot |
| `courses` | catalog, ordering, offers, reviews, loyalty | 3 / 6 | course purchase, lesson access | generic catalogue + checkout | no lesson/progress structure |
| `tuition` | catalog, booking, offers, reviews | 3 / 6 | tutor booking | generic booking | no subject/level or tutor matching |
| `school` | catalog, booking, classes, events, offers, gallery | 2 / 5 | term dates, classes, events | generic home + booking + events | no term/calendar block |
| `kindergarten` | catalog, booking, offers, gallery, reviews | 2 / 5 | open-day booking | generic booking | no age-group/room structure |
| `finance` | catalog, quote, booking, reviews, offers | 3 / 6 | regulated enquiry + meeting | generic quote + booking | no disclosure/eligibility block |
| `agency` | catalog, quote, reviews, gallery, offers | 3 / 6 | proposal request, case studies | generic quote | no case-study grid or team proof block |
| `influencer` | catalog, quote, gallery, reviews, offers, events | 2 / 5 | brand collaboration brief | generic quote + gallery | no media-kit/audience block |
| `portfolio` | catalog, quote, gallery, reviews | 3 / 5 | project enquiry | generic quote + gallery | no project narrative composition |
| `film` | catalog, booking, gallery, reviews, offers | 3 / 8 | screening/booking, trailer | generic booking + gallery | trailer is a spec field, not a block |
| `gallery` | catalog, booking, events, gallery | 3 / 6 | exhibition/event booking | generic booking + events | no exhibition/artist structure |
| `marketplace` | catalog, ordering, delivery, offers, loyalty, gallery | 4 / 7 | multi-vendor checkout | generic catalogue + checkout | no vendor/store scoping in the customer shell |

## Shared migration strategy

1. Add a `flagship` variant set and a `flagshipDocFromSpec` branch per trade,
   exactly like the five approved trades. The spec stays the source of truth for
   catalogue, prices, features and contact.
2. Keep the existing generic document for every live project. A new composition
   is only used when the document already contains the trade's flagship nodes,
   or when the owner explicitly opts in. This avoids silently replacing an
   owner's layout.
3. Reuse the existing block vocabulary (`dine-*`, `shop-*`, `salon-*`,
   `hotel-*`, `pro-*`) where it fits, and add only the small trade-specific
   blocks needed for the gaps above.
4. Preserve feature gates. A gym without ordering must not gain a cart; a
   property app without booking must not expose dates. The tests for disabled
   trades stay the contract.
5. Migrate test data first: create a parallel fixture project for the trade,
   render all screens at 320/375/390/430, then switch the demo. Production
   projects are never rewritten by a deploy.

## Batch 2 — delivered

Selected for distinct journeys and coverage of the remaining shell patterns.
All five are now flagship trades; their compositions and acceptance evidence
are in `docs/BATCH2_REPORT.md`.

| Delivered | Why first | Blocks added | Reuses |
| --- | --- | --- | --- |
| `cafe` | highest overlap with restaurant, but pickup/loyalty instead of table booking | cafe menu, pickup time, loyalty card | item media, catalogue, checkout, offers |
| `gym` | classes/timetable is a different booking model | timetable, class detail, coach, membership | booking, staff, item media |
| `clinic` | regulated booking + enquiry is the most common professional lead | practitioner, appointment types, privacy note | booking, quote, team |
| `property` | listing media + viewing request is the strongest gallery/enquiry case | listing card, floor facts, viewing request | item media, quote, gallery |
| `studio` | case-study/reel composition covers creative proof | case-study grid, reel, project brief | quote, gallery, team |

These five cover ordering (cafe), booking with a schedule (gym), booking with
regulated enquiry (clinic), listing enquiry (property) and quote-led creative
work (studio). The remaining seventeen trades follow the same pattern in later
waves, after this batch is accepted.

## Batch 3 — delivered

Selected for five different customer journeys rather than five similar
catalogues: an emergency call-out, a workshop booking, a delivered checkout, a
course enrolment and a regulated advice meeting. All five use the same document
model and shared cart/booking/enquiry records as the first ten.

| Delivered | Why selected | Blocks added | Reuses |
| --- | --- | --- | --- |
| `trades` | highest-intent local service: quote plus call-out booking | job ticket hero, service index, promise, coverage, photo strip | quote, booking, item media, offers |
| `auto` | workshop job card and diagnostics, not a shop | plate hero, vehicle types, job card, available slots, promise | booking, quote, item media |
| `ecommerce` | fulfilment-led storefront (delivery/pickup, loyalty) | drop feed, shelf grid, delivery panel, rewards | ordering, delivery, loyalty, offers |
| `courses` | paid enrolment with a learning path rather than stock | workshop hero, path nodes, course cards, included panel | ordering, item media, offers |
| `finance` | regulated, fee-only advice with a disclosure requirement | advisory masthead, fee disclosure, service index, adviser list | quote, booking, team |

Journeys verified end to end (real D1 rows, read back in the owner dashboard):
trades and finance quote + booking, auto booking, ecommerce cart + checkout,
courses detail + enrolment checkout. Evidence and viewport results are in
`docs/BATCH3_REPORT.md`.

### Remaining twelve

`hospital`, `plants-indoor`, `plants-outdoor`, `tuition`, `school`,
`kindergarten`, `agency`, `influencer`, `portfolio`, `film`, `gallery`,
`marketplace`. The suggested next five, chosen for journey breadth, are
`hospital` (department booking), `marketplace` (multi-vendor checkout),
`school` (term/events), `plants-indoor` (care attributes and filters) and
`agency` (case-study proof).

## Compatibility gates before each migration

- All five current flagship tests and the width matrix still pass.
- Customer token cannot open dashboard or edit routes.
- Existing orders/bookings/enquiries remain readable and status transitions
  unchanged.
- `sampleContent` flags survive; migration must not reset owner content.
- No new top-level dependency; no worker-only API used in the browser bundle.
- Document rollback: previous doc version still restores after the new blocks
  are introduced.
