# Payment architecture

## Decision

**Payments belong to the business, not to Plattr.** No customer payment may be
collected into a central Plattr account by default. The generated app creates an
order in the business's own payment account, or in the business's connected
merchant account. Plattr may charge the business a platform fee separately, but
it is not the merchant of record for customer payments.

Payments are **not implemented** in the current build. Orders are created with
`payment_status = 'unpaid'` and the customer app says to pay the business on
collection or delivery. No card details are collected, stored or logged.

## Ownership, settlement and refunds

| Concern | India (Razorpay) | International (Stripe) |
| --- | --- | --- |
| Merchant of record | The business | The business |
| Account | Business's Razorpay account, or a Razorpay Route linked account | Business's Stripe Connect account (Express or Standard) |
| Checkout owner | Order created against the business account, not a Plattr account | PaymentIntent created with `Stripe-Account: acct_...` (direct charge) or destination charge to the connected account |
| Settlement | Razorpay settles to the business's bank account | Stripe pays out to the connected account's bank account |
| Refunds | Business initiates in its Razorpay dashboard; API refund uses the business account | Refund on the connected account, reversing the transfer for destination charges |
| Plattr fee | Separate invoice/retainer, or an explicit Route application fee agreed in writing | Separate invoice/retainer, or an explicit `application_fee_amount` agreed in writing |
| Tax invoice | Issued by the business (GST details are the business's) | Issued by the business under its own tax registration |
| Disputes/chargebacks | Business's account and evidence | Connected account's responsibility; platform only handles application-fee reversal where applicable |

Plattr must never use `sk_live_...` or a platform merchant account to receive
the customer's price and then manually forward funds. That creates a central
collection model, changes the merchant of record, and creates settlement and
regulatory obligations Plattr is not set up for.

## Required setup before code

1. The owner signs up with Razorpay (India) or completes Stripe Connect
   onboarding (international), including KYC and a payout bank account.
2. The business confirms its legal name, currency, tax registration and refund
   policy. These appear on the customer receipt.
3. The provider approves the integration and the platform's Connect/Route
   arrangement.
4. Credentials are stored as server-side secrets, never in a generated app, D1
   metadata, browser storage or the repository. The app only receives a public
   client key and a short-lived payment intent/order id.

Until all four exist, the build stays in **pay-on-collection** mode.

## Proposed data model

```
business_payment_accounts
  project_id, provider ('razorpay'|'stripe'), account_ref,
  mode ('test'|'live'), currency, charges_enabled, payouts_enabled,
  status ('pending'|'active'|'restricted'), created_at, updated_at
  UNIQUE(project_id, provider, mode)

payment_attempts
  id, project_id, order_id, provider, provider_order_id,
  provider_payment_id, amount, currency, status
  ('created'|'authorized'|'captured'|'failed'|'refunded'|'partially_refunded'),
  idempotency_key, created_at, updated_at
```

Provider secrets live in the server environment or a secret manager keyed by
project; only account references and non-secret status are stored in D1. The
`orders` table gains `payment_status` (`unpaid`, `authorized`, `paid`,
`refunded`, `partially_refunded`) only when the provider integration exists.

## Flow

1. The customer submits the cart. The server recomputes every line from the
   owner's catalogue; a browser total is never trusted.
2. The server checks the business has an active, charges-enabled account and a
   supported currency.
3. The server creates a Razorpay order / Stripe PaymentIntent on that account
   with a stable idempotency key and stores a pending attempt.
4. The client completes the provider's hosted UI (Razorpay Checkout or Stripe
   Payment Element). No card data touches Plattr.
5. The provider webhook, signature-verified with the business-specific secret,
   is the source of truth. A redirect alone does not mark an order paid.
6. On capture, update `orders.payment_status` and the attempt; queue the customer
   receipt and owner notification. On failure, leave the order unpaid and show a
   retry path.

## Refunds and cancellation

- The owner dashboard may request a full or partial refund only through the
  business's connected account.
- Refund idempotency is keyed on the order, amount and a dashboard request id.
- A cancelled unpaid order needs no refund. A cancelled paid order requires an
  explicit refund action; it must not silently mark the order cancelled.
- Webhook events `refund.updated` / `charge.refunded` reconcile the final state.
- The customer sees the business's refund policy and the business's support
  contact, not a Plattr-branded financial promise.

## Security requirements

- Verify webhook signatures (Razorpay `X-Razorpay-Signature`, Stripe
  `Stripe-Signature`) against the raw body and the correct account secret.
- Verify amount, currency and account on every webhook before changing an order.
- Use idempotency keys for create/refund calls and reject replayed events.
- Never expose provider secret keys to the app or dashboard.
- Log provider event ids, not card data or full webhook payloads containing
  personal data.
- Restrict refund actions to the verified owner session/team role when owner
  accounts replace the current token capability.
- Keep a clear test/live separation; test mode must never settle real money.
