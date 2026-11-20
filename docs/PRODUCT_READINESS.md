# Business personalisation & production readiness

November 2026. Local Chromium (390 × 900 at 2× unless stated), local Worker on
`127.0.0.1:8795`. Nothing in this pass was deployed to production.

Batch 3 added five more flagship trades (trades, auto, ecommerce, courses,
finance) with their own compositions and photography; its audit, workflows,
editor checks, width matrix and remaining limits are recorded in
`docs/BATCH3_REPORT.md`. The sections below keep the original readiness pass and
its batch-2 note.

This report records the first flagship and hardening pass. The five original
flagship compositions, the unified document model, owner authentication and the
existing editing surface were kept; the other 22 trades were not migrated at
that time. Batch 2 later added café, gym, clinic, property and studio — see
`docs/BATCH2_REPORT.md`. Seventeen trades remain.

## 1. Per-product photography

Every catalogue row now owns an optional image (`MenuItem.media`) with the same
shape as document media: id, alt, intrinsic width and height, focal X/Y and
`cover`/`contain`. The item image overrides the trade's stock scene in every
renderer. The block-level document image remains the fallback.

| Trade | Where the item image appears | Renderer |
| --- | --- | --- |
| Restaurant | menu feature, menu rows, detail band | `dine-feature`, `itemTile`, detail |
| Retail | product cards, catalogue rows, detail | `shopHome`, `itemTile`, detail |
| Salon | service list, service detail | `salonHome`, `itemRow`, detail |
| Hotel | cover room tag, room stack, room detail | `hotel-cover`, `hotel-rooms`, detail |
| Professional | service index thumbnail, service detail | `pro-index`, detail |

The catalogue editor's photo button opens the media library for that one item.
The chosen photo gets its own alt text, horizontal and vertical crop sliders and
fit choice. Edits stay local until **Save catalogue**, so an abandoned edit does
not change the customer app.

`tests/media.test.ts` now proves all five flagship trades render an owner item
photo, its alt text and `object-position:41% 58%`. The same test file proves
replacement keeps the media id and every item reference.

### Before and after

Same restaurant item, same viewport:

| Before: stock fallback | After: owner photo |
| --- | --- |
| `docs/qa/qa-item-before-390.png` | `docs/qa/qa-item-photo-390.png` |

The before image is a pasta scene chosen by the seed; the after image is the
owner's sourdough upload with a 45% / 55% focal point. Both are 390px captures.

The catalogue controls and the assigned thumbnail are captured in
`docs/qa/qa-catalogue-photo-390.png`.

## 2. Media library

- Upload, preview, alt text and a focal point.
- Search by alt text and All / In use / Not used filters.
- Reuse through **Use photo**; the same R2 object serves any number of items.
- **Replace** swaps the WebP variants while keeping the media id and the item's
  own alt/crop. Existing references therefore survive.
- Deletion is refused while the catalogue or document uses the image. The card
  also shows dimensions and the delivered WebP byte size.
- Uploads are validated (magic bytes, type, dimensions, 8 MB file / 40 MB app
  quota) and stored as 320 / 640 / 1280 WebP variants.
- New: uploads are capped at 40 per project and connection per day.

## 3. Personalisation

Dashboard → Application settings now has a sample-content panel and a brand
colour field.

- Saving business name, tagline, phone, email, address, hours, story, team or
  colour updates the customer app. A changed name also derives a new logo
  initials mark.
- Saving the catalogue marks the catalogue and offers as the owner's **only when
  their content actually changed**. An untouched save does not claim them.
- **Remove sample content** clears only the groups still marked as examples:
  sample catalogue, offers, story, tagline, contact details and team. It never
  deletes photos or the saved layout, and it will not touch a catalogue the
  owner has changed.
- The action requires an explicit confirmation in the dashboard and the server
  checks the confirmation phrase, owner session and same-origin request.
- Empty catalogue states render a deliberate “not published yet” message rather
  than a broken first item.

Legacy rows that predate `spec.sampleContent` are repaired on the first read:
`getProject` and `getProjectById` compare the stored menu, contact details,
story, offers, team and tagline with the trade seed. Matching groups are
flagged as sample; any edited value is treated as the owner's and is left
alone. The inferred object is written back once, so this is a real migration
rather than a display-only fallback. Existing partial flag objects are merged
without overriding an explicit flag. The regression test removes the flags from
a project, reads it back, checks all six keys and then proves an edited
catalogue is inferred as the owner's while untouched groups remain sample.

Verified: `docs/qa/qa-personalisation-390.png`; API tests cover the confirmation,
401 without an owner session, preserving an owner-edited catalogue, clearing the
still-sample groups, and applying a new name/logo/colour to the app.

## 4. Salon and hotel booking and enquiry QA

Both apps were driven through their real date, service, name and contact fields.
The confirmation sheet and the D1 row were checked for every run.

| Trade / width | Date | Service | Confirmation | Stored row |
| --- | --- | --- | --- | --- |
| Salon 390 | Tomorrow 12:00 · 2 people | Colour | “Request sent” | `bkg_a6a34192451511104f`, `requested`, 2026-11-20 12:00 |
| Salon 320 | Sat 21 15:00 · 2 people | Blow dry | “Request sent” | `bkg_193917aa180974302b`, `requested`, 2026-11-21 15:00 |
| Hotel 390 | Sat 21 · 2 guests | Loft suite | “Request sent” | `bkg_6f3e50532a60eaddb1`, `requested`, 2026-11-21 |
| Hotel 320 | Tomorrow · 2 guests | Garden double | “Request sent” | `bkg_575fb510abe6628f96`, `requested`, 2026-11-20 |

Captures: `qa-salon-booking-390.png`, `qa-salon-booking-320.png`,
`qa-hotel-booking-390.png`, `qa-hotel-booking-320.png`. Page scroll width equals
the viewport in all four, and the bottom navigation stays inside the viewport.

Both demos now enable the `quote` feature, so the More screen exposes “Ask about
a treatment” / “Ask about a stay”. The form was submitted at both widths.

| Trade / width | Enquiry | Confirmation | Stored row |
| --- | --- | --- | --- |
| Salon 390 | Colour consultation question | Request sent, reply to the entered email | `enq_03d34c77b481836e4f`, `new` |
| Salon 320 | Keratin smoothing question | Request sent | `enq_310c8a86a245d22e52`, `new` |
| Hotel 390 | Loft suite availability | Request sent | `enq_072f07d92cb4878a3d`, `new` |
| Hotel 320 | Ground-floor room question | Request sent | `enq_8a7c8c70bafc2e8604`, `new` |

The salon and hotel dashboard payloads both return the two enquiries with
`status: new`. Captures: `qa-salon-enquiry-390.png`,
`qa-salon-enquiry-320.png`, `qa-hotel-enquiry-390.png`,
`qa-hotel-enquiry-320.png`.

## 5. Width and regression matrix

All five apps loaded at four widths. `documentElement.scrollWidth` equalled
`innerWidth` in every cell; no horizontal page overflow, no missing alt text and
no unlabelled interactive control was found.

| Trade | 320 | 375 | 390 | 430 | Images / broken |
| --- | --- | --- | --- | --- | --- |
| Restaurant | 320 | 375 | 390 | 430 | 1 / 0 |
| Retail | 320 | 375 | 390 | 430 | 11 / 0 |
| Salon | 320 | 375 | 390 | 430 | 4 / 0 |
| Hotel | 320 | 375 | 390 | 430 | 4 / 0 |
| Professional | 320 | 375 | 390 | 430 | 3 / 0 |

New captures at the extremes: `docs/qa/qa-<trade>-320.png` and
`docs/qa/qa-<trade>-430.png` for all five trades. Existing 390px captures remain
in the same directory.

Validation after the final edits:

- `bun run typecheck` — exit 0.
- `bun test` — 312 passed, 0 failed, 29 files, 3,793 assertions (at this pass;
  batch 2 later reached 315 tests / 4,178 assertions).
- `bun run build` — exit 0.

The image sweep initially exposed a real 500 on every static flagship asset:
the security-header middleware mutated the host asset response's immutable
headers. It now clones the headers and rebuilds the response. A five-app sweep
after the fix loaded 20, 18, 19, 21 and 15 unique images respectively, all `200`
with `image/webp` where expected. The earlier “broken image” finding on the
quote screen was this response bug, not a missing file.

## 6. Lighthouse

Mobile Lighthouse 13.6, local Worker, five runs. SEO is 66 on purpose: customer
builds are `noindex, nofollow` until published.

| Trade | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Restaurant | 98 | 100 | 100 | 66 | 2.1 s | 0 | 0 ms |
| Retail | 96 | 100 | 100 | 66 | 2.6 s | 0 | 0 ms |
| Salon | 96 | 100 | 100 | 66 | 2.4 s | 0 | 0 ms |
| Hotel | 98 | 100 | 100 | 66 | 1.8 s | 0 | 0 ms |
| Professional | 95 | 100 | 100 | 66 | 2.7 s | 0 | 0 ms |

Reports: `docs/qa/lighthouse-<trade>.json`.

These runs predate the static-asset header fix above. Because a 500 on an image
can make a page look faster than it is, rerun Lighthouse before a release; the
accessibility findings remain valid, but the performance numbers are not a
post-fix claim.

What changed because of the audit:

- The app viewport no longer disables pinch zoom. That was the only Lighthouse
  accessibility failure (score 94–95 before, 100 after).
- The hotel cover and first room photo are now eager with `fetchpriority=high`.
  Hotel LCP moved from 4.2 s / 85 to 1.8 s / 98.
- Restaurant Lighthouse TBT was 1,520 ms on the first run and 0 ms on the clean
  rerun; the performance score moved from 72 to 98. The earlier number was not
  reproduced, so treat it as run variance rather than a code claim.

## 7. Accessibility

- Keyboard: twelve Tab stops on the restaurant app all had a visible 2px accent
  focus ring. The feature card could be focused and opened with Enter after the
  keydown fix; before it, only pointer activation worked.
- Cards use `role="button"` and `tabindex="0"`; Enter and Space now forward to
  the same click handler.
- Every interactive control had an accessible name, and every image had an alt
  attribute in the five-app sweep.
- No text contrast failures were reported by the rendered-leaf contrast probe.
  This is a targeted probe, not a substitute for a screen-reader or manual audit.
- At 320px the app bar icon buttons are 38 × 38px. That clears WCAG 2.2 AA’s
  24px minimum but is below the 44px touch recommendation. They do not overlap
  and the bottom navigation remains 18px inside the viewport.
- Reduced-motion handling already existed in both the app and flagship CSS.

## 8. Security and production readiness

| Area | Finding |
| --- | --- |
| Owner authentication | Per-project HMAC owner key, exchanged for a random D1 session; HttpOnly, SameSite=Lax cookie, Secure on HTTPS. 30-day absolute lifetime, 7-day idle expiry, per-session sign-out and revoke-all. |
| API authorization | Every `/api/projects/:token/*` route sits behind one owner-session middleware; the review page and editor redirect anonymous visitors to login. Customer app token cannot read the document API, open the editor or write the catalogue. |
| Rate limiting | Owner login 10/day, orders 30/day, bookings 15/day, enquiries 10/day per project and connection; media uploads 40/day; 429 with `Retry-After`. |
| Upload validation | Body cap 18 MB, file cap 8 MB, magic-byte type check, raster only (SVG rejected), dimension limits, WebP variants only, 24-file / 40 MB app quota. |
| Customer isolation | New regression test creates two businesses in one database, places an order on one, then proves the other dashboard returns no orders/customers and gets 404 when mutating the foreign order. |
| Headers | Added `X-Content-Type-Options: nosniff`, `Referrer-Policy` and `Permissions-Policy` to every response; private paths keep `X-Robots-Tag: noindex`. |
| Error handling | Branded JSON errors for business/media routes; unexpected storage failures are logged server-side and shown as a generic retry message. |
| Audit trail | Sign-in, sign-out, revoke-all, build creation, catalogue/settings changes, sample removal and status transitions append to `activity` with a timestamp. |
| Indexing policy | Customer apps default to `noindex, nofollow` in meta and `X-Robots-Tag`; the owner must explicitly opt in from Application settings. `/health` is disallowed in `robots.txt`. |

Outstanding security limits:

- There is one shared owner key per project, not named owner accounts or roles.
  The activity log therefore has no actor identity beyond "the owner".
- Key rotation is all-or-nothing through `OWNER_SECRET`; per-project rotation
  with an overlap window is not implemented.
- There is no session/device list. Revoke-all is available, but individual
  sessions cannot be named or inspected.
- No CSP is set because the app currently relies on inline styles and a small
  inline script; adding hashes/nonces is the next hardening step.
- Backup/restore was rehearsed locally (`docs/BACKUP.md`), including a separate
  restored database and media copy. Scheduled production exports and offsite
  buckets are still operator work, and R2 exposes no replication rule, so media
  needs a scheduled bucket copy (`docs/PRODUCTION_DISASTER_RECOVERY.md`).
- `.dev.vars` is local-only and gitignored. Production must provide
  `OWNER_SECRET` (or `STUDIO_KEY`) as a real secret; without it the owner
  dashboard correctly reports that access is not configured.

## 9. Limitations

- No production deployment or DNS/TLS check. The checklist is in
  `docs/DEPLOYMENT_CHECKLIST.md`.
- No physical iOS Safari or Android Chrome run; viewports were emulated in
  Chromium.
- No screen-reader session, full axe run or automated visual-diff suite.
- Seventeen trades remain on their existing shells. The audit, feature gaps,
  document mapping and migration strategy are in `docs/TRADE_MIGRATION.md`;
  batch 2's five deliveries are in `docs/BATCH2_REPORT.md`.
- The QA owner session was created against the local Worker; this is not a
  production login test.
