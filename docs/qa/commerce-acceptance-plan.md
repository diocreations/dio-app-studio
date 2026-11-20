# Checkout acceptance plan (no live payments)

A run-through of the ordering journey with payments left off. Everything here
uses saved fixtures or the local development build; no provider is contacted, no
live key is used and nothing is charged.

## Scope

In: catalogue → card → detail → bag → totals → order creation → order record →
dashboard. Out: live card capture, provider webhooks, refunds, payouts.

## What is already covered

| Case | Where it is checked | Result |
| --- | --- | --- |
| Single-variant product | `tests/checkoutAcceptance.test.ts`, browser fixture build | Card `£7.50`, bag `£7.50`, order line `Default Title`, `variantId: vp-single` |
| Multi-variant product | same | Choosing `Large` prices `£48`; order stores `Large`, `vp-large` |
| Variant change before adding | same | Small `£42` vs Large `£48`; the server prices the named option, never the cheapest |
| Stale cart: product gone | same | `422 item_unknown`, no order |
| Stale cart: option gone | same | `422 variant_unknown`, no order |
| Option named for a product with none | same | `422 variant_unknown` |
| Quantity limits | same | `422 qty_invalid` above 20 |
| Currency and minor units | same | All amounts are integers of the build's minor unit; response carries `GBP`; unconfirmed shows `""` |
| Order creation and retrieval | same | `POST` returns the total and id; `GET` returns the same total, currency, lines, variant names and IDs |
| Customer totals vs record | same | Sum of stored line prices × quantities equals the stored total and the response total |
| Delivery fee | same | Pickup `£7.50`; Delivery adds `299` on both response and record |
| Duplicate submission | same + `tests/catalogue.test.ts` | Same `requestId` returns the same order; a new reference makes a new order; a malformed one is ignored |
| Bag line and total | browser, local build | `0-0 £7.50` + `0-8::vp-large £48` = `£55.50`, matching the order the browser sends |
| Order → dashboard | browser, local build | One order of `2 × £5.25 + £48.00` shows `£58.50`, `£10.50`, `£48.00`, no dollar sign |

## Manual run-through (owner acceptance)

Use a local build (`bun run dev`), never a live key.

1. Open `/p/<token>/app`; confirm every card price matches the catalogue.
2. Open a simple product: one price, no option chooser, add to bag.
3. Open a multi-option product: choose each option and confirm the detail price
   follows; add two different options and confirm two bag lines.
4. Open the bag: line prices × quantities equal the subtotal; delivery adds the
   fee only when Delivery is selected.
5. Place an order. Reload the page and place the same bag again with the network
   throttled: only one order should exist for the retried attempt.
6. Read the order back (`GET /p/<token>/orders/<id>`) and confirm lines, variant
   IDs, currency and total.
7. Open `/p/<token>/dashboard` and confirm the same total and currency.
8. Remove a product from the catalogue in the editor, then order the old bag:
   expect a refusal, not a zero-priced line.

## Payment sandbox, separate and not enabled

If a sandbox is wanted later, it needs its own approval and its own keys. The
shape would be: provider test keys in the platform secrets store, a payment
intent created with the order's currency and minor-unit total, the hosted
payment page pointed at the sandbox, and webhook signatures verified against the
sandbox secret. None of that is configured here, and `payment_status` stays
`unpaid` in every test above.

## Known limits

- Two sends of one attempt that arrive at the same instant are settled by a
  unique index on `(project_id, client_ref)`; the local in-memory database used
  by tests does not enforce that index, so only the sequential case is covered
  automatically.
- The browser run used the development database; no production order exists.
