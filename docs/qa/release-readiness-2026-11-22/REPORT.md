# Plattr — Release Readiness and End-to-End Product Experience Audit

**Date:** 22 November 2026  
**Scope:** complete business-owner journey, visual editor completeness, all 15 generated concepts, responsive/PWA behaviour, and production readiness without deployment.  
**Evidence:** `docs/qa/release-readiness-2026-11-22/` (this run), with the earlier lifecycle/authentication, benchmark and acceptance reports preserved unchanged.

## Verdict

**Not ready for public production release.**

**Conditionally ready for a small, invited, owner-supervised pilot** covering shop, restaurant, salon and professional-service businesses, with no live payments and no hotel in the pilot. The owner must review and replace generated content and photographs before showing the app to customers.

No P0 defect remains in the tested owner edit → save → reload → fresh-login → customer-preview path for those four trade groups. Two P0 gates remain outside that path:

1. **Hotels:** a room can be added to the order cart without stay dates, and the separate date form does not carry the selected room. This is a booking-flow defect, not a cosmetic one. Exclude hotels from the pilot until fixed.
2. **Production operations:** there is no production D1/R2, no running offsite backup or watchdog, no production deployment verification and no rehearsed production rollback. Local tests cannot substitute for those launch controls.

The three-concept promise is also weaker than it appears: several businesses receive two structural concepts plus a palette/type variation, not three independently composed concepts. That is a product-quality blocker for a public launch, not a reason to block a controlled pilot where the owner can choose between the strongest two.

## Verification run

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript | **clean** — `tsc --noEmit` and worker config, exit 0 | terminal run, 22 Nov 2026 |
| Full test suite | **745/745 passing** across 61 files | `bun test` |
| Owner journey | **46/46**, 0 failures | `owner-journey.json`, screenshots `01`–`14` |
| Catalogue/editor focused | **8/8** | `catalogue-editor.json` |
| PWA/offline/back | **16/16** | `pwa.json`, `pwa-offline.png` |
| Visual captures | **105** screenshots, no network or console errors | `concepts/visual.json`, `concepts/` |
| Hotel trade check | UI/code inspection completed | `hotel-trade.json` |
| Live crawl / paid AI / payments / deploy / commit | **not performed** | scope control |

The previous lifecycle/authentication audit remains accepted: 22/22 live auth, 106 import assertions, 526/526 previous acceptance, 13/13 browser conflict UI, 744/744 prior full suite, typecheck clean. The new suite count is 745 because this audit added one PWA/service-worker regression assertion.

## Fixes made during this audit

These were concrete defects found while exercising the owner flow, not redesign work.

| Fix | Why it mattered | Verification |
| --- | --- | --- |
| Guarded the inspector for action-only blocks (`bindInspector`) | Selecting a button-only block threw `Cannot read properties of null (reading 'addEventListener')` and left the editor unusable. | Journey checks 23–24; button label and destination exposed; no exception. |
| Corrected PWA `start_url`/scope and shell entry | An installed app opened the owner build page instead of the customer app; the service worker shell cached the wrong URL. | PWA checks; manifest uses `/p/<token>/app`, scope `/p/<token>/`; worker shell starts at the customer app. |
| Reset stale `variantTarget` when opening the catalogue | After saving a base price, the variant panel could not be reopened on the first click. | Catalogue check “variant panel can be reopened after a base-price save”; variant price save verified. |
| Prevented the service worker caching live order/booking status reads | A cached “received” response could hide a later “ready” status indefinitely. | Service-worker source assertion in `tests/private.test.ts`; PWA 16/16 after the change. |

No decorative or non-functional controls were added. No historical QA evidence or benchmark app was edited.

---

## 1. Complete owner journey

The journey used the saved Yarmouth crawl as the `/api/import` fixture plus one deterministic price-conflict fixture. It used a real owner key from `.dev.vars`; the key is not reproduced in this report. It did not crawl the live web.

| Stage | Result | What actually happened |
| --- | --- | --- |
| 1. Owner opens Plattr | Pass | Landing page renders at 390 with no horizontal overflow. |
| 2. Enters a business URL / describes it | Pass | Brief opens on its first step. |
| 3. Discovery processes evidence | Pass | Saved read fills the brief; the UI labels it as saved evidence, not a fresh crawl. |
| 4. Price conflict | Pass | Both readings are shown; owner chooses the page reading and confirms it. |
| 5. Three concepts | Pass mechanically, **weak substantively** | Three previews are returned and their frames differ. Visual review found that several are palette/surface variants rather than three independent architectures (section 3). |
| 6. Reviews information and catalogue | Pass | Review names source/evidence, lists missing or unconfirmed information and lists catalogue rows. |
| 7. Resolves missing/conflicting information | Pass | Missing business information is editable in dashboard settings; conflict resolution works. |
| 8. Selects a concept | Pass | Selection is saved to the build. |
| 9. Opens the visual editor | Pass | Live preview, screen/component structure and inspector load. |
| 10. Edits text, image, background, visibility and navigation | Pass for exercised controls | Heading, inline element text, action label/target, photo upload/apply, block background, block visibility, new navigation screen/nav entry all saved. Other layout controls were inspected but not each exercised (section 2). |
| 11. Saves and exits | Pass | Autosave and catalogue save both persist. |
| 12. Returns in a fresh session | Pass | Logout → owner login → the edited document survives. |
| 13. Previews the customer app | Pass | Edited heading, photograph, navigation and catalogue appear in `/p/<token>/app`; no horizontal overflow at 1280. |
| 14. Local/staging-only publish simulation | Pass as a local approval only | Owner can approve the build locally; status shows approved. **No hosting deployment or production publish was attempted.** |

### Confusing interactions and unnecessary inputs

- **The build page does not name the selected concept.** It shows the trade shape and build version, but not the direction the owner chose. The owner must remember which of three previews they selected (`owner-journey.json` note).
- **Base price is ambiguous on a variant product.** The catalogue row shows `210.00` while the selected variant shows `5.00`, and the customer card shows the cheapest variant. The row field is a base/starting value, but the editor does not label it as such. The test deliberately changed the base to `99.99` and confirmed the customer still received the variant value; this is correct data behaviour but a confusing control.
- **The price conflict is handled clearly.** Showing both readings and asking for a choice is the right pattern.
- **No data was lost** across save, reload or fresh login in the exercised path.
- **No real external publish** exists in this local flow; “approved” is not “deployed”.

The journey app token for this run was `016a48c6dcfc967170066e94`. It was approved locally, not published.

---

## 2. Visual editor completeness

### Coverage matrix

| Area | Control present | Exercised in this audit | Result / limitation |
| --- | --- | --- | --- |
| Headings and body copy | Block heading/words; inline element text | Yes | Both save and render. |
| Buttons, labels, links | Block button label and target; element action | Yes for action-only block | Label and destination render; no crash. |
| Images | Upload, library, apply to block; crop/focal controls | Upload/apply yes; crop/focal inspected only | Uploaded WebP is served by the customer app. Crop/focal, aspect, fit and replacement flows not each exercised. |
| Backgrounds and colours | Block background swatches; global design colours | Background yes; palette controls inspected | Background saves. Per-element colour/typography controls were not exhaustively exercised. |
| Spacing and layout | Alignment, padding, corners, move-to-screen, duplicate/delete/reorder | Partly | Controls exist; only background/visibility were exercised end-to-end. |
| Product/service cards | Catalogue rows; name, description, price, options, media, availability | Rows and prices yes | Catalogue editor opens 74 rows for the fixture. Not every field was edited. |
| Variants and prices | Variant panel, per-variant price, base row price | Yes | Base and variant saves both reach the saved catalogue; app data receives the new variant price. The base field is ambiguously labelled. |
| Navigation labels, icons, destinations | Screen name, bottom-nav inclusion, icon, element/button destinations | Name/nav inclusion/destination yes; icon partly | New screen named and added to bottom nav; customer app reflects it. Icon choices were inspected, not each saved. |
| Screen visibility and order | Show/hide, move earlier/later, initial screen | Visibility yes; order inspected | Visibility saves. Screen ordering controls exist but were not exercised end-to-end. Built-in screens intentionally cannot be hidden. |
| Business information | Dashboard settings, review prompts | Yes | Missing business information is editable; source and missing information are visible. |
| Portfolio and editorial | Generic editorial blocks; portfolio blocks for portfolio/studio verticals | Not in the five benchmark businesses | No portfolio-vertical benchmark app was available. Editorial hero/photo-grid blocks were inspected; portfolio content lifecycle was not exercised. |
| Trade-specific content | Catalogue/settings-derived copy and actions | Partly | Shop/restaurant/salon/professional surfaces were inspected. Hotel exposed a real flow gap (section 6). |

### Visible content the owner cannot edit

These are hard-coded product labels and system copy, not tenant data:

- **“Add to order”** and the order/booking CTAs are generated from the trade/feature model, not owner-editable labels. This is the direct cause of the hotel mismatch.
- **Tax/accessibility copy** such as “Rates include tax. Tell the team about access needs before you arrive.” and the salon/professional equivalents.
- **Recommendation and empty-state copy**, including “You might also like”, “Nothing here yet…”, and the confirmation wording.
- **Listing language** such as “Your viewing agent” and “Visit store”.
- **The brand mark/wordmark** is generated from the business name/logo in settings rather than edited directly; that is acceptable, but it means the logo and name are the only route.

Some of this copy is appropriate as a product default. It becomes a problem where it contradicts the trade (hotel) or where an owner reasonably expects to change a customer-facing label.

### Dead or misleading controls

- No dead control was found in the exercised paths after the action-only fix.
- The base-price field is **misleading**, not dead: it saves, but it is not the selected variant’s customer-facing price.
- Moving/reordering screens, icon selection, crop/focal controls and element link destinations were inspected but not each exercised; they are **not** claimed as fully verified.
- No setting tested was lost after save, reload or a fresh login.

**Conclusion:** the editor is materially complete for the composition-level owner workflow. It is not yet a proof that every visible pixel has an owner control. The hard-coded trade CTA and the unlabelled base-price field are the two clearest control-model defects.

---

## 3. Three generated concepts × five businesses

### Evidence and a necessary caveat

The 15 apps are the saved benchmark apps from `.chrome-qa/generation-benchmark-apps-audit.json`. Their content is **contaminated by the historical persistence audit**, which repeatedly appended `Owner-confirmed detail.` to descriptions. That repeated copy is a test artifact, not a Plattr rendering defect; the historical evidence has not been altered. Missing photographs and empty hero surfaces are still valid visual findings because the apps currently render that way and the owner would see them.

Each concept was captured at 390×844 for home/catalogue/detail and at 320/430/768/1280 for home. Individual screenshots are authoritative. The generated contact sheets have a crop/blank-rendering artifact; do not use the sheets to judge fine layout.

### Yarmouth Oilskins (shop)

| Concept | Home / IA | Catalogue and detail | Journey, trade and mobile | Genuine difference? |
| --- | --- | --- | --- | --- |
| **Minimal** | Opens on catalogue; title-led, dense product utility; top icon controls; no bottom nav. | 74-item catalogue; 66 items on first page; variant options and “From £5”; detail is a retail product page. | Fast scanning and direct add-to-bag. Filter chips run to the viewport edge with no clear horizontal-scroll affordance. At 1280 it stays a centred single column. | **Yes.** Commerce-first architecture. |
| **Editorial** | Photo-led “New in” feed; product images carry the page; minimal copy and icon-only actions. | Catalogue is a two-column editorial grid; detail is image-forward retail. | Strong merchandising and brand mood. Relies almost entirely on photography; the first packshot is a Gift Card. | **Yes.** Feed/editorial architecture. |
| **Lifestyle** | Brand heading plus rounded white product cards on a warm ground; “New in” section. | Grid catalogue; circular-image detail band on some products. | Warm, premium lifestyle feel; more brand introduction than Minimal. Some circular/thumbnail clipping is visible in the automated metrics. | **Yes.** Card-led lifestyle architecture. |

**Verdict:** the strongest genuinely three-direction set. Content quality is mostly limited by the contaminated descriptions, not the concepts.

### Padella (restaurant)

| Concept | Home / IA | Catalogue and detail | Journey, trade and mobile | Genuine difference? |
| --- | --- | --- | --- | --- |
| **Editorial** | Huge editorial hero (960px tall at 390, 1,348px at 1280) containing only a dish name; below it, a “From the kitchen” product block and a second brand block. | Three-item menu; detail is a menu line with a prominent price and recommendations. | The hero is effectively an empty surface. The brand block repeats the imported search phrase “Searching for an Italian restaurant in Shoreditch, Borough Market or Soho?” as body copy. Reservation/visit navigation is present. | **Partly.** Hero-led, but the content is thin and the hero is blank. |
| **Modern** | Opens directly on the menu/catalogue; huge headline is the imported SEO question. | Two-column cards with blank gradient media; detail is a menu line. | Efficient ordering, but no home/brand story. The blank image fields make the menu feel unfinished. | **Yes.** Catalogue-first architecture. |
| **Luxe** | Dark, 1,192px hero with a single dish name and no image; one product visible below. | Menu/detail use the same menu data. | Strong type and palette, but the empty hero dominates; sparse content makes the luxury direction feel like a skin. | **Partly.** Editorial/luxe are both hero-led and differ largely in palette/type. |

**Verdict:** two effective architectures (Modern catalogue-first; Editorial/Luxe hero-led). The restaurant has only three menu items in the fixture, so it cannot demonstrate a credible long-menu experience.

### Hotel Pelirocco (hotel)

| Concept | Home / IA | Catalogue and detail | Journey, trade and mobile | Genuine difference? |
| --- | --- | --- | --- | --- |
| **Minimal** | “Rooms & suites” list; Check dates; two room types; clear filters; room cards with per-night price. | Room listing detail with a stay CTA; room cards are legible. | The clearest hotel concept. Room photographs are blank gradients, so the product looks unfinished. The primary detail CTA is “Add to order”, which is wrong for a stay (section 6). | **Yes.** Utility-first room list. |
| **Editorial** | Peach hero plus room cards; 2 missing-art fields. | Room list/detail; missing media. | Boutique mood is present, but the hero and room art are blank. The H1 duplicates the brand awkwardly. | **Partly.** Hero plus room list; close to Luxe in structure. |
| **Luxe** | Dark, hero-led room display; huge blank gradient panels; 2 missing-art fields. | Room list; bottom navigation overlays content at the bottom of the capture. | Dramatic palette, but the empty imagery and catalog-first feel undermine it. | **Partly.** Mostly a palette/hero variation of Editorial. |

**Verdict:** Minimal is a genuine room-first concept; Editorial/Luxe are surface variants. The hotel flow also has a P0 booking defect, independent of concept quality.

### Blue Tit London (salon & spa)

| Concept | Home / IA | Catalogue and detail | Journey, trade and mobile | Genuine difference? |
| --- | --- | --- | --- | --- |
| **Minimal** | Opens on services; 12 of 82 treatments visible; filter chips; compact service rows with price and chevron. | Catalogue is a dense list; detail is a care/treatment page with Book. | Fast scan and booking intent. No brand hero. Repeated contaminated descriptions dominate. Missing photographs. | **Yes.** Catalogue-first utility. |
| **Editorial** | Light, airy service grid; no hero story; four missing-art fields. | Catalogue/detail are visually the same structure as Luxe apart from palette. | Calm and readable, but not “editorial”: no narrative, no images, no strong hierarchy. | **Partly.** Home differs from Luxe, but catalogue/detail do not. |
| **Luxe** | Dark statement hero (“Blue Tit is a group of award-winning boutique hair salons…”), then a treatment list. | Same catalogue/detail architecture as Editorial, dark palette. | Strongest brand moment of the three; missing photographs leave large gradients. | **Partly.** Largely a palette/type variation once past the hero. |

**Verdict:** Minimal is distinct; Editorial and Luxe share catalogue/detail IA and differ mainly in palette and the home hero. This is exactly the “colour/font is not a concept” failure the brief warned about.

### Architecture for London (professional services)

| Concept | Home / IA | Catalogue and detail | Journey, trade and mobile | Genuine difference? |
| --- | --- | --- | --- | --- |
| **Classic** | Editorial hero plus one service card; large whitespace. | One service in the catalogue; detail uses a professional/booking path. | Clear but extremely sparse. Repeated placeholder description; the page ends with a large blank gap before the actions. No portfolio/proof section. | **Yes.** Hero + service composition. |
| **Minimal** | Opens on services/catalogue; one service row. | One-service list; detail. | Direct, but there is no home/identity at all. The “concept” is a catalogue screen. | **Yes, but under-filled.** Catalogue-first. |
| **Editorial** | Hero-led, narrower service card; one service. | One-service catalogue/detail. | Restrained and brand-appropriate, but the single card cannot demonstrate an editorial system. | **Partly.** Hero-led like Classic, with a different column treatment. |

**Verdict:** three templates exist, but one service and no portfolio make them feel like one thin concept with layout variations. For a professional-services business, the missing proof/portfolio is a content-product gap, not a styling issue.

### Cross-concept finding

- **Yarmouth** delivers three genuine architectures.
- **Padella** has two effective architectures; Editorial and Luxe share a hero-led skeleton.
- **Pelirocco** has two effective architectures; Editorial and Luxe are largely surface variants.
- **Blue Tit** has two effective architectures; Editorial and Luxe share catalogue/detail and differ mainly in palette/home hero.
- **AFL** has three templates but insufficient content to make them meaningfully different; Classic and Editorial are close.

**This is a P1 product issue:** the owner is told they are choosing among three distinct concepts, but for four of five benchmark businesses the real choice is closer to two. The visual audit should not be “fixed” by changing colours; it needs genuinely different home composition and, where relevant, different catalogue/detail patterns.

---

## 4. Responsive and visual findings

**Coverage:** 105 captures — 15 concepts × three screens at 390, plus all 15 home screens at 320, 430, 768 and 1280. No network failures, no console errors, no body horizontal overflow and no tab bar outside the viewport in any capture. The automated report contains 39 flagged entries because the same seven patterns repeat at each width; they are filter-row clipping, circular-thumbnail clipping, Blue Tit text truncation and missing-art fields, not 39 independent failures.

### What is solid

- Narrow phones 320/390/430 do not overflow the viewport.
- Catalogue and detail navigation opens correctly at every captured size.
- Bottom navigation, where used, stays inside the viewport.
- Product, room and service rows reflow without broken text containers.
- Long catalogues paginate: Yarmouth shows 66 of 74 on first render. The load-more interaction was not exercised end-to-end, so the paging control’s behaviour is inspected, not proven.
- Uploaded photographs render; no image request failed in any capture.

### What is weak

1. **Photography gaps dominate the first impression.** Padella Editorial/Luxe (1 missing-art field each), Pelirocco Editorial/Luxe (2 each) and Blue Tit Editorial/Luxe (4 each) render pale gradient blocks where product/service/room photographs should be. These are owner-fillable, but the generated app looks unfinished before the owner uploads anything.
2. **Huge empty heroes.** Padella Editorial is 960px tall at 390 and 1,348px at 1280; Luxe is 1,192px at 390. Pelirocco Editorial/Luxe both use 348px hero surfaces with missing art. On a phone the hero can consume more than a full screen before any product/room is visible.
3. **Imported search copy is used as brand copy.** Padella’s “Searching for an Italian restaurant in Shoreditch, Borough Market or Soho?” appears as a heading/body block. It reads like an SEO landing page, not a restaurant.
4. **Desktop is mostly a stretched phone column.** At 1280, all concepts use a narrow centred content column (roughly 950–980px or less). Blue Tit Editorial’s service grid remains two small columns with large blank space to the right; there is no desktop-specific composition. This is usable, but not a considered desktop experience.
5. **Filter affordance is weak.** Yarmouth’s filter chips reach the right edge and the automated “clipped” flag repeats at every width. This is a horizontally scrollable row rather than content loss, but there is no visible fade/arrow cue that more filters exist.
6. **Repeated placeholder copy** (`Owner-confirmed detail.`) is a benchmark-persistence artifact. It makes the visual evidence look worse than a clean generation would, but the underlying content pipeline should still be checked with a clean fixture before public release.

### Performance observations

- Local app HTML was **~484 KB** for Padella/Pelirocco and **~660 KB** for the 74-item Yarmouth app, uncompressed, before any real image payload. Local response times were ~6–15 ms.
- This is not a production performance measurement. It is a warning that the catalogue-first app carries a large inline document; production gzip/CDN behaviour and real-photo payloads still need measurement on a mid-range phone.
- No failed or slow image requests appeared because the missing images are gradients, not network images. Real-photo performance is therefore **not** verified by this run.

The generated contact sheets under `sheets/` have a crop/blank artifact and should not be used as evidence for fine layout. Use the individual `concepts/*.png` files and `concepts/visual.json`.

---

## 5. Mobile and PWA experience

**Result: 16/16 checks pass** (`pwa.json`).

Verified:

- Manifest served with `application/manifest+json`.
- `start_url` is `/p/<token>/app`; scope is `/p/<token>/`.
- Chromium reports **no installability errors**.
- Service worker installs, activates and controls the app scope.
- Controlled reload works.
- Catalogue navigation, detail opening, in-app back and browser back work.
- Offline document is available from cache with the offline banner; the service worker controls the offline document.
- The installed app no longer opens the owner build page.

Limits:

- The manifest uses an SVG icon for both `any` and `maskable`. No `apple-touch-icon` is emitted on the customer app. **iOS install icon/launch behaviour was not tested**; do not claim a polished iOS install.
- No native Android/iOS app is implemented. The export tooling can produce a TWA package, but no store package was built or tested here.
- No push notifications, background sync, share target or periodic refresh were tested.
- Order/booking status is now fetched live (service-worker bypass), but a real status transition after the fix was not exercised to avoid mutating customer orders. The source bypass and the unit assertion are verified; the end-to-end transition remains a test to run in the pilot.

**PWA status-cache fix:** the worker previously served all non-navigation GETs cache-first, including `/p/<token>/orders/<id>` and `/bookings/<id>`. A later status update could therefore be hidden forever. The worker now bypasses the cache for those status endpoints. This is a P1 fix, not a decorative change.

---

## 6. Security and operational audit

### Verified by code/tests, not production deployment

| Area | Finding |
| --- | --- |
| Owner cookie | `HttpOnly`; `SameSite=Lax`; `Secure` on HTTPS; path `/`; 30-day max age. Cookie name is project-scoped. |
| Owner session | 30-day absolute expiry, 7-day idle expiry; hourly `last_seen_at` update; logout and logout-all; login limit 10/day/project/IP. |
| Owner key | Derived from `OWNER_SECRET` and project token; not stored as plaintext in the project row. Rotating `OWNER_SECRET` invalidates derived keys. `/studio` shows the derived key only behind the operator studio auth. |
| Owner/public boundary | Owner middleware protects `/api/projects/:token/*`; customer app and public order/booking routes are separate. A customer token cannot read the dashboard or edit the app. |
| Catalogue concurrency | Catalogue/settings writes use version + `updated_at` compare-and-swap and return conflicts instead of blindly overwriting. The prior lifecycle audit covered this; the current focused test confirms persistence. |
| Media | JPEG/PNG/WebP magic-byte validation, 8 MB and 24 MP limits, quotas, WebP variants, content-addressed storage, token-scoped delivery, reference-safe deletion. Verified by prior tests and code inspection; not re-tested against production R2. |
| Rate limits | Builds 3/visitor/day and 40/day; imports 3/visitor/day and 400/day; public orders 30, bookings 15, enquiries 10, media 40 per project/IP. Present in code; **not load-tested or abused in this run.** |
| Error handling | JSON failures and conflict responses exist; order/payment failure consistency tests pass. No production request-ID/alert correlation was verified. |
| Logging | None of the application logging paths inspected writes the owner key or session cookie value; errors log error objects/messages. Production log contents, retention and PII-redaction were not inspected. |
| Health | `/health` checks DB and returns `{ok,db,at}`; `/api/health` returns a static service response. `PREFLIGHT.md` uses `/api/health`, which exists. |
| CSRF | Owner mutation routes check the `Origin` header when present and reject a foreign origin; the owner cookie is `SameSite=Lax`. There is no separate CSRF token. This is a reasonable baseline, but a same-site/legacy-browser threat model would need a token as defense in depth. |

### Gaps and untested assumptions

- **No production D1 or R2 exists.** `wrangler.jsonc` declares production binding names/IDs, but no remote deployment was inspected or exercised.
- **Offsite backup is not running.** The repository has no git remote, no production database/bucket, no scheduler and no watchdog. `docs/OPERATIONS.md` says the offsite job is “not running”; `docs/PRODUCTION_DISASTER_RECOVERY.md` records local and staging rehearsals only, with “scheduler not running”.
- **No production monitoring/heartbeat owner.** Worker observability is enabled in config, but no alert destination or on-call owner was verified.
- **Rollback:** the last 20 design versions are restorable in-app. Worker deployment rollback is a manual provider/dashboard operation; no production rollback was rehearsed. D1 point-in-time recovery is provider-dependent.
- **Restore:** local restore and an isolated staging restore were previously rehearsed; production restore, production media coverage and production credentials were not.
- **Payments:** not activated or tested. The tax/checkout copy and payment start path were inspected only as code/previous tests.
- **Docs drift:** `docs/EDITOR.md` still says element-level editing is “still ahead”, and `docs/MOBILE.md` says image upload/cropping and image replacement are still ahead, while the current editor implements element nodes, upload, library replacement and crop/focal controls. These are documentation defects, not product regressions.

---

## 7. Prioritised issues

### P0 — must be resolved before the stated scope can ship

1. **Hotel stay flow (hotel scope).** The room detail offers “Add to order”. Adding a room opens a cart containing the room and quantity, with **no check-in/check-out fields**. The cart’s order payload has no stay dates. A separate “Dates” booking screen has check-in/check-out and “Request booking”, but it does not carry the selected room; the owner/customer must effectively restart the choice. Verified in `hotel-trade.json` and code. **Required:** make the room detail open a date-aware stay flow, carry the selected room/rate, require valid dates and send them with the booking; do not expose an order-without-dates path for hotel rooms. Exclude hotels from the pilot until fixed.
2. **Production launch controls.** No production D1/R2, no running offsite backup, no scheduler/watchdog, no verified alert destination and no rehearsed production rollback. **Required before public release:** create and verify production resources; run and verify the remote backup; prove scheduler, alert delivery and a restore into an isolated environment; document and rehearse Worker rollback; name an on-call owner. Local tests do not satisfy this gate.
3. **Public content gate.** A public launch must not expose blank hero surfaces, missing product/room/service photographs, imported SEO copy as brand copy, or benchmark-placeholder descriptions. This is not a code blocker for a supervised pilot, but it is a P0 launch gate for a public business site.

### P1 — pilot and public-quality issues

1. **Concept differentiation is not consistently three concepts.** Yarmouth has three; Padella, Pelirocco, Blue Tit and AFL reduce to roughly two effective architectures. Editorial/Luxe often differ in palette/type and hero, not catalogue/detail IA. **Required:** make each named direction differ structurally (home composition, catalogue treatment, detail pattern) or reduce the offer to an honest number of directions.
2. **Generated visual readiness.** Missing-art fields: Padella Editorial/Luxe 1 each; Pelirocco Editorial/Luxe 2 each; Blue Tit Editorial/Luxe 4 each. Padella’s giant empty heroes and imported SEO heading are particularly damaging. **Required:** content/photo readiness review before any customer sees the app; improve first-run photography and hero fallbacks.
3. **Base-price control is misleading for variant products.** The catalogue row shows a base/starting value while the customer sees the cheapest/selected variant. The field is not labelled as a base price. **Required:** label it, show the range/selected price, or hide it for products whose price is variant-driven.
4. **Fixed trade CTAs can be wrong.** “Add to order” is generated for hotel rooms; `Rates include tax…`, “Your viewing agent” and similar labels are not owner-editable. **Required:** trade-aware labels and an owner-facing way to change customer-facing action copy where the trade model is wrong.
5. **Desktop composition is under-designed.** At 1280, several concepts remain narrow single columns with large unused space, notably Blue Tit Editorial. **Required:** a deliberate desktop layout or an explicit decision that the product is a phone-first app shell.
6. **iOS PWA presentation is unverified.** SVG-only manifest icons and no `apple-touch-icon`; no iOS install test. **Required:** test on iOS and provide a raster touch icon if iOS install quality matters.
7. **Order/booking status freshness.** Fixed in the service worker, but no real status transition was exercised after the fix. **Required:** add a pilot check that changes a status from received → ready → completed and confirms the installed app reloads it.

### P2 — quality, documentation and evidence issues

1. **Build page does not show the selected concept.** Add the direction name and a thumbnail/link to the selected preview.
2. **Docs drift:** `docs/EDITOR.md` and `docs/MOBILE.md` understate implemented editor features. Update after the release audit so operators and owners are not told capabilities are missing.
3. **Contact-sheet artifact:** generated sheets have blank/crop issues; individual screenshots and `visual.json` are the reliable evidence. Fix the sheet renderer before using sheets in a future report.
4. **Benchmark content contamination:** persistence-audit text (`Owner-confirmed detail.`) prevents clean copy-quality judgment. Do not “fix” historical evidence; run a clean fixture for future content assessment.
5. **Page weight:** 484–660 KB inline HTML before real image payloads; measure production compression and mid-range phone performance.
6. **Filter affordance:** Yarmouth’s horizontally scrolling filter row needs a visible continuation cue; the automated “clipped” flag is otherwise a false alarm.
7. **Empty/loading states:** offline is tested; empty catalogue, loading skeletons, pagination/load-more and error retry were not exercised end-to-end.
8. **Accessibility:** no screen-reader, keyboard, contrast or tap-target audit was performed. The captures show no viewport overflow, not accessibility compliance.
9. **Portfolio/editorial:** no portfolio-vertical benchmark app was available; portfolio content lifecycle is unverified.
10. **CSRF hardening:** owner mutations already reject a present foreign `Origin` and use `SameSite=Lax`; add an explicit CSRF token if the threat model requires protection beyond that baseline. No exploit was demonstrated.
11. **No production load/concurrency test:** rate-limit thresholds and D1 behavior under realistic concurrency are unverified.

---

## 8. What is safe for a controlled pilot

**Recommended pilot scope**

- Invited owners only; no public directory, no paid acquisition and no real payments.
- **Shop, restaurant, salon or professional-service** business with a clean source site and a complete catalogue.
- Owner signs off business information, prices, missing-information prompts, photographs and every customer-facing page before the app is shared.
- A named operator reviews the app on 320/390/430/768/1280, installs the PWA, tests offline, and tests one real customer journey per trade.
- No hotel pilot until the stay flow is fixed.
- Keep the app on a local/staging deployment or unlisted token link; do not promise production uptime or backups.
- Use test orders/bookings/enquiries only; no live gateway.

**Pilot exit criteria**

- Owner can complete the full journey without operator help.
- No P0/P1 editor crash, data loss or wrong-price path in the pilot trade.
- Every visible image is intentional; no blank hero or imported SEO copy ships to a customer.
- Status transitions are tested for one order/booking.
- Known content limitations are written down and accepted by the owner.

**Not safe for pilot**

- Hotel bookings.
- Live payments.
- Any business with an incomplete catalogue or no owner-approved photography.
- A claim that the installed app is a native app.
- A public launch.

---

## 9. What must be completed before public production release

1. Fix the hotel stay/booking data model and UI; test dates, room, rate, availability, confirmation and status.
2. Make the concept claim honest: three structurally distinct directions, or a clearly labelled two-direction choice.
3. Raise generated content and photo fallback quality; no blank hero or SEO-copy-as-brand on first run.
4. Fix the base-price/variant control and trade-specific CTA copy.
5. Create production D1/R2; deploy once to a controlled environment; verify owner auth over HTTPS, customer routes, media, D1 constraints and rate limits.
6. Run and verify offsite backup against production; prove scheduler, watchdog, alerts and restore into isolation; document RPO/RTO and an owner.
7. Rehearse Worker rollback and content-version rollback; retain the old database/bucket read-only during a restore.
8. Add monitoring/alerting ownership and a production incident runbook.
9. Complete iOS/Android install checks; decide whether a TWA/store package is part of the promise.
10. Run a clean-fixture visual/content review and a mid-range-device performance/load test.
11. Complete accessibility and security hardening (including explicit CSRF validation and log redaction review).
12. Update `docs/EDITOR.md`, `docs/MOBILE.md` and operational docs to match the shipped behaviour.

---

## 10. Evidence and limitations

**Primary evidence**

- `docs/qa/release-readiness-2026-11-22/owner-journey.json` — 46 checks, screenshots `01`–`14`.
- `docs/qa/release-readiness-2026-11-22/catalogue-editor.json` — 8 checks.
- `docs/qa/release-readiness-2026-11-22/pwa.json` — 16 checks, `pwa-offline.png`.
- `docs/qa/release-readiness-2026-11-22/hotel-trade.json` — hotel cart/date-form inspection.
- `docs/qa/release-readiness-2026-11-22/concepts/visual.json`, `concepts/*.png` — 105 captures.
- `docs/qa/release-readiness-2026-11-22/sheets/*.png` — contact sheets (crop caveat).
- Prior reports under `docs/qa/lifecycle-authentication-2026-11-22/`, `docs/qa/generation-benchmark-2026-11-21/` and related directories; preserved unchanged.

**Limitations**

- No live crawl, paid AI, payment activation, deployment, commit or push.
- Benchmark apps are persisted fixtures contaminated by the historical persistence audit; repeated `Owner-confirmed detail.` copy is not a clean content sample.
- No real order, booking, enquiry or payment was submitted in this phase. Hotel cart/date UI was inspected; the order was not placed.
- No real iOS/Android device or store package was tested.
- No production D1/R2, backup, monitoring, restore or rollback was exercised.
- Screenshots and visual judgments are from a local Chromium profile at fixed viewports; they are not a substitute for real-device testing or accessibility review.
- No exhaustive control-permutation, load, fuzzing or security-penetration test was performed.

**Bottom line:** the owner journey and the core composition editor are credible enough for a supervised, non-hotel pilot. The product is not yet a public production release: the hotel flow, generated content quality, concept differentiation and the entire production operations layer still need work.
