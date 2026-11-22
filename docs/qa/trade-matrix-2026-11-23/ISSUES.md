# Stage 0 issue register — tracked, not closed

**Source of truth:** `docs/qa/trade-matrix-2026-11-23/REPORT.md` and `TRADES.json`
**Baseline:** 27 trades, 606 checks, **31 failing**
**Status:** all 31 remain **OPEN**. None is marked fixed or removed here. Stage 3 owns the visual items.

The audit distinguished *having a composition* from *being finished*. The 31 failures are recorded against the current source even where a later stage changes something nearby, so the count does not quietly shrink.

## Summary

| Group | Count | Owner stage |
| --- | ---: | --- |
| Touch targets below 44px | 17 checks (38 elements) | Stage 3 |
| No curated photography | 12 trades | Stage 3 / content |
| Duplicate visible label (gym) | 2 checks (390px and 430px) | Stage 3 |
| **Total** | **31** | |

## T-01…T-17 — touch targets below 44px

Each row is one failing check. The parenthesised number is the count of elements the harness measured under 44px at that viewport.

| ID | Trade | Detail | Status |
| --- | --- | --- | --- |
| T-01 | restaurant | 3 under 44px | OPEN |
| T-02 | shop | 3 under 44px | OPEN |
| T-03 | gym | 2 under 44px | OPEN |
| T-04 | clinic | 2 under 44px | OPEN |
| T-05 | trades | 2 under 44px | OPEN |
| T-06 | property | 1 under 44px | OPEN |
| T-07 | hotel | 2 under 44px | OPEN |
| T-08 | auto | 2 under 44px | OPEN |
| T-09 | hospital | 2 under 44px | OPEN |
| T-10 | ecommerce | 2 under 44px | OPEN |
| T-11 | plants-indoor | 3 under 44px | OPEN |
| T-12 | plants-outdoor | 3 under 44px | OPEN |
| T-13 | courses | 3 under 44px | OPEN |
| T-14 | tuition | 2 under 44px | OPEN |
| T-15 | portfolio | 2 under 44px | OPEN |
| T-16 | film | 2 under 44px | OPEN |
| T-17 | marketplace | 2 under 44px | OPEN |

Evidence: `screens/<trade>--390.png` and `screens/<trade>--430.png`, plus the machine checks in `machine/`.

## T-18…T-29 — no curated photography

| ID | Trade | Status |
| --- | --- | --- |
| T-18 | hospital | OPEN |
| T-19 | plants-indoor | OPEN |
| T-20 | plants-outdoor | OPEN |
| T-21 | tuition | OPEN |
| T-22 | school | OPEN |
| T-23 | kindergarten | OPEN |
| T-24 | agency | OPEN |
| T-25 | influencer | OPEN |
| T-26 | portfolio | OPEN |
| T-27 | film | OPEN |
| T-28 | gallery | OPEN |
| T-29 | marketplace | OPEN |

These trades render text-led compositions with no image boxes. No stock photograph is substituted. Licensed photography is a content task through `docs/PHOTOGRAPHY.md`, not a code change.

## T-30…T-31 — duplicate visible label (gym)

| ID | Trade | Detail | Status |
| --- | --- | --- | --- |
| T-30 | gym | Visible label “Member hip” duplicated at 390px | OPEN |
| T-31 | gym | Visible label “Member hip” duplicated at 430px | OPEN |

Evidence: `screens/gym--390.png`, `screens/gym--430.png`.

## Related Stage 1 accessibility item (closed, with evidence)

Not part of the 31. Stage 1 recorded **five images per concept with an empty `alt`**. Stage 2 identified them and corrected their treatment:

- Four were source product photographs rendered by `flagship.ts` with `itemImage.alt || ''`; they now fall back to the item's own name.
- One was a cart variant swatch rendered by `app.ts` with a hard-coded empty `alt`; it now names the product and option.
- The business logo remains `alt=""` but is now explicitly `aria-hidden="true"`, because the business name is adjacent text and the image is decorative.

Evidence: `docs/qa/stage2-provenance-2026-11-23/provenance.json` → `itemImages`.

This is not one of the 31 and does not change their status.
