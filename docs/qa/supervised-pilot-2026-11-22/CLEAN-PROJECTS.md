# Clean pilot projects

Date: 22 November 2026

Four separate local pilot projects, each with three generated concepts. They
were built from the saved recovery reports only. No historical benchmark
project or benchmark report was edited, and no live crawl or AI generation was
used.

Internal project links and owner sessions are in the untracked
`.chrome-qa/pilot-projects.json`. They are deliberately not reproduced here.

## Project summary

| Business | Trade | Builds | Catalogue in each build | Contact read | Owner review |
| --- | --- | --- | --- | --- | --- |
| Yarmouth Oilskins | Retail | minimal, editorial, lifestyle | 74 products in 13 sections, all priced, 74 with a source photograph | No phone, email or address published | `in_review`; source review complete |
| Padella | Restaurant | editorial, modern, luxe | 0 dishes. Five policy/location rows kept as information, not dishes | No phone, email or address published | `in_review`; source review empty |
| Blue Tit London | Salon | minimal, editorial, luxe | 82 treatments in 1 section; 7 priced; no treatment photographs | Phone `01702412486`; no email or address | `in_review`; source review partial |
| Architecture for London | Professional services | classic, minimal, editorial | 1 service, unpriced (“Ask on request”); 7 journal case studies held as unpublished portfolio suggestions | Phone `+442036374236`; email `mail@architectureforlondon.com`; opening hours; no street address | `in_review`; source review partial |

All twelve builds returned HTTP 200 for the customer preview and owner review,
and all twelve are in the unapproved `in_review` state. The clean-project audit
is `clean-project-audit.json` (12/12 passed).

## Identity and source facts

### Yarmouth Oilskins

- The saved site writes the name as `yarmouthoilskins` in its metadata. The
  display name **Yarmouth Oilskins** comes from its own sentence “Yarmouth
  Oilskins Est. 1898…”. The name is still marked for owner confirmation.
- Category: Clothing shop. Brand story and two social profiles were read.
- Prices are formatted in GBP because the saved evidence has GBP candidate
  readings from Shopify analytics and £ labels on the variants. The saved report
  left its currency field blank; publishing a currencyless price was not
  acceptable.
- 16 source rows were read but not published, including gift-card navigation,
  product variants without commercial evidence and other site chrome. They stay
  visible in the review ledger with the reason.
- No contact details were invented. Phone, email, street address and opening
  hours are listed as missing.

### Padella

- Correct name and category, brand story and two social profiles.
- **No dish is published.** The pages reached contain policy, location and
  navigation content, not a usable dish list with prices. Five policy/location
  rows are kept as business information.
- The app therefore offers **Request a table** and states plainly that the menu
  has not been published. It does not show an empty dish grid or made-up pasta.
- Phone, email, address, opening hours, dish names/prices and a menu source are
  listed as missing.

### Blue Tit London

- 82 treatments are present. Only 7 had a published price; the other 75 say
  “Ask on request”. The app and review both show that distinction.
- Only the published phone number is present. Email, address and opening hours
  are missing.
- The site published no treatment photographs. Every card/detail uses the
  intentional monogram absence state and detail pages say “Image not supplied”.
  No stock imagery was substituted.

### Architecture for London

- One service, **Build**, is published. It has no price, so it says “Ask on
  request”.
- Phone, email and the published opening hours are present. The weekend line
  `Sat–Sun 00:00–00:00` is marked for owner confirmation rather than silently
  interpreted as “closed”.
- Seven journal case studies are held as portfolio suggestions, not services and
  not published work. They need owner acceptance.
- Street address and case-study photographs are missing.

## Three concepts per business

| Business | Concept directions | Visible difference |
| --- | --- | --- |
| Yarmouth | minimal / editorial / lifestyle | catalogue-first list; magazine cover and product story; image-led campaign |
| Padella | editorial / modern / luxe | wordmark home; menu-first compact chrome; dark menu-first composition |
| Blue Tit | minimal / editorial / luxe | compact treatment list; single-column image-led story; dark two-up treatment index |
| AFL | classic / minimal / editorial | title-first home; services-first home and spec-sheet detail; service-led home and image-led detail |

The architecture validator requires at least five differing axes for every
pair. The clean visual matrix is in `screens/` and the contact sheets are in
`sheets/`. There were 87 captures, 0 network failures and 0 console errors.

## Contamination and honesty checks

Every one of the 12 builds was scanned for:

- `Owner-confirmed detail.` and other owner-confirmation placeholders;
- benchmark/test/lorem/contamination phrases;
- invented tax claims (“Prices include tax” / “Rates include tax”);
- sample-business names and sample contact details;
- invented dishes, rooms, services, reviews or photographs.

No forbidden phrase was found. The generated tax line was removed from the
shell because it asserted a policy the saved website had not established.

Missing information is not hidden: it is listed in `sourceReview.missing`, and
the owner sees each item with a direct **Add** or **Open catalogue** action.
Where the site was silent, the app stays silent.

## What is intentionally absent

- No public URL or deployment.
- No payments.
- No hotel project.
- No owner approval. All builds are waiting for supervised owner review.
- No customer orders, bookings or enquiries were placed in these clean projects,
  so their dashboards start empty. End-to-end submission was proven separately
  on the prior clean acceptance builds; the current previews were rendered and
  inspected without creating customer records.

## Evidence

- `clean-project-audit.json` — per-build status, counts, contacts, missing lists
  and preview checks.
- `screens/` — 87 screen captures.
- `sheets/trade-*.png` — three concepts per business at 390px.
- `sheets/responsive-*.png` — 320, 430, 768 and 1280.
- `.chrome-qa/pilot-projects.json` — untracked internal links/owner sessions.
- `scripts/pilot-projects-seed.mjs` — reproducible seed from saved reports.
- `scripts/pilot-clean-audit.mjs` — read-only audit.
