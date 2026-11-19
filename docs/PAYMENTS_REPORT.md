# Payment gateway integration — completion report

November 2026. Local Vite/Worker at `127.0.0.1:8795`, local Chromium. No
production deployment and no live payment was activated.

## 1. What was built

An optional, reusable payment layer that any Plattr trade can use:

- Owner-configurable Razorpay and Stripe accounts in **Settings → Payments**.
- A shared service (`src/worker/payments/service.ts`) rather than per-trade
  payment code. Renderers only receive a capability flag and show a Pay action.
- Server-created Razorpay orders and Stripe Checkout Sessions.
- Signed webhook processing with idempotent event ids.
- Server-side amount and currency validation, duplicate-safe attempts and a
  durable transaction history.
- Full refunds through the connected provider.
- Test/live separation per connection.
- Existing non-payment flows untouched when no gateway is connected.

The delivery is a code change only. `PAYMENT_ENCRYPTION_KEY` was added to the
local `.dev.vars` without printing it, and an empty placeholder was added to
`.env.example`. Nothing was committed or deployed.

## 2. Architecture

```
app button → POST /p/:token/payments/start
           → shared service: load record, price from D1, check gateway/mode/currency
           → provider: Razorpay order | Stripe Checkout Session
           → payment_transactions (pending) + pay page
           → hosted provider checkout
           → signed webhook / return page re-query
           → amount+currency check → paid | failed | refunded
           → order.payment_status / bookings.payment_status + paid_amount
```

### Provider abstraction

`src/worker/payments/providers.ts` implements one interface over both providers:
credential prefix/mode checks, test connection, checkout creation, session/
payment retrieval, refunds, webhook signature verification and event parsing.
Razorpay uses an order + Checkout modal and HMAC `order_id|payment_id`; Stripe
uses a Checkout Session + 303 redirect and `timestamp.payload` signatures.

Razorpay is INR-only in this build. Stripe accepts USD, GBP, EUR, AUD, CAD, SGD,
AED and INR. The currency comes from the project catalogue, not the request.

### Trade independence

The app renderer reads `DATA.payments` (`enabled`, `orders`, `bookings`,
`provider`, `label`) and adds:

- **Pay … online** after an order is placed.
- **Pay a deposit online** after a priced booking request.

All trades use the same handler and endpoint. Booking deposits are a percentage
of the selected catalogue service, so salons, hotels, gyms, studios and
restaurants share one calculation. Apps without a gateway keep enquiries,
booking requests and pay-on-collection copy.

## 3. Database changes

Added in `src/worker/db.ts` (idempotent `CREATE TABLE/INDEX IF NOT EXISTS` plus
guarded migrations):

| Object | Notes |
| --- | --- |
| `payment_connections` | One row per project/provider; encrypted secrets, masked key id, mode, status, verification time/error |
| `payment_settings` | Active provider, pay-for-orders, pay-for-bookings, deposit percent |
| `payment_transactions` | Kind, `ref_id`/`ref_number`, customer, provider order/payment/refund ids, amount, currency, status, refund status/amount, checkout URL, failure reason, timestamps |
| `payment_events` | Provider event id, type, status, detail; unique per project/provider/event |
| Indexes | Project/status/date lookups; partial unique indexes on provider order id and provider payment id per mode |
| `orders.payment_status` | `unpaid` default; set by verified payment events |
| `bookings.payment_status`, `bookings.paid_amount` | Unpaid/zero by default; deposit events update both |

No card number, CVV, expiry or other instrument data has a column.

## 4. Credential protection

- AES-GCM encryption using `PAYMENT_ENCRYPTION_KEY` (base64, exactly 32 bytes).
- Random IV per encryption; AAD binds ciphertext to `project_id + provider`, so a
  ciphertext copied to another project or provider fails to decrypt.
- Without the key, saves fail closed with `503 vault_unavailable`.
- Decrypted secrets exist only in Worker memory for the provider call.
- The dashboard/API return only `hasKeySecret` / `hasWebhookSecret` booleans and
  the key id; HTML contains no secret. Tests assert the raw dashboard and API
  payload do not contain saved secret or webhook values.
- Audit/activity messages contain provider names and outcomes, never keys, raw
  payloads or signatures.
- Only an authenticated owner session can save, test, disconnect or refund; every
  mutation also rejects a foreign `Origin`. Reads are `private, no-store`.

## 5. API endpoints

Customer:

- `POST /p/:token/payments/start`
- `GET /p/:token/pay/:transactionId`
- `GET /p/:token/payment/:transactionId`
- `POST /p/:token/payments/razorpay/verify`
- `POST /p/:token/payments/webhook/:provider`

Owner:

- `GET /api/projects/:token/payments`
- `PUT /api/projects/:token/payments/settings`
- `PUT /api/projects/:token/payments/connections/:provider`
- `POST /api/projects/:token/payments/connections/:provider/test`
- `DELETE /api/projects/:token/payments/connections/:provider`
- `POST /api/projects/:token/payments/transactions/:id/refund`

The owner dashboard JSON also carries the payment payload.

Start accepts only `{kind, refId}`; amount, currency and customer are loaded from
D1. A paid record cannot be paid again; a pending attempt under 30 minutes is
reused; an older pending attempt is marked `cancelled` before a new one is made.

## 6. Webhook handling

1. Project is resolved from the route token.
2. Raw body and provider signature are verified with that project's saved webhook
   secret (Stripe timestamp tolerance five minutes; Razorpay HMAC over raw body).
3. Event id is recorded **before** processing. A previously processed duplicate
   returns `{duplicate:true}` and changes nothing.
4. Transaction is matched by `plattr_tx` metadata, provider order id, or provider
   payment id, always scoped to the project.
5. Amount and currency must equal the stored transaction. A mismatch marks the
   attempt failed and leaves the order/booking unpaid.
6. Outcomes update transaction, order/booking and refund fields; failures are
   recorded on the event with a bounded reason.
7. Unmatched events are recorded as ignored. Unknown event types are ignored.

Accepted events: Razorpay `payment.captured`, `order.paid`, `payment.failed`,
`refund.processed`, `refund.created`; Stripe `checkout.session.completed`,
`payment_intent.payment_failed`, `charge.refunded`.

Full setup steps are in `docs/PAYMENTS.md`.

## 7. Dashboard screens

**Settings → Payments** (and a Payments nav item):

- Separate Razorpay and Stripe panels with the required fields (key id/publishable
  key, key secret, webhook signing secret, mode), connection status, last
  verification time/result and a copyable webhook URL.
- Save/update, Test connection, Disconnect. Saved secrets are blank on reload and
  labelled masked; saving without retyping a secret preserves the stored one.
- Payment options: active gateway, pay for orders, booking deposits, deposit
  percentage 5–100.
- Summary cards: collected, pending, refunded, failed.
- Transaction table: when, reference, associated order/booking, customer,
  provider/mode, amount + currency, status, refund status/action.
- Client-side filters: from date, to date, status, provider.
- Copy explains direct settlement, no card storage, and that reference ids stay
  server-side.

## 8. Customer flows

- **Order:** place order → success sheet shows “Pay $X online” → hosted pay page →
  provider checkout. The order stays unpaid until a verified webhook/API result.
- **Booking:** send request with a priced service → “Pay a deposit online” →
  deposit calculated from the catalogue and the owner's percentage.
- **No gateway:** no pay action; the app keeps its existing enquiry, request and
  pay-on-collection wording.
- **Failure/cancel:** the pay page explains that no money was taken and offers a
  return/retry; a superseded attempt is shown as cancelled.
- **Paid:** pay page shows “Payment received”, the amount, provider, business and
  test/live notice.
- **Refunded:** pay page shows the refund notice.

## 9. Verification performed

Commands, all run after the final edits:

- `bun run typecheck` — pass.
- `bun test tests/payments.test.ts` — **22 pass, 0 fail** (114 assertions).
- `bun test` — **338 pass, 0 fail** (4,684 assertions, 30 files).
- `bun run build` — pass.

Payment test coverage:

| Case | How it was checked |
| --- | --- |
| Missing gateway | `gateway_not_connected` 422 for start |
| Missing encryption key | `vault_unavailable` 503, nothing stored |
| Invalid credentials | mocked provider 401 and real Stripe 401 with fake keys |
| Valid test-mode credentials | mocked provider success only (no real keys available) |
| Successful payment | mocked Stripe webhook and Razorpay verify → paid, order paid |
| Failed payment | Stripe `payment_intent.payment_failed` → failed, order unpaid |
| Cancelled payment | old pending attempt superseded → cancelled, new pending |
| Duplicate webhook | same signed event replayed → duplicate, one event row, no double effect |
| Invalid signature | Stripe forged header 401; Razorpay bad HMAC 401 |
| Amount mismatch | event amount ≠ stored → failed, order unpaid |
| Cross-business isolation | other owner cookie 401; other project's webhook 404; history empty |
| Disconnect | connection removed, capability off, secrets gone, order still readable |
| No-gateway app | capability false, no Pay copy, `"enabled":false` |
| Trade without a payable workflow | finance app with a connected gateway keeps every payment switch off |
| Refund | mocked Stripe refund → refunded, order refunded |
| Booking deposit | 20% of selected catalogue price, not a browser amount |
| Secret handling | ciphertext only; wrong project/provider AAD fails; HTML/API contain no secret |
| Dashboard | masked connection, transaction row, summary, filters |

Browser checks (local Chromium, not automated tests):

- Payments tab renders both panels, options and empty transaction table.
- Saved fake Stripe credentials → “Connected · Test · untested”, secret fields
  blank, active provider selected automatically.
- Test connection hit real Stripe, returned a clean “gateway rejected these
  credentials” message and stored a failed verification; no secret appeared.
- Placed a store order; success sheet showed “Pay $70.99 online”.
- Clicking Pay called the start endpoint; Stripe rejected the fake key, the app
  showed the gateway error, and the order stayed unpaid.
- Hosted pay page rendered amount, provider, test mode, reference and
  “Waiting for the gateway”; paid-state page rendered after server-side status
  was set; dashboard then showed the transaction row and `$70.99` collected.
- Status/provider filters hid and showed the row correctly.

Two UI defects found during this browser pass and fixed:

1. The app's delegated click selector omitted `[data-pay]`, so the new Pay button
   did nothing. Added and re-verified (the start request now fires).
2. `.btn { display:inline-flex }` overrode the `hidden` attribute on the
   Razorpay-only button, exposing “Open secure checkout” on Stripe pages. Added
   `.btn[hidden] { display:none !important }`.

The automated suite now also asserts the generated app contains the `[data-pay]`
selector.

## 10. Limitations

- **No live provider verification.** There were no real Razorpay or Stripe test
  credentials and no public webhook delivery. Successful payments, real webhooks,
  provider refunds and account eligibility are covered only by injected `fetch`
  doubles. The real Stripe call confirmed the rejection path, not a successful
  test-mode payment. These must be re-run with real test credentials and webhook
  forwarding before release.
- Webhook URL shown in the dashboard uses the current request origin. Production
  must be reached through the canonical HTTPS domain; an alternate host would
  display a URL the provider cannot call.
- Razorpay supports INR only here. Multi-currency Razorpay accounts and
  currency-specific catalogue pricing are not implemented.
- Refunds are full-amount only, initiated by the owner, with no partial refund,
  reason capture or dispute flow.
- No Stripe Connect, Route, platform fee or destination charge. Settlement is
  direct to the business's own account; a platform fee must be billed separately.
- No saved cards, subscriptions, authorise-then-capture, wallets or offline
  payment recording.
- No provider retry queue. Webhook processing is idempotent, but if D1 or the
  Worker fails the provider's retry is relied upon.
- No dedicated UI for the `payment_events` audit table (it is queryable in D1).
- Payment encryption key rotation requires re-entering credentials.

## 11. Release checklist

1. Set `PAYMENT_ENCRYPTION_KEY` as a Worker secret (base64 32 bytes).
2. Deploy only with explicit approval; no live keys were configured.
3. Reconnect each gateway with real test credentials, create the provider
   webhook against the deployed HTTPS URL, and complete one test payment,
   failure, duplicate delivery, refund, disconnect and cross-business check.
4. Obtain the business's confirmation of provider eligibility and settlement
   account before enabling live mode. Do not enable live payments without that
   approval.
