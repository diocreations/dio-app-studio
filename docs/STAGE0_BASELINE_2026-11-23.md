# Plattr Stage 0 — 27-trade baseline

**Date:** 2026-11-23 (UTC)  
**Source commit:** `ac5f8aa44de15d5f18bd625e73e7bb9512a27c1f`  
**Production source reconciled from:** `ba7e6be261f2421dd9966a1f0302846570b64971`  
**Audit base:** `860e4e30acc561790296d76c3d0b0539d0a3f742` (an ancestor of `ba7e6be`)  
**Deployment:** none. Production release and rollback remain untouched.

## What this stage is

A repeatable baseline of every trade, built from the real prompt/renderer path:

`readPrompt` → `buildSpec` → `docFromSpec` / `flagshipDocFromSpec` → `renderApp`

The harness starts a local Bun server, opens each rendered app in Chrome, and measures the rendered customer screen at 390px and 430px. It does not call the live importer, the database or production.

**Harness:** `scripts/audit-trades.mjs`  
**Command:**

```sh
TRADE_AUDIT_OUT=docs/qa/trade-matrix-2026-11-23 bun scripts/audit-trades.mjs
```

**Machine:** Chrome 157.0.8103.80, CDP 9223, local Bun server.

## Result

- **27 trades**
- **606 checks**
- **31 failing checks**
- **27/27** prompts read as the intended trade
- **27/27** have their own home-screen composition
- All render checks passed: document/spec, own composition, screen book, published and editor rendering, save/reload identity, no `undefined`/`NaN`, controls, catalogue identity, no fake art, image loading, 320px overflow, 390px overflow, 430px overflow.
- The failures are recorded, not suppressed. They are the baseline for the next design/data-model batches.

### Failure groups

| Group | Count | Trades |
| --- | ---: | --- |
| `tap-targets` under 44px | 17 | restaurant, shop, gym, clinic, trades, property, hotel, auto, hospital, ecommerce, plants-indoor, plants-outdoor, courses, tuition, portfolio, film, marketplace |
| `trade-photography` — no curated library yet | 12 | hospital, plants-indoor, plants-outdoor, tuition, school, kindergarten, agency, influencer, portfolio, film, gallery, marketplace |
| `labels-unique` / `labels-unique-430` | 2 checks, 1 defect | gym: visible label **“Member hip”** appears twice |

No trade failed the 320px or 430px overflow checks, image loading, or the image-alt/visible-image checks.

## Evidence

- Full machine-readable report: [`docs/qa/trade-matrix-2026-11-23/REPORT.md`](qa/trade-matrix-2026-11-23/REPORT.md)
- All trade records: [`docs/qa/trade-matrix-2026-11-23/TRADES.json`](qa/trade-matrix-2026-11-23/TRADES.json)
- 27 home captures at 390px: [`docs/qa/trade-matrix-2026-11-23/`](qa/trade-matrix-2026-11-23/)
- 27 workflow captures at 390px and 27 home captures at 430px: [`docs/qa/trade-matrix-2026-11-23/screens/`](qa/trade-matrix-2026-11-23/screens/)
- Specs and documents used by the render: [`docs/qa/trade-matrix-2026-11-23/machine/`](qa/trade-matrix-2026-11-23/machine/)

## Visual assessment

This baseline does **not** establish that all 27 designs are premium. The captured screens show the current gap honestly:

- restaurant and gym have a clear visual hierarchy and usable photography;
- shop has a real catalogue rhythm but cramped product thumbnails at 390px;
- hospital is structurally complete but placeholder-led, with no curated photography and visible empty image fields;
- the twelve unphotographed trades are text-led compositions, not premium visual products yet.

The next work is content and trade-specific data, not claiming a styling pass has made the set premium.

## Scope and limitations

- No external site was crawled in Stage 0.
- No AI model call was made.
- No paid infrastructure was used.
- The harness measures structure, overflow, controls and rendering fidelity; it does not measure aesthetic quality.
- The 12 missing photo libraries are intentionally left as failures rather than filled with stock substitutes.
- No product code was changed for the baseline; only the audit harness was extended to measure the approved 430px and duplicate-label cases.

## Regression confirmation

The baseline run is isolated from production and from the application database. The product suite, typecheck and build were run after the Stage 0/1 source changes and are recorded in the Stage 1 report.
