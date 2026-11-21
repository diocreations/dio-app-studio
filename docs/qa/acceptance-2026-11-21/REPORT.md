# Plattr — workflow gaps and reliability pass

Date: 2026-11-21. Local Worker, local D1/R2, no deployment, no crawl, no payment
activation, no paid AI activation.

## Result

| Check | Result |
| --- | --- |
| Automated tests | 680 pass, 0 fail (57 files) |
| Typecheck | pass (`tsc --noEmit`, worker config) |
| Production build | pass (`vite build` + postbuild) |
| Editability audit | pass, no uneditable page content |
| Saved-fixture browser acceptance | 15 applications, 0 failed, 0 console/network errors |
| Synthetic retail variants | 3 shop concepts, 15/15 checks each |
| Synthetic hotel occupancy | 10/10 checks |
| Editor acceptance | shop 16 checks + 3 catalogue checks; other four 16 + 1; 0 failures |

Reports: `browser-report.json`, `editor-report.json`,
`variants-occupancy.json`. Screenshots are regenerable captures and are kept
out of version control.

## What changed and how it was checked

### Hotel booking integrity
- A room persists `capacity` only when its saved record states it ("Sleeps 2",
  "max 2 guests", "up to 2 people", or an explicit numeric field). Capacity is
  not inferred from photographs or the trade's sample copy.
- Booking rejects a party above the room capacity (`422 party_exceeds_room`),
  validates both dates, rejects check-out on or before check-in, and derives
  nights and room total on the server. A client-supplied total/nights is
  ignored.
- Status remains `requested`. The confirmation says it is a request, not a
  confirmed reservation, and the form discloses: "No live availability is
  shown. This sends a request; the business confirms the room is free."
- Covered by automated tests (capacity parsing, occupancy rejection, forged
  total, past check-in) and the synthetic hotel browser flow.

### Professional services CTA
- Professional builds declare `detailAction: 'quote'`. The generated home and
  detail actions now read "Request a proposal" and open the proposal form;
  "Book an intro call" remains available but is no longer the primary action.
- A generated "Book a consultation" action is rewritten only when it matches
  the generated default; an owner-authored label/screen is preserved.
- Browser: all three professional concepts show "Request a proposal" on the
  detail page and (where a home action exists) on home; each submission appears
  in the dashboard's enquiries. Confirmation heading is "Request sent".

### Image editing completeness
- The editor draws a section Photograph panel only when the section actually
  renders section media (`image` blocks, `pro-intro`, and flagship variants
  that use an attachment).
- Catalogue-backed blocks (`shop-products`, `dine-feature`,
  `salon-services`, `hotel-cover`, `hotel-rooms`, etc.) instead show why the
  section image is not editable here and a control that opens the catalogue,
  where item and variant photographs are edited with their identity kept.
- Editor audit confirms: catalogue blocks have no section picker, show the
  hint, and open the catalogue; own-image blocks keep the picker. The shop
  image replacement still reaches preview and app, and undo restores it.

### Retail variants
- New isolated fixture `tests/fixtures/retail-variants.json` covers size and
  colour groups, valid combinations, per-combination prices, per-combination
  photographs, a sold-out combination and a sold-out option, missing
  combinations (four of six entered), and a legacy flat variant list.
- Browser check runs all three shop concepts against fresh synthetic builds
  with real uploaded WebP media. It verifies group rendering, option
  availability, image and price changes per combination, cart line/total,
  missing combinations staying unpriced and unaddable, and flat variants.
- A missing combination no longer silently changes another group's choice: the
  pending values stay visible, the price is blank and "Select options" is
  disabled until a real combination is chosen.

### API payload safety
- 4 MB applies only to `POST /api/projects` and `PUT` on the editor and
  dashboard catalogue writers. Every other API route keeps 256 KB.
- Hono's body limit rejects an oversized declared `Content-Length` before
  reading, and streams chunked bodies only up to the limit.
- JSON parsing and catalogue sanitisation remain. Explicit caps: 40 sections,
  2,000 items per section, 8 option groups, 20 options per group, 200 variants
  per item.
- Tests cover a 300 KB non-catalogue PUT (413), a >256 KB catalogue on both
  catalogue writers (200), malformed JSON (400), and the shape caps.

## Fixture provenance

- The fifteen saved applications use the existing Present & Correct retail
  fixture and the four saved trade-audit machine specs. They are unchanged.
- Retail variant and hotel occupancy checks use new synthetic fixtures created
  by `scripts/acceptance-variants.mjs`. They are not merged into the saved
  fixtures and are not source claims about any real business.
- No live site was crawled during this pass.

## Limitations

- No availability service exists. Hotel dates are a request; the business
  confirms the room, and the UI says so rather than claiming availability.
- No payment or paid AI path was activated or exercised.
- This pass verifies the local Worker and its saved/generated builds, not a
  deployed environment.
