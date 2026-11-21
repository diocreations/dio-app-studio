# Visual Editor 2.0 — editability audit

Generated from the saved trade fixtures. Every slot below is tagged by the renderer and addressable by a `Doc.elements` key; shell chrome is listed separately.

| Trade | Direction | Sections | Slots | Copies | Copied elements | Missing | Duplicate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| shop | Minimal boutique | 4 | 40 | 0 | 0 | 0 | 0 |
| shop | Gallery retail | 4 | 40 | 0 | 0 | 0 | 0 |
| shop | Contemporary lifestyle | 4 | 40 | 0 | 0 | 0 | 0 |
| restaurant | Editorial dining | 3 | 24 | 0 | 0 | 0 | 0 |
| restaurant | Modern casual | 3 | 24 | 0 | 0 | 0 | 0 |
| restaurant | Premium luxury | 3 | 24 | 0 | 0 | 0 | 0 |
| hotel | Coastal luxury | 4 | 51 | 0 | 0 | 0 | 0 |
| hotel | Editorial stay | 4 | 51 | 0 | 0 | 0 | 0 |
| hotel | Quiet modern | 4 | 51 | 0 | 0 | 0 | 0 |
| salon | Luxury beauty | 5 | 56 | 0 | 0 | 0 | 0 |
| salon | Modern minimal | 5 | 56 | 0 | 0 | 0 | 0 |
| salon | Editorial wellness | 5 | 56 | 0 | 0 | 0 | 0 |
| professional | Classic counsel | 6 | 51 | 0 | 0 | 0 | 0 |
| professional | Modern advisory | 6 | 51 | 0 | 0 | 0 | 0 |
| professional | Editorial practice | 6 | 51 | 0 | 0 | 0 | 0 |

**Total rendered slots:** 666. **Exceptions:** 0.

## Audit coverage

| Area | What the audit checks |
| --- | --- |
| Nested elements | Every semantic tag inside a section, including children of containers, is counted and named by the same slot scheme. |
| Dynamic components | Flagship/data-bound sections are rendered from saved fixtures and checked for collisions; catalogue-owned children stay bound. |
| Product and variant controls | The runtime detail controls are listed as system-owned; their data comes from the catalogue and their outer section remains editable. |
| Search and filter controls | Search fields, filter chips, pagination and result counts are runtime-owned; the search section and result cards remain editable. |
| Navigation | Every visible tab exposes a stable chrome~nav key; its label, destination and icon are editable. |
| Buttons and forms | Document buttons are element slots; form inputs and validation are explicitly system-owned. |
| Responsive layouts | Section responsive visibility is a document property; media rules remain design-owned and are not mistaken for missing elements. |
| Empty and loading states | Runtime empty/loading states are listed separately and never counted as a missing saved override. |

## System-controlled chrome

- App bar: back, brand mark, title, search, saved and cart buttons; brand, type and colours follow the design direction, while the screen title follows the screen name
- Launch splash and brand mark; colours and mark follow the design and project logo
- Bottom tab bar container and active indicator; labels, destinations and icons are editable on the navigation element
- Cart, checkout and booking sheets; fields and totals are runtime-owned, while their copy, currency and surrounding section styling follow the catalogue and design
- Runtime product-detail body: photograph, price, stock, product/variant controls and option state are built from the catalogue; product identity, option IDs and prices are not invented here
- Search and filter controls: query field, filter chips, result count and empty states are runtime-owned; the search section copy, visibility and styling remain editable
- Forms and their validation states: fields, required/error states and submit handling are runtime-owned; form headings and section appearance remain editable
- Responsive layouts: breakpoint CSS and per-section hiding are runtime/design-owned; section visibility and component arrangement remain editable
- Empty and loading states are rendered only when data is missing or arriving; the containing section remains editable and is not counted as a missing slot

## Appearance still editable on system chrome

- Design direction controls palette, type, corners, spacing and surface treatment for shell chrome.
- Screen navigation controls labels, destination and icon; the tab bar container follows the design direction.
- Catalogue controls product and variant names, prices, images and availability; the runtime controls render those values.
- Section-level visibility, responsive hiding, spacing, background and wording remain editable for the screen content around runtime controls.

## Remaining uneditable elements

None in page content. The chrome listed above is deliberately frame-owned; the appearance controls listed above remain editable.
