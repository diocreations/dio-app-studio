# Payments acceptance report

Date: 19 November 2026

Scope: the shared Razorpay/Stripe service, hosted pay pages, owner dashboard and
webhook pipeline described in `docs/PAYMENTS.md`.

## Status

| Area | Result |
| --- | --- |
| Automated acceptance (route-level, failure consistency, isolation) | **PASS** |
| Refund retry safety (timeout / 5xx / unreadable success) | **PASS** |
| Mobile-width visual check (320 / 375 / 390 / 430) | **PASS** — dashboard and hosted pay page; see below |
| Real Razorpay test-mode transactions | **BLOCKED** — no Razorpay test credentials in this workspace |
| Real Stripe test-mode transactions | **BLOCKED** — no Stripe test credentials in this workspace |
| Real webhook delivery from either provider | **BLOCKED** — needs a public HTTPS deployment |
| Production `PAYMENT_ENCRYPTION_KEY` secret | **BLOCKED** — nothing has been deployed |

No live payments were enabled and nothing was deployed. Every provider call in
the automated suite goes through an injected `fetch` stub. Those stubs prove
Plattr's request building, signature checks, amount checks and state handling;
they are **not** evidence that a real Razorpay or Stripe account accepted the
integration. No mocked response is presented below as a real transaction.

The workspace contains only `OWNER_SECRET`, `STUDIO_KEY` and
`PAYMENT_ENCRYPTION_KEY`; no `RAZORPAY_*` or `STRIPE_*` secrets exist.

### Status on 20 November 2026

Re-checked for the production-readiness milestone: `bun test tests/payments.test.ts`
and `bun run typecheck` pass, and the app still fails closed without a gateway.
Nothing in this milestone changed payment code. The four blockers above are
unchanged and none can be closed from this workspace: they need provider test
accounts and a deployed HTTPS origin, neither of which exists. No live payment
was attempted and no provider was called.

## What was run

```text
bun test tests/payments.test.ts
  42 pass, 0 fail, 254 expect() calls

bun test
  358 pass, 0 fail, 4,824 expect() calls, 30 files

bun run typecheck   pass
bun run build       pass
```

## Route-level coverage added in this pass

These tests call the real Hono routes with the shared D1 adapter, so they cover
middleware order (body limits, origin checks, owner sessions) rather than calling
service functions directly.

| Route | Verified |
| --- | --- |
| `GET /api/projects/:token/payments` | Anonymous and foreign-business sessions get 401; unknown token 404; the payload has history and no secrets |
| `PUT /api/projects/:token/payments/settings` | Auth, cross-origin 403, unconnected active provider 422, deposit bounds 5–100, persisted toggles |
| `PUT /api/projects/:token/payments/connections/:provider` | Auth, cross-origin, unknown provider 404, malformed JSON 400, 17 KB body 413 |
| `POST /api/projects/:token/payments/connections/:provider/test` | Auth, cross-origin, unconnected 422 with `not_connected` |
| `DELETE /api/projects/:token/payments/connections/:provider` | Auth, cross-origin, 404 when absent, 200 then 404 |
| `POST /api/projects/:token/payments/transactions/:id/refund` | Auth, cross-origin, unknown transaction 404, unpaid transaction 409 |
| `POST /p/:token/payments/start` | Cross-origin 403, malformed JSON 400, invalid kind 422, missing gateway 422, unknown record 404 |
| `GET /p/:token/pay/:id`, `GET /p/:token/payment/:id` | Unknown id 404; another business's transaction 404 |
| `POST /p/:token/payments/webhook/:provider` | Unknown provider 404, unwired gateway 404, missing/forged signature 401, signed non-JSON 400, 129 KB body 413, `Cache-Control: no-store` |
| Full signed webhook → history | Order becomes paid, one transaction row, dashboard summary and history update, replay returns `duplicate: true` |
| Disconnect isolation | Disconnecting business A leaves B connected and enabled; A keeps its transaction history |

## Webhook failure consistency

Three defects were found and fixed during this review, each with a regression
test in `tests/payments.test.ts`.

1. **A crash between the order update and the transaction update could strand a
   payment.** The transaction was marked paid first; if the order update then
   failed, the retried event saw `status = 'paid'` and returned, leaving the
   owner with an unpaid order. The order/booking flag is now written first and
   the transaction row is the commit marker, so a retry converges.
2. **An event interrupted after its row was inserted was never processed
   again.** Only `failed` events were retryable; a row left in `received` (or an
   early `ignored`) was treated as a duplicate forever. Only `processed` is now
   terminal, so provider retries can finish interrupted work.
3. **A paid order could be un-paid by a late or mismatched event.** A failure
   event delivered after `checkout.session.completed`, or a duplicate paid event
   with a different amount, could downgrade a settled transaction. Paid is now
   terminal for paid/failed outcomes; a later paid event may only supply a
   missing gateway payment reference.

Tests:

- `a webhook that fails mid-write is retried and converges exactly once` — 500
  on the first delivery, event `failed`, transaction `pending`, order `unpaid`;
  the retry returns 200, marks both paid, keeps one event row and one
  "Payment received" log line.
- `an event left received by an interrupted delivery is processed on retry`.
- `a signed paid event with no amount or currency is not taken as payment` —
  an authenticated event that cannot prove the charged amount fails closed.
- `late failure and mismatched duplicate events cannot un-pay a settled order`.
- `a refund already in progress cannot be submitted twice` — the second full
  refund is rejected with 409 before any gateway call.
- `a refund timeout keeps the claim so a retry cannot refund a second time` — the
  gateway call fails with an aborted request; the claim survives, the order stays
  paid, and the retry is rejected with 409 before the provider is called.
- `a refund 5xx keeps the claim because the gateway may have applied it`.
- `a refund the gateway definitely refuses releases the claim so it can be retried`.

## Refund and Razorpay fixes found in review

- Refunds are now claimed atomically
  (`status = 'paid' AND refund_status IN ('none','failed')`). A double click or
  two dashboard tabs can no longer send two full refunds to the provider; a
  failed gateway request releases the claim for a later retry.
- Razorpay `order.paid` without a payment entity used to store the **order id**
  as `provider_payment_id`, which would send a later refund to the wrong
  resource. It now leaves the payment id empty, and a later `payment.captured`
  backfills it without changing the paid state.

## Refund retry hardening (this pass)

A refund is not an idempotent read. Before this change, any gateway exception
(including the 15 s timeout) released the refund claim, so an owner who clicked
Refund again could send a second full refund for a refund the gateway had
already accepted but not yet reported. The classification is now explicit:

| Gateway result | Plattr behaviour |
| --- | --- |
| 2xx with a refund id and status | Recorded as `requested` or `refunded` as before |
| 4xx refusal (400/401/402/403/404/422, not 408/409) | Nothing was created: claim released to `none`/`failed`, retry allowed |
| Timeout, aborted request, network error | Outcome unknown: claim **kept** as `requested`, `failure_reason` explains the gateway did not confirm |
| 5xx, 408, 409 | Outcome unknown: claim kept, because the gateway may have applied the refund |
| 2xx without a refund id | Outcome unknown: claim kept |

An unknown outcome writes a "Refund needs reconciliation" activity entry and
returns `refund_outcome_unknown` (502). The dashboard keeps showing *Refund
requested*, and any further click is rejected with 409 before a provider call.
A later signed `refund.processed` / `refund.created` webhook still settles the
row normally, so a genuine refund confirms itself. If the gateway dashboard
shows that no refund was created, the row must be reconciled there; Plattr
deliberately does not auto-retry money movement it cannot observe.

## Security and isolation review

| Area | Result | Notes |
| --- | --- | --- |
| Credential storage | Pass | AES-GCM with `PAYMENT_ENCRYPTION_KEY`; ciphertext bound to project + provider by AAD; no key → save fails closed |
| Secret exposure | Pass | API and dashboard return `hasKeySecret` only; tests assert the secret and webhook secret never appear in JSON or HTML |
| Owner authentication | Pass | Every owner route requires a project-scoped session; a session for another business gets 401 |
| CSRF | Pass | Settings, connect, test, disconnect, refund and customer writes reject a foreign `Origin` |
| Amount/currency integrity | Pass | Amounts come from D1/catalogue; gateway-created amount and currency are checked; a webhook amount/currency mismatch, or a paid event missing either value, marks the transaction failed and leaves the order unpaid |
| Signature verification | Pass | Verified before parsing; Stripe timestamp tolerance 300 s; constant-time comparison; Razorpay event ids dedupe replays |
| Idempotency | Pass (with caveat) | Processed events replay as `duplicate: true`; partial writes converge. Two simultaneous deliveries of the same event can race the unique index; the loser returns 500 and the provider retries, which is safe but noisy |
| Refunds | Pass | Owner-only, paid-only, full amount, atomic claim |
| Refund retries | Pass | Only a definite 4xx refusal releases the claim; timeouts, 5xx, 408/409 and an unreadable 2xx keep it, so an uncertain refund cannot be sent twice |
| Cross-business isolation | Pass | Credentials, transactions, pay pages and webhooks are all scoped by project; webhook for a project without that gateway returns 404 before processing |
| Redirects | Pass | A Stripe return URL only triggers a server-side status read; it never marks an order paid by itself |
| Gateway timeouts | Pass | 15 s `AbortController` on every provider request |
| Rate limits | Pass | Customer payment start 20/day/visitor; gateway test 30/day/project |
| Audit log | Pass | Status changes write to `activity` with amount/kind/reference; no secrets, email or phone in log detail |

Remaining hardening notes (not blockers for test-mode acceptance):

- The hosted pay page has no CSP. It needs Razorpay's CDN script and an inline
  script, so a policy must be designed with hashes/nonces rather than copied from
  the app shell. All interpolated values are escaped today.
- `GET /p/:token/payment/:id` performs a provider status read for anyone holding
  the unguessable 80-bit transaction id. There is no dedicated rate limit on
  this read; the gateway and D1 calls are bounded by the id format.
- `payment_events` is not pruned. Event dedupe therefore stays correct forever,
  at the cost of slow table growth.
- Key rotation is manual (below); there is no re-encryption tool.

## Mobile responsiveness (this pass)

Captured with headless Chromium (Playwright 1.64, matching the desktop's cached
Chromium) against the local dev server at `http://127.0.0.1:8795`, signed in as
the owner of the demo business with a full-page screenshot per width. Images are
in `screens/payments-mobile/`.

| Surface | 320 | 375 | 390 | 430 |
| --- | --- | --- | --- | --- |
| Payments dashboard (summary, gateways, Razorpay, Stripe, payment options, filters, history) | `payments-dashboard-320.png` | `payments-dashboard-375.png` | `payments-dashboard-390.png` | `payments-dashboard-430.png` |
| Hosted pay/status page | `hosted-pay-320.png` | `hosted-pay-375.png` | `hosted-pay-390.png` | `hosted-pay-430.png` |
| Customer checkout sheet | `customer-checkout-320.png` | not captured | not captured | not captured |
| Customer **Pay … online** action after ordering | `customer-pay-action-320.png` | not captured | not captured | not captured |
| Desktop regression (1280) | — | — | — | `payments-dashboard-desktop-1280.png` |

Defects found and fixed in this pass:

1. **The webhook URL was clipped** at 320/375 px. The single-line input cut the
   URL off after `…/p/7`, leaving most of the endpoint unreadable and forcing a
   blind Copy. The field is now a two-row read-only textarea that wraps the
   whole URL, and the Copy button reads the same value.
2. **The transaction table clipped its columns** on phones: the last columns
   were cut at the panel edge with no visible scroll affordance. Below 560 px the
   history now renders as stacked label/value cards (`When`, `Reference`,
   `Customer`, `Provider`, `Amount`, `Status`, `Refund`), so every field and the
   Refund button are reachable without horizontal scrolling. Long reference ids
   wrap instead of overflowing, and the `[hidden]` row rule is restated for the
   block layout so the date/status/provider filters still hide rows on a phone
   (a `display: block` row would otherwise beat the browser's `[hidden]` rule).
3. **The active tab was off-screen** when the dashboard was opened directly at
   `#payments`: the phone tab strip scrolls sideways, so nothing showed which
   section was open. Activating a tab now scrolls it into view.
4. **Gateway headers were cramped**: at 320 px the status pill squeezed the
   provider subtitle into three narrow lines. The header wraps, so the pill drops
   below the name on narrow screens.
5. **Saved-secret placeholders were cut mid-word** (“Saved — enter a new secret
   to replac”); they now read “Saved — enter a new secret”.

Reviewed and unchanged: summary cards stack one per row, gateway inputs and
selects fill the column, buttons wrap without overlapping, the payment-options
panel, the four filters stack, and the hosted page keeps its single card with a
full-width return button and no horizontal overflow. `document.scrollWidth`
equals the viewport at every width.

Not covered at every width: the customer checkout sheet and the **Pay … online**
action only exist inside the app's client-side sheet, which the owner-session
screenshot path cannot drive without a scripted browser; they were captured at
320 px (the narrowest and most constrained width) and are single-column
full-width controls. Booking deposit actions could not be captured at all
because this demo business does not offer bookings (no booking workflow, no
priced service) — the same markup is shared with order payments.

## Real-provider acceptance runbook (still to do)

Prerequisites: a public HTTPS origin (the local Vite server is not reachable by
either provider), one test business per provider, and owner access to the
dashboard.

### Razorpay

1. Create a Razorpay test account and generate a `rzp_test_…` Key ID and secret.
2. The catalogue currency must be **INR**; Razorpay checkout is rejected for any
   other currency by design.
3. Settings → Payments → Razorpay: Key ID, Key Secret, Razorpay webhook secret,
   mode `test`. Save, then **Test connection** (`/balance`-equivalent
   `GET /v1/payments?count=1`).
4. Add the webhook
   `https://<origin>/p/<token>/payments/webhook/razorpay` with a signing secret
   of at least 8 characters; Settings → Payments shows the exact URL.
   Subscribe to `payment.captured`, `order.paid`, `payment.failed`,
   `refund.processed`, `refund.created`.
5. Place an order, start payment, complete it with a Razorpay test card/UPI
   method. Record the Plattr transaction id, Razorpay order id, payment id and
   webhook event id.
6. Confirm: order `payment_status = paid`, one transaction row, dashboard
   history and collected total updated.
7. Repeat with a declined method and with modal dismissal; both must leave the
   order unpaid and show `failed`/`cancelled`.
8. Re-send the same webhook from the Razorpay dashboard; expect
   `{"duplicate":true}` and no second row.
9. Send a webhook with a wrong signature; expect 401 and no state change.
10. Refund the full amount from the dashboard; confirm the Razorpay refund id is
    stored, `refund_status = refunded`, and the order shows refunded. A second
    refund click must return 409.

### Stripe

1. Use `pk_test_…` and `sk_test_…` keys (restricted `rk_test_…` keys are rejected
   by the format check), plus the endpoint's `whsec_…` signing secret, mode
   `test`.
2. Add `https://<origin>/p/<token>/payments/webhook/stripe` for
   `checkout.session.completed`, `payment_intent.payment_failed` and
   `charge.refunded`. For local runs, `stripe listen --forward-to` provides a
   tunnel and a `whsec_` secret.
3. Save, test the connection (`GET /v1/balance`), start a Checkout Session and
   pay with `4242 4242 4242 4242`.
4. Verify the return page shows the server-read paid state, the order is paid and
   the dashboard row is correct. Then replay the event, send an invalid
   signature, and use `4000 0000 0000 0002` for the declined path.
5. Refund in full from the dashboard and confirm the Stripe refund id and states.

### Evidence to capture (redact keys, emails and phone numbers)

| Field | Razorpay | Stripe |
| --- | --- | --- |
| Business token | | |
| Plattr transaction id | | |
| Gateway order/session id | | |
| Gateway payment id | | |
| Webhook event id(s) | | |
| Amount + currency | | |
| Payment status before/after | | |
| Duplicate response | | |
| Refund id + status | | |
| Dashboard URL/screenshot | | |

## Production readiness checklist

| Item | Status | Action |
| --- | --- | --- |
| `PAYMENT_ENCRYPTION_KEY` is a production Worker secret | Blocked | Generate `openssl rand -base64 32` and run `bunx wrangler secret put PAYMENT_ENCRYPTION_KEY` in the deployed environment; never commit it |
| Webhook endpoints are public over HTTPS | Blocked | Deploy, then register the two URLs above per business |
| Secret rotation and recovery | Manual | Replace the secret, then re-save both gateway credentials for every business. Saved ciphertext cannot be read with the new key, so connections show "needs attention" until re-entered. Keep the old key available to roll back until every business is reconnected. Do not rotate during an in-flight checkout |
| Error handling and audit logging | Pass | Generic gateway errors, `last_error` on the connection, `activity` entries, no secrets in logs |
| Mobile-sized payment screens | Pass | Captured and reviewed at 320, 375, 390 and 430 px on the payments dashboard and the hosted pay page; see the mobile section above |
| Real provider eligibility/KYC | Blocked | Owner must have an eligible Razorpay/Stripe account; settlements go directly to that account |

## Provider-specific limitations

- **Razorpay** is INR-only in this build, because international acceptance needs
  an account facility Plattr cannot assume. Key IDs must match the selected mode
  (`rzp_test_` / `rzp_live_`).
- **Stripe** accepts USD, GBP, EUR, AUD, CAD, SGD, AED and INR. Only two-decimal
  currencies are supported because amounts are integer minor units. Restricted
  `rk_…` keys are rejected by the prefix check; use standard secret keys.
- Only **full refunds** are exposed. Partial refund webhooks are recorded, but
  there is no partial-refund UI.
- Refunds require the gateway to still be connected. If an owner disconnects
  while a payment is in flight, the provider will keep retrying the webhook and
  get 404; the funds still settle directly to the business and must be reconciled
  in the provider dashboard.
- A refund left in `requested` — after a process crash between the claim and the
  gateway call, or after a timeout, 5xx, 408/409 or an unreadable success body —
  must be checked in the provider dashboard before anything else is done. The
  claim deliberately does not expire, because an automatic retry could send a
  second refund while the first is still processing. A signed refund webhook
  settles the row automatically when the refund did go through.
- Live mode is stored but was never exercised. Do not switch to live until the
  runbook above succeeds with test credentials and real webhook delivery.

## Remaining blockers before production

1. Real Razorpay and Stripe test-mode transactions and webhook deliveries.
2. A deployed HTTPS origin and the production vault secret.
3. Owner confirmation of gateway account eligibility and settlement details.
4. A customer checkout / pay-action capture at 375–430 px and a booking-deposit
   capture from a business that actually offers bookings.
5. A decision on the manual key-rotation procedure (acceptable to launch with,
   but it must be written into operations).
