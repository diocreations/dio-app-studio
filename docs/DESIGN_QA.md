# Unified flagship editor QA

Date: 18 November 2026. Browser: local Chromium preview. Server: the built Worker
on `127.0.0.1:8795`. The five builds use trade-seeded demo content; no review
copy, address, opening hours or photograph was invented beyond that seed.

## Current demo builds and captures

| Trade | App URL | Direct editor | 390px capture |
| --- | --- | --- | --- |
| Restaurant | `/p/d4289109b6208f25aea54489/app` | `/p/d4289109b6208f25aea54489/edit` | `docs/qa/unified-restaurant-390-final.png` |
| Retail | `/p/fed4e12fd62c1c8743388ce6/app` | `/p/fed4e12fd62c1c8743388ce6/edit` | `docs/qa/unified-shop-390-final.png` |
| Salon | `/p/3be68b4c168182a4d337fe67/app` | `/p/3be68b4c168182a4d337fe67/edit` | `docs/qa/unified-salon-390-final.png` |
| Hotel | `/p/7d634b5c033442c12bb45dbf/app` | `/p/7d634b5c033442c12bb45dbf/edit` | `docs/qa/unified-hotel-390-final.png` |
| Professional | `/p/05549927d25021c7f1321ad1/app` | `/p/05549927d25021c7f1321ad1/edit` | `docs/qa/unified-professional-390-final.png` |

The direct editor is captured at 390px in
`docs/qa/unified-editor-selection-390-final.png`: a tapped heading block is
outlined in the phone preview and the contextual dock exposes heading, words,
photo, move, duplicate, hide and delete.

## Browser acceptance

Every one of the five builds was exercised in the browser, not only in unit
tests. For each build the same flow was completed:

1. Tap a flagship block directly in the phone preview.
2. Change its heading through the contextual dock.
3. Upload and apply a new image.
4. Drag a second block above it and confirm the stored order changed.
5. Wait for autosave and reload the editor; the preview and API still held the
   edit.
6. Open the published `/app` URL and confirm the same heading, image and order.
7. Use undo, then restore the first saved document version.

| Trade | Selected block | Image applied | Drag order proved | Published app proved | Undo | Version restore |
| --- | --- | --- | --- | --- | --- | --- |
| Restaurant | `sec_fx_dine_title` | uploaded PNG → WebP variants | feature moved before title | changed heading + media render | yes | back to original title/order |
| Retail | `sec_fx_shop_title` | uploaded PNG → WebP variants | title moved before search | changed heading + media render | yes | back to `Things worth keeping.` |
| Salon | `sec_fx_salon_title` | uploaded PNG → WebP variants | dates moved before title | changed heading + media render | yes | back to original title/order |
| Hotel | `sec_fx_hotel_cover` | uploaded PNG → WebP variants | stay moved before cover | changed heading + media render | yes | back to `Salt House` |
| Professional | `sec_fx_pro_title` | uploaded PNG → WebP variants | intro moved before title | changed heading + media render | yes | back to `Northline Legal` |

Focal-point positioning was exercised on the restaurant heading: dragging the
focal dot from the centre to 30% / 70% stored `focalX: 30, focalY: 70` and the
published image emitted `object-position:30% 70%`. Duplication, visibility and
deletion were exercised on the restaurant build; each produced the expected
document node and the duplicate was removed again before the capture. Undo and
redo were exercised explicitly: redo re-applied a title edit and the following
undo removed it again, with the quick-edit fields resynchronised to the restored
document.

## Width checks

All five apps were loaded at each viewport. `documentElement.scrollWidth` and
`body.scrollWidth` equalled the viewport at every width; no horizontal page
overflow was found.

| Trade | 320px | 375px | 390px | 430px |
| --- | --- | --- | --- | --- |
| Restaurant | 320 / 320 | 375 / 375 | 390 / 390 | 430 / 430 |
| Retail | 320 / 320 | 375 / 375 | 390 / 390 | 430 / 430 |
| Salon | 320 / 320 | 375 / 375 | 390 / 390 | 430 / 430 |
| Hotel | 320 / 320 | 375 / 375 | 390 / 390 | 430 / 430 |
| Professional | 320 / 320 | 375 / 375 | 390 / 390 | 430 / 430 |

The editor toolbar was measured at 390px after its compact breakpoint:
viewport 390, document 390, toolbar 390, phone canvas 370. The version-history
button remains reachable at 320, 375, 390 and 430px. At 320px the brand label is
the only control removed; selection, undo/redo, photos, history, properties and
the catalogue remain available.

## Design review after the unification pass

The browser review caught three remaining composition problems, which were
fixed before the final captures:

- **Restaurant hours were repeated.** The compact lead already shows hours and
  address, so the lower `dine-facts` block was removed from newly generated
  flagship documents.
- **Salon booking action covered services.** The fixed, gradient-backed booking
  bar is now an inline action after the service list; the bottom Book tab remains
  the persistent route.
- **Professional enquiry action covered service rows.** The fixed action bar is
  now inline after the service index, so no service is hidden behind a CTA.

The other reviewed details held: retail exposes search first and a two-column
feed; hotel keeps the cinematic stay image and availability card; each flagship
retains its own navigation labels and trade journey. Fallback artwork is
deliberate abstract composition, never a letter pretending to be a product
photograph. The only non-product overlay in the PNG captures is the local
Freebuff browser badge at the top-left.

## Limits of this QA

- No automated visual-diff suite or physical-device touch test was performed in
  this slice. Lighthouse, keyboard and security results are in
  `docs/PRODUCT_READINESS.md`.
- The browser viewport was emulated in Chromium; iOS Safari and Android Chrome
  are not claimed as tested here.
- Published checks used the local Worker, not a production deployment.
- The remaining 22 trades still use their existing shells and are deliberately
  not migrated until this architecture is accepted.

## Visual Excellence & Content Intelligence pass

This pass replaced the geometric fallback in the five flagship compositions with
the local, responsive photo library documented in `docs/PHOTOGRAPHY.md`. The
compositions, navigation, business logic and document architecture were kept.

### Before and after

The previous captures are the before set; the new captures are the after set.

| Trade | Before | After |
| --- | --- | --- |
| Restaurant | `docs/qa/unified-restaurant-390-final.png` | `docs/qa/imagery-restaurant-390.png` |
| Retail | `docs/qa/unified-shop-390-final.png` | `docs/qa/imagery-shop-390.png` |
| Salon | `docs/qa/unified-salon-390-final.png` | `docs/qa/imagery-salon-390.png` |
| Hotel | `docs/qa/unified-hotel-390-final.png` | `docs/qa/imagery-hotel-390.png` |
| Professional | `docs/qa/unified-professional-390-final.png` | `docs/qa/imagery-professional-390.png` |
| Editor | `docs/qa/unified-editor-selection-390-final.png` | `docs/qa/imagery-editor-selection-390.png` |

Captures use a 390 × 800 CSS viewport at 2× (780 × 1600 files). The professional
after capture uses a new accounting build, because the previous demo project was
named “Northline Legal” while carrying accounting content.
`docs/qa/imagery-professional-team-390.png` is a taller 390 × 1300 capture that
shows the sample team portraits, services and fees below the first screen.

### Image loading and uniqueness

- Every flagship home and catalogue/detail image is a local WebP with 320, 640
  and 1280 `srcset` candidates, width/height, a descriptive alt and lazy loading.
- Restaurant menu items, retail products, salon services, hotel rooms and
  professional services map to distinct scenes. The home feature and the same
  product's catalogue card may share that product's scene, by design.
- The 20 app loads in the width matrix reported `broken: []`: no failed images.
- Salon now shows a manicure image for “Gel manicure” rather than reusing a
  treatment photo; retail’s furniture range now has chair and stool photographs;
  restaurant’s drinks item has a cocktail photograph.

### Responsive checks

Measured in headless Chromium with device metrics emulation, at 390px width for
captures and 320/375/390/430 for the matrix. Values are
`documentElement.scrollWidth / innerWidth`; no page had overflow.

| Trade | 320px | 375px | 390px | 430px | Loaded images | Broken |
| --- | --- | --- | --- | --- | --- | --- |
| Restaurant | 320 / 320 | 375 / 375 | 390 / 390 | 430 / 430 | 1 | 0 |
| Retail | 320 / 320 | 375 / 375 | 390 / 390 | 430 / 430 | 11 | 0 |
| Salon | 320 / 320 | 375 / 375 | 390 / 390 | 430 / 430 | 4 | 0 |
| Hotel | 320 / 320 | 375 / 375 | 390 / 390 | 430 / 430 | 4 | 0 |
| Professional | 320 / 320 | 375 / 375 | 390 / 390 | 430 / 430 | 3 | 0 |

The horizontal menu/collection rails intentionally contain chips beyond the
viewport edge; they scroll inside their own rail and do not contribute to page
scroll width. Bottom navigation ends at least 18px inside every viewport.
At 320px the flagship app bar tightens its icon buttons to 38px and its side
padding to 12px, so the longest brand (“Aster & Rye”) and four actions do not
collide; the same rule keeps the 300px-wide editor canvas header clear.

The editor was measured at all four widths with a flagship action selected. Its
document width equalled the viewport at 320, 375, 390 and 430. At 390 the top
bar, stage and canvas were all 390, the phone canvas 370 and the quick-edit dock
374, all inside the viewport. The dock exposes heading, words, button label,
button destination, background swatches, text colour, photo, reorder, duplicate,
hide/delete and More. Catalogue-backed blocks also expose “Items & prices”.

### Editing and persistence checks

- Changed the restaurant action label to “Book a table”, changed its destination
  to Reserve, and applied the sand background through the quick dock. All three
  persisted through autosave; after a full app reload the button still read
  “Book a table”, targeted `book`, and the section computed `rgb(239, 231, 219)`.
  The original document was restored after the test.
- Selected the retail products block and confirmed “Items & prices” appears and
  opens the catalogue path. Product names, descriptions, prices and offers remain
  owned by that catalogue editor.
- Uploaded a 1280 × 960 WebP through the media API, selected the restaurant
  featured-dish block, applied the photo from the editor library, and confirmed
  the published app used `/p/<token>/media/<id>/640.webp` at 58,500 bytes with
  `image/webp`. The QA photo was then removed and the original doc restored.
- The editor now shows a sample-content strip with “Items & prices” and “Details”
  shortcuts when any menu, contact, story, offer or team field came from trade
  defaults. Imported owner fields are not labelled sample.

### Business flow checks

- **Checkout:** added a Stoneware mug, opened the bag, selected Pickup, entered a
  QA name and email, and placed the order. The confirmation showed Order #5571,
  the bag cleared, and the order persisted in D1 with total $28.
- **Booking:** requested a restaurant table for 2 at 18:30 through the Reserve
  screen. The confirmation showed “Request sent” and the booking persisted as
  `requested` in D1.
- **Enquiry:** sent a professional-services proposal request through Enquire. The
  confirmation named the sender and address, and the enquiry persisted as `new`.

### Remaining limitations

- The other 22 trades still use generated artwork. This pass deliberately covers
  only the five accepted flagship trades.
- Stock scenes are samples, not the owner’s dishes, products, rooms or team. The
  content can be replaced, but a product card’s photograph is still the block’s
  assigned stock scene or a block-level owner upload, not a per-card image picker.
  Prices and copy are edited in the catalogue; per-card photo assignment remains
  the element-level editor work described in `docs/EDITOR.md`.
- No AI image generation is connected. The library is licensed Unsplash
  photography downloaded locally; the source IDs and licence are in
  `docs/PHOTOGRAPHY.md`.
- Browser QA used emulated Chromium viewports. iOS Safari, Android Chrome,
  physical touch targets and screen-reader traversal were not tested.
- Published checks used the local Vite/Worker app, not a production deployment.
  Nothing was deployed.
