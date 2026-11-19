# Payments — architecture and webhook setup

Plattr's payment integration is **optional and shared by every trade**. A business
connects its own Razorpay or Stripe account; customers pay that business
directly. Plattr is not the merchant of record and never holds customer funds.

No gateway, no change: orders, enquiries, booking requests and pay-on-collection
keep working exactly as before.

## Architecture

```
generated app (any trade)
   │  POST /p/:token/payments/start  { kind: "order" | "booking", refId }
   ▼
shared payment service  src/worker/payments/service.ts
   ├── resolves the record and its amount from D1 (never the browser)
   ├── checks the project's active gateway, mode and currency eligibility
   ├── creates a Razorpay order or Stripe Checkout Session server-side
   └── stores a pending payment_transactions row
   ▼
provider hosted checkout
   │  Razorpay Checkout (signature verified, then status fetched from API)
   │  Stripe Checkout (303 redirect, return page refreshes session status)
   ▼
signed webhook  POST /p/:token/payments/webhook/:provider
   ├── verifies the raw body + signature with the project's webhook secret
   ├── records the provider event id (duplicate delivery is a no-op)
   ├── matches the transaction, then verifies amount and currency
   └── marks paid / failed / refunded and updates the order or booking
```

Trade renderers never call a provider. They only read the payment capability
(`orders`, `bookings`, `provider`, `enabled`) and show a plain Pay action. The
same service, dashboard panel and transaction table therefore work for retail,
restaurants, salons, hotels, gyms, studios and future trades.

### Provider differences in this build

| Concern | Razorpay | Stripe |
| --- | --- | --- |
| Checkout | Razorpay Checkout modal on Plattr's pay page | Stripe-hosted Checkout Session, 303 redirect |
| Currency | INR only (the catalogue currency must be INR) | USD, GBP, EUR, AUD, CAD, SGD, AED, INR |
| Credentials | Key ID + Key Secret + webhook secret | Publishable key + Secret key + signing secret |
| Verification after browser return | HMAC of `order_id|payment_id`, then fetch the payment and compare amount/currency/status | Fetch the Checkout Session and compare amount/currency/payment status |
| Refunds | `POST /payments/:id/refund`, full amount | `POST /v1/refunds` on the PaymentIntent, full amount |
| Settlement | Direct to the business's Razorpay account | Direct to the business's Stripe account |

Stripe Connect is **not** used. Keys belong to the business, charges are created
on that business's account, and payouts settle there. A Plattr fee is a separate
commercial arrangement, never a split of customer money.

Account eligibility differs by country and business type. The Test connection
button is the check: a 401/403 is reported as "the gateway rejected these
credentials", not as a Plattr outage. Never advertise both providers as
available to every business.

## Configuration

`PAYMENT_ENCRYPTION_KEY` is required to save credentials. It must be a base64
value decoding to exactly 32 bytes; generate one with:

```
openssl rand -base64 32
```

Set it as a Worker secret in production, and in `.dev.vars` locally. Without it,
gateway saves fail with `503 vault_unavailable`. Changing the key makes existing
credentials unreadable, so rotate deliberately: disconnect/reconnect each
gateway after a rotation.

No other payment secret belongs in source, `wrangler.jsonc`, client code,
browser storage, logs or the repository. The dashboard receives only masked
booleans (`hasKeySecret`, `hasWebhookSecret`).

## Data model

| Table | Purpose |
| --- | --- |
| `payment_connections` | One row per project + provider: mode, masked key id, encrypted secrets (AES-GCM), last verification, last error |
| `payment_settings` | Active provider and workflow switches: pay for orders, pay for bookings, booking deposit percentage |
| `payment_transactions` | Immutable-ish payment history: kind, order/booking reference, customer, provider ids, amount, currency, status, refund fields, checkout URL, timestamps |
| `payment_events` | Provider webhook event ids and processing status, unique per project + provider + event |

`orders` gained `payment_status`; `bookings` gained `payment_status` and
`paid_amount`. Both default to unpaid/zero and stay that way in apps without a
gateway. Partial unique indexes on `(provider, mode, provider_order_id)` and
`(provider, mode, provider_payment_id)` stop two records claiming one gateway
payment.

Secrets are encrypted with AES-GCM. The additional authenticated data binds the
ciphertext to `project_id + provider`, so a copied ciphertext cannot be replayed
for another business or gateway. Plaintext exists only in Worker memory while a
provider request is made.

## Payment options

`payment_settings` controls which workflows may start a payment:

- **Orders** — charged at the server-held order total, including delivery.
- **Bookings** — an optional deposit, calculated as a percentage (5–100) of the
  priced catalogue service selected on the booking. A booking with no priced
  service has no deposit action.
- **Active provider** — Razorpay or Stripe; only a connected provider can be
  active.

The capability is computed per request, so connecting a gateway immediately
changes the app copy and action buttons. Disconnecting removes the provider and
leaves all existing records and non-payment flows intact.

## Webhook setup

The dashboard shows the exact URL for the current origin:

```
https://<app-origin>/p/<project-token>/payments/webhook/razorpay
https://<app-origin>/p/<project-token>/payments/webhook/stripe
```

Paste the matching URL into the provider dashboard, create the endpoint with the
same signing secret entered in Plattr, and subscribe to these events.

### Razorpay

1. Razorpay Dashboard → Account & Settings → Webhooks → Add New Webhook.
2. URL: the Razorpay URL shown in Plattr.
3. Secret: the same value saved as **Webhook signing secret**.
4. Active events:
   - `payment.captured` — payment succeeded
   - `order.paid` — order fully paid (also accepted)
   - `payment.failed` — payment failed
   - `refund.processed` — refund completed
   - `refund.created` — refund accepted (shown as requested)
5. Use test-mode keys with a test-mode webhook while testing.

Razorpay signs the raw body with HMAC-SHA256 in `X-Razorpay-Signature`. Plattr
also stores `X-Razorpay-event-id`; when Razorpay omits it, a hash of the body is
used instead, so a replay still cannot be processed twice.

### Stripe

1. Stripe Dashboard → Developers → Webhooks → Add endpoint.
2. Endpoint URL: the Stripe URL shown in Plattr.
3. Events:
   - `checkout.session.completed` — session finished (paid or pending)
   - `payment_intent.payment_failed` — payment failed
   - `charge.refunded` — refund completed
4. Copy the endpoint's **Signing secret** (`whsec_...`) into Plattr.
5. For local work, forward events with the Stripe CLI and use the CLI-issued
   signing secret; a localhost URL is not reachable from Stripe's servers.

Stripe signs `timestamp.payload` in `Stripe-Signature`. Plattr rejects
timestamps outside a five-minute window, so a captured event cannot be replayed
later.

### Webhook rules

- The webhook route authenticates the project from its own token; it does not use
  the owner session. A webhook sent to another business's token cannot read that
  business's transactions.
- Signature verification happens before the body is trusted.
- An event id is inserted before processing. A duplicate delivery returns
  `{ duplicate: true }` and changes nothing.
- A paid event must match the stored amount and currency. Mismatches mark the
  attempt failed and leave the order/booking unpaid.
- A redirect or `checkout.session.completed` with an unpaid status is not proof;
  the status endpoint re-reads the provider API.
- Provider calls are made with the business's own decrypted key. No secret is
  written to logs or returned in an API response.

## API surface

Customer (token-scoped, no owner session):

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/p/:token/payments/start` | Create a checkout for `{kind, refId}`; amount from D1 |
| `GET` | `/p/:token/pay/:transactionId` | Hosted payment page / Stripe redirect |
| `GET` | `/p/:token/payment/:transactionId` | Refresh from provider, then show status |
| `POST` | `/p/:token/payments/razorpay/verify` | Verify Razorpay checkout signature and capture |
| `POST` | `/p/:token/payments/webhook/:provider` | Signed provider webhook |

Owner (owner session + same-origin on mutations + `private, no-store`):

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/projects/:token/payments` | Masked connections, settings, history, summary |
| `PUT` | `/api/projects/:token/payments/settings` | Active provider and workflow switches |
| `PUT` | `/api/projects/:token/payments/connections/:provider` | Save/update credentials (encrypted) |
| `POST` | `/api/projects/:token/payments/connections/:provider/test` | Provider credential check |
| `DELETE` | `/api/projects/:token/payments/connections/:provider` | Disconnect and erase credentials |
| `POST` | `/api/projects/:token/payments/transactions/:id/refund` | Full refund through the gateway |

`GET /api/projects/:token/dashboard` also includes the payment dashboard.

## Dashboard and customer experience

- Settings → Payments (also a top-level **Payments** nav item) has a Razorpay
  panel and a Stripe panel: key fields, mode, connection state, last verification
  and message, Save, Test connection, Disconnect, copyable webhook URL.
- Payment options control order payments, booking deposits and the active
  gateway. A deposit percentage is constrained to 5–100.
- The transaction table shows when, reference, associated order/booking,
  customer, provider/mode, amount + currency, status, refund status and a refund
  action for paid rows. From/To date, status and provider filters run client-side.
- Summary cards show collected, pending, refunded and failed.
- In the app, orders show **Pay … online** after the order is placed, and a
  priced booking shows **Pay a deposit online**. Apps with no gateway retain the
  existing wording and no payment action.
- The hosted pay page never accepts card data. It shows test-mode notice, the
  provider, the amount, the business receiving the money, the reference and the
  server-held state; Stripe pages redirect to Stripe and Razorpay opens Checkout.

## Security boundaries

- Only an authenticated owner session can configure, test, disconnect or refund.
  Every mutation also rejects a foreign `Origin`.
- All queries are scoped by `project_id`; a webhook token cannot cross projects.
- Secrets are never rendered, not even masked in HTML. The dashboard shows only
  whether a secret exists.
- Amounts come from `orders.total` or the booking's selected catalogue service;
  request bodies cannot set a price or currency.
- Card numbers, CVV and other instrument data never reach Plattr.
- Refunds are full-amount only in this build and require a paid transaction and a
  saved provider credential. A refund is only retried after a definite gateway
  refusal; a timeout, a 5xx or an unreadable success leaves it `requested` for
  reconciliation in the gateway dashboard, because the refund may already exist.

## Testing notes and limitations

Provider calls were tested with injected `fetch` doubles; there are no live
credentials in the repository. Live/test-mode success, real webhook delivery and
real refunds have **not** been verified against Razorpay or Stripe from this
environment. See `docs/PAYMENTS_REPORT.md` for the exact coverage and remaining
work (partial refunds, Stripe Connect for platform fees, provider-side webhook
retries/backoff, and multi-currency catalogue support for Razorpay).
