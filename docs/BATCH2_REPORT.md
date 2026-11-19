# Migration batch 2 — café, gym, clinic, property, studio

November 2026. Local Worker on `127.0.0.1:8795`, local Chromium/Automation
viewports. Nothing was deployed to production.

This batch migrates five trades onto the existing `kind: 'flagship'` document
blocks. It does not add a second renderer: from café to studio, the saved
`DocNode` list decides order, copy, visibility, images and destinations, and the
trade variant decides the markup. The five approved trades (restaurant, retail,
salon, hotel, professional) and their documents were left alone.

## Compositions

| Trade | Document composition | Visual identity | Business surface |
| --- | --- | --- | --- |
| Café | `cafe-hero`, `cafe-menu`, `cafe-order`, `cafe-reserve` | warm cream editorial, rust accent, asymmetric food window | 3 category groups / 7 menu items, photo rows, takeaway cart, table request, two offers |
| Gym | `gym-hero`, `gym-plans`, `gym-timetable`, `gym-trainers`, `gym-join` | near-black industrial grid, acid green, condensed uppercase | 3 membership plans, 3 classes, 3 coaches, class booking, membership enquiry |
| Clinic | `clinic-hero`, `clinic-specialities`, `clinic-doctors`, `clinic-care`, `clinic-privacy`, `clinic-appointments` | white clinical surface, blue rule, soft rounded cards | 6 treatments in 3 specialities, 3 clinicians, appointment request, non-clinical patient enquiry |
| Property | `property-hero`, `property-search`, `property-listings`, `property-viewing`, `property-enquire` | ivory listings sheet, editorial serif, forest green, property rail | 4 live listings with price/location/bed facts, For sale / To rent filters, gallery, viewing booking, valuation enquiry |
| Studio | `studio-hero`, `studio-work`, `studio-services`, `studio-team`, `studio-book` | oversized black serif, contact-sheet grid, hairline rules | portfolio, 5+ packages, 3 team profiles, call booking, shoot brief |

The navigation labels are trade-specific too: Café / Menu / Reserve / Visit;
Train / Plans / Classes / Visit / Join; Care / Services / Book / Visit / Enquire;
Homes / Listings / Viewings / Visit / Enquire; Work / Services / Book / Visit /
Enquire. These are document screens, not hard-coded customer routes, so owners
can reorder or hide sections in the editor.

## Workflow evidence

Every request below was written to D1 through the real public API and then read
back from the authenticated dashboard. `requested` / `new` are the initial
states; no status transitions were invented for QA.

| Trade | Workflow | Stored record | Dashboard result |
| --- | --- | --- | --- |
| Café | Takeaway flat white, pickup, $4.20, browser checkout | `ord_7cad2d7b242f926f0c` (#6368), `new`, `unpaid` | 2 orders, 2 bookings |
| Café | Table for 2, 19 Nov 09:30, browser booking form | `bkg_6ac39f8a377265ec92` (#5052), `requested` | above |
| Café | Earlier API order `ord_4bec9f41db04bdbe1b` $8.40 | `new` | above |
| Gym | Barbell club, 20 Nov 18:30, coach Ada Okafor | `bkg_88c77e4e4296ef8d90` (#6878), `requested` | 1 booking, 1 enquiry |
| Gym | Membership enquiry | `enq_2b5a348128ebdb5b4e`, `new` | above |
| Clinic | New patient exam, 20 Nov 10:00, Dr Amara Osei | `bkg_2fad48b8cfaa7a5976` (#4592), `requested` | 1 booking, 1 enquiry |
| Clinic | Patient contact request (no medical details) | `enq_60840d258e76b03f35`, `new` | above |
| Property | Viewing, Kestrel Square, 20 Nov 10:00, 2 viewers | `bkg_b716e6b9d5a60255e2` (#4314), `requested` | 1 booking, 1 enquiry |
| Property | Valuation enquiry | `enq_20f23bb2c85bd361b9`, `new` | above |
| Studio | Full-day booking, 20 Nov 10:00, 2 people | `bkg_5b6ef430b96119c5dc` (#1062), `requested` | 1 booking, 1 enquiry |
| Studio | Half-day product shoot brief | `enq_0e103d18bb846f3442`, `new` | above |

The café order and table request were also driven through the rendered UI, not
only curl: adding an item, opening the cart, placing the order and submitting
the reservation each produced the confirmation sheet and a dashboard row. The
property filter shortcut was clicked in the browser and observed to open the
catalogue with only the For sale section visible and the matching chip active.

## Editing and persistence

`node scripts/verify-batch2-docs.mjs` ran against all five apps. For each it:

1. read the saved document through the owner API;
2. saved the clean document as a baseline version;
3. changed the first home section title and hid the second section;
4. confirmed the new title rendered and the hidden section did not;
5. restored the original document and confirmed the title, section and
   visibility were clean again.

Result: 5/5 passed. The docs are restored to their seeded state.

The shared editor still owns: per-item photo and alt text, crop/fit, headings,
body copy, button labels and destinations, catalogue items and prices, contact
fields, brand colour and logo initials, navigation labels, section order and
visibility, autosave and document version restore. `tests/media.test.ts` proves
all ten flagship trades render an owner item photo with its own alt text and
focal point. `tests/flagship.test.ts` proves a saved document controls order,
copy, hiding and imagery, and that the dashboard can replace doctor/coach
profile cards (`name | role | credential`) without a rebuild. It also relabels
and retargets a call to action on all five batch-2 apps and checks the rendered
block follows the new label and destination.

## Responsive and asset checks

The acceptance set is 20 PNGs at exact CSS viewports (844px tall, DPR 1):
`screenshots/batch2/{cafe,gym,clinic,property,studio}-{320,375,390,430}.png`.

`node scripts/check-batch2-matrix.mjs` loaded all 20 cells and checked:

- `documentElement.scrollWidth === innerWidth` in every cell;
- no completed image with zero natural width (lazy below-fold images excluded);
- no missing `alt` attributes;
- no clipped bottom-navigation label;
- no unlabelled button or link in the header, main or tab bar.

All 20 cells passed. A separate sweep resolved 85 distinct image URL references
across the five apps; all returned `200 image/webp`.

The first matrix run exposed two gym images still loading below the fold; they
were treated as a lazy-load timing signal, not a broken asset, and were verified
with a direct 200 and by inspecting the loaded nodes. The 320px studio headline
and clinic “Services” tab were tightened after visual review, then all 20
screenshots were recaptured.

## Regression

- `bun test` — 315 passed, 0 failed, 29 files, 4,178 assertions.
- `bun run typecheck` — exit 0 (`tsc --noEmit` and worker config).
- `bun run build` — exit 0 (worker and client bundles).
- Latest automated additions: profile-card dashboard edit, CTA relabel/retarget,
  the ten-trade item photo matrix, and batch-2 composition/workflow markers.

## Security and patient data

The existing controls were kept, not relaxed:

- owner document API and dashboard without a session: `401`;
- app-settings with a foreign `Origin`: `403`;
- another project's owner cookie on this dashboard: `401`;
- `/p/:token/dashboard` without an owner session redirects to the owner login
  (`303`), while the customer app token still renders the public app;
- customer and owner APIs remain separate.

Clinic specifics: the appointment form collects name, contact, date, time and
treatment only. The enquiry form asks “What would you like to arrange?” and
carries visible copy: “Please do not include medical details… a clinician will
discuss your health privately.” No symptoms, diagnoses, insurance or clinical
notes field was added. The dashboard remains owner-session protected.

This is not a claim of HIPAA/GDPR certification. The deployment still has one
shared owner key per project rather than named accounts and roles, so the
activity log cannot identify which staff member viewed a patient enquiry.

## Operational readiness

Still outstanding, and intentionally not claimed as done:

- named owner accounts and staff roles (shared owner key only);
- scheduled offsite database/media backups in a provider account (local
  restore rehearsal exists in `docs/BACKUP.md`);
- external error monitoring/alerting;
- physical iOS Safari and Android Chrome runs, and screen-reader testing;
- production deployment, DNS/TLS and a live rollback drill.

## Limitations

- The five apps were exercised at four mobile widths in Chromium only; tablet
  and desktop layouts were not part of this acceptance pass.
- Subscription-ready means the gym can take membership enquiries and class
  bookings and its plan data is document-backed; recurring billing, member
  accounts and plan self-service are not implemented.
- Property search is category filtering plus the catalogue search endpoint; it
  is not a map, saved-search or mortgage/affordability tool.
- Clinic enquiries are intentionally contact-only. There is no patient portal,
  clinical record, document upload or appointment rescheduling flow.
- Screenshots show the first viewport of each home screen, not every detail,
  booking or checkout screen.
- The 17 remaining trades were not started. See `docs/TRADE_MIGRATION.md`.

## Screenshot index

| 320 | 375 | 390 | 430 |
| --- | --- | --- | --- |
| `screenshots/batch2/cafe-320.png` | `cafe-375.png` | `cafe-390.png` | `cafe-430.png` |
| `screenshots/batch2/gym-320.png` | `gym-375.png` | `gym-390.png` | `gym-430.png` |
| `screenshots/batch2/clinic-320.png` | `clinic-375.png` | `clinic-390.png` | `clinic-430.png` |
| `screenshots/batch2/property-320.png` | `property-375.png` | `property-390.png` | `property-430.png` |
| `screenshots/batch2/studio-320.png` | `studio-375.png` | `studio-390.png` | `studio-430.png` |
