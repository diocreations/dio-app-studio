# Plattr Stage 2 — discovery provenance

**Date:** 2026-11-23
**Source commit:** `04a6a86` (all Stage 2 code, tests and the capture script)
**Base:** `8dd1974` (Stage 0/1 evidence), itself built forward from the deployed URL-first source `ba7e6be`
**Deployment:** none. Production release `7f3f33af-b49a-4d69-993b-46e31269a087` and rollback `ab5bec21-11e9-47f2-9fa0-e3a2ee43e7d3` are unchanged. Stage 3 was not started.

## 1. Evidence gaps closed

### 1.1 69 extracted photographs vs 67 rendered images

They are two different counts, and the earlier report should not have set them beside each other as if they described the same set.

- **69** was `commerce.withImage`: catalogue rows for which the read tied a source photograph to that exact item.
- **67** was `document.images.length` inside one concept iframe: every `<img>` element in the rendered document, including the logo, and including the same catalogue photograph rendered twice (once as a home feature, once in the catalogue page).

The concept document deliberately renders the **first 12 rows of each section** and lazy-loads the rest through "Show more" (`catalogFirst = 12`). It therefore never draws the whole catalogue at once, and it repeats featured items. The two numbers cannot be expected to match.

The Stage 2 capture proves there is no photo loss. In that run the site yielded **71 catalogue photographs** and each concept rendered **74 `<img>` elements**: more rendered images than catalogue photos, because two are the decorative logo and featured items appear twice. **0 images failed to load.**

There is no evidence that any of the 69 photographs was dropped in Stage 1. The near-equality was a coincidence of that crawl.

### 1.2 The five images with empty `alt`, per concept

The Stage 1 harness counted `!img.getAttribute('alt')`, which treats a deliberately decorative image and an accidentally unlabelled product photo the same way. The five were:

| Count | Image | Cause | Correction |
| ---: | --- | --- | --- |
| 4 | Source product photographs on the home/catalogue cards | `flagship.ts` rendered `itemImage.alt || ''`; the crawler had no alt text for the source image | Falls back to the item's own name, which is the meaningful description of that photograph |
| 1 | Cart variant swatch | `app.ts` hard-coded `alt=""` | Names the product and the option |

The business logo remains `alt=""` and is now explicitly `aria-hidden="true"`: it sits beside the business name, so it is decorative by design rather than unlabelled by accident.

After the fix, each concept renders **2 empty-alt images, both the same decorative logo, both `aria-hidden="true"`**; every product photograph is named. Evidence: `provenance.json` → `itemImages`. This closes the accessibility item without claiming it was one of the 31 Stage 0 failures.

### 1.3 27/27 dedicated compositions vs the earlier “12 generic” finding

Both statements are true of different things, and the earlier one is now superseded:

- The **12 generic** list came from `docs/PLAN_DISCOVERY_AND_DESIGN_2026-11-20.md`, an **inventory of trades still on the shared `docFromSpec` document stack** at that date: hospital, plants-indoor, plants-outdoor, tuition, school, kindergarten, agency, influencer, portfolio, film, gallery, marketplace.
- Stage 0 measured the current source, not that plan. `TRADES.json` contains **27 trades and 27 distinct home block sets** (`blocks[].variant` signature). Hospital now opens on `c-hospital-departments, c-hospital-urgent, c-hospital-visiting, c-hospital-hero`; plants-indoor on `c-plants-indoor-hero, shelf, help, care`; and so on. Each trade has its own composition, not the shared stack.
- Those same 12 trades still **look** text-led, because they have **no curated photography** (T-18…T-29). That is a content gap, not a missing composition. It is why the two findings were easy to conflate.

So: **27/27 have a dedicated composition**; **12/27 have no curated photography**; the earlier “generic” label described the pre-Stage-0 document path, now replaced.

### 1.4 The 31 Stage 0 failures are preserved

`docs/qa/trade-matrix-2026-11-23/ISSUES.md` registers all 31 individually with IDs T-01…T-31, each `OPEN`:

- 17 touch-target checks (38 elements under 44px);
- 12 trades without curated photography;
- 2 gym duplicate-label checks (390px and 430px).

Nothing was marked fixed or removed. Stage 2 touched only the alt treatment of images, which was a Stage 1 item outside the 31, and that is recorded separately in the same register.

## 2. What Stage 2 implements

### 2.1 The provenance record

`src/worker/provenance.ts` defines one shape used everywhere:

```ts
type Provenance<T> = {
  value: T            // exactly what the source said, never a placeholder
  source: string      // the page it came from
  method: 'structured-data' | 'metadata' | 'visible-text' | 'inferred'
  reference?: string  // selector or structured-data path, e.g. json-ld:offers.price
  confidence: 'verified' | 'likely' | 'guess'
  conflicts: { value, source, method, reference? }[]
  needsConfirmation: boolean
  range?: { from, to, raw }  // prices only
}
```

Every business field (`Discovery.business.*`), the currency, every policy link and **all six fields of every catalogue row** now carry it:

| Area | Fields with provenance |
| --- | --- |
| Business identity | name, category, tagline, story, trade, brand colour, logo |
| Contact | phone, email, address, opening hours |
| Commerce | currency (with every declared code and its source) |
| Products | name, description, price, currency, photograph, category (section) |
| Policies | kind, label, URL, method, reference, confirmation |

### 2.2 Rules as behaviour

| Rule | Implementation |
| --- | --- |
| Never invent missing information | An absent value stays `''` with `confidence: 'guess'` and `needsConfirmation: true`; no sample copy, price or image fills it |
| Never silently resolve conflicting prices | Page and feed readings are both kept in `fields.price.conflicts`; the item price stays withdrawn (`0`); one question names both figures |
| Do not convert currencies | Currency code and amount are separate fields; `priceRange` and provenance never touch a rate |
| Do not overwrite owner edits on re-import | Unchanged behaviour, now covered by two explicit tests: unapproved re-import leaves owner price, description and `fieldProvenance` intact; only an explicit `source` resolution moves one field |
| Make source evidence available | The start page exposes a disclosure per fact (value, method, reference, confidence, source link, conflicting readings) and a per-item product evidence panel with counts |
| Ask only about genuinely missing, uncertain or conflicting information | Questions are aggregated: one for descriptions, one for photographs, one for price ranges, one per conflicting price, one for an inferred category, one when no policy page exists |

### 2.3 Price ranges

`importer.ts` now reads a written range (`£10–£20`) as **one reading with both bounds**. The item keeps the lower bound internally so the catalogue is usable, carries `meta: 'from'`, and discovery records `range: { from: '£10', to: '£20', raw: '£10–£20' }`. The app therefore says “from £10”, never “£10” as if it were the exact price. A single ranged item produces **one** question for the catalogue, not one per row.

### 2.4 Policies

The read records policy **links** it can see on the page (shipping, returns, privacy, terms, other), with the anchor selector and the page that linked it. It does **not** summarise a policy page it did not read. Each policy label is `likely` and requires owner confirmation; a missing policy page raises one question rather than letting the app write a policy.

## 3. Files changed

| File | Change |
| --- | --- |
| `src/worker/provenance.ts` | New: the shared provenance model, price-range parser, evidence line |
| `src/worker/discovery.ts` | Field-level provenance for identity, contact, currency, products, policies; conflicts, ranged prices, aggregated questions |
| `src/worker/importer.ts` | Reads a written price range as a range, keeps `meta: 'from'` |
| `src/worker/flagship.ts` | Source product photographs use the item name as alt text |
| `src/worker/app.ts` | Variant swatch alt names product and option; logo explicitly decorative |
| `src/worker/views/start.ts` | “Where each fact came from” and per-item product evidence panels; confidence badges on profile facts |
| `tests/provenance.test.ts` | New: 13 tests covering every required case |
| `scripts/capture-stage2-provenance.mjs` | Reproducible live evidence run at 390px |

No authentication, data-isolation, publishing, payment or deployment code was changed.

## 4. Tests

Command: `bun test` → **775 pass, 0 fail, 7,441 assertions, 64 files** (762 before; 13 new).
`bun run typecheck` → pass. `bun run build` → pass (5.6 MiB deploy assets).

| Required case | What is proved |
| --- | --- |
| Conflicting prices | Both readings kept with their pages; item price stays withdrawn; one question names both |
| Price ranges | Range kept as both bounds; not collapsed to the lower bound; `from` label; one aggregated question |
| Missing product images | No image invented; `fields.image` empty/guess; one photograph question |
| Missing descriptions | No sample copy borrowed; field empty/guess; one descriptions question |
| Ambiguous business category | Inferred category marked `needsConfirmation`; one question quoting the inferred label |
| JavaScript-only catalogue | Shell reported, zero products, zero sections, catalogue question; nothing invented |
| Robots-blocked site | `robots_disallowed`; page never fetched; message tells the owner to supply details |
| Unreachable site | `fetch_failed` 502; no empty catalogue presented as a successful read |
| Owner edits on re-import | Unapproved re-import changes nothing; explicit source resolution moves only that field |

Each test asserts three separate things: what was extracted, what could not be extracted, and what requires owner confirmation.

## 5. Live extraction evidence

**Source:** <https://geestores.com/> — the same approved live site as Stage 1, not a fixture.

| Fact | This run |
| --- | --- |
| Pages read | 10 |
| Catalogue entries | 101 |
| Entries with a source photograph | 71 |
| Currency | INR, `likely`, `visible-text:currency beside prices` |
| Business name | GeeStores, `verified`, `json-ld:name` |
| Category | Jewellery shop, `likely`, `visible-text:business category` |
| Phone / email | read from `tel:` / `mailto:` links, each with its page |
| Rendered `<img>` per concept | 74 (72 product + 2 decorative logos) |
| Failed images | 0 |
| Empty-alt images | 2 per concept, both the decorative logo, both `aria-hidden` |
| Network failures | 0 |
| Questions raised | descriptions (101 of 101), photographs (30 of 101) |

Counts vary between live crawls (Stage 1 saw 100/69; earlier runs 93/60 and 99/66). The report records this run; no fixture was substituted.

### Screenshots at 390px

- [Profile evidence panel](qa/stage2-provenance-2026-11-23/provenance-profile-390.png)
- [Per-item product evidence](qa/stage2-provenance-2026-11-23/provenance-catalogue-390.png)
- [Extracted profile, after discovery](qa/stage2-provenance-2026-11-23/provenance-journey-390.png)
- [Raw record](qa/stage2-provenance-2026-11-23/provenance.json)

The screenshots were inspected: the evidence rows wrap cleanly at 390px and the disclosures are open. This is a functional evidence view, not a claim of premium visual design.

## 6. Limitations

1. **Policies are links, not policy text.** The crawl does not open policy pages, so Plattr records that a policy exists, where it links and its label — never a summary. The owner still has to confirm or paste the policy.
2. **Owner questions are aggregated, not per-item.** A site with 101 description-less products gets one question, not 101. The per-item panel shows which rows are affected, but there is no bulk editor yet for descriptions in the discovery step.
3. **Range handling keeps the lower bound internally.** The app presents it as “from”, and provenance keeps both bounds, but the stored `price` remains a number. A future data model should carry a first-class range.
4. **Price conflicts are page-vs-feed only.** Two visible-text readings of the same item on different pages are not yet compared; the importer's existing conflict detector covers the page/feed case.
5. **JavaScript-only, robots-blocked and unreachable sites are proven by tests, not by a live screenshot.** All three are failure/refusal paths; the test output is the evidence.
6. **No model step.** The AI provider and cost proposal is in `docs/AI_PROVIDER_PROPOSAL_2026-11-23.md`; no key was added and no paid call was made.
7. **Stage 3 not started.** Touch targets, photography, the gym label, the lifestyle first viewport and the broader concept system remain open in `docs/qa/trade-matrix-2026-11-23/ISSUES.md`.

No production deployment was attempted. Production release and rollback are untouched.
