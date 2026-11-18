# Notifications

## Current state

The business layer writes a **notification outbox** row for every meaningful
customer event. The dashboard shows the queue, its recipient and its status.
No provider is connected in this environment, so rows remain `queued`; nothing
is sent, and the UI does not claim a message was delivered.

```
notifications
  id, project_id, kind, recipient ('owner'|'customer'),
  channel ('email'|'whatsapp'|'push'), status ('queued'|'sent'|'failed'),
  payload, created_at
```

Events already queued:

- `order.created` to the owner, `order.confirmation` to the customer when an
  email address was supplied.
- `order.preparing`, `order.ready`, `order.completed`, `order.cancelled` to the
  customer by email when they supplied one.
- `booking.created` to the owner, `booking.confirmation` to the customer when an
  email address was supplied.
- `booking.confirmed`, `booking.completed`, `booking.cancelled` to the customer
  by email when they supplied one.
- `enquiry.created` to the owner.

No WhatsApp or push notification is queued: those channels require an explicit
opt-in record, which the current guest flow does not collect.

## Delivery architecture

A scheduled Worker (or queue consumer) should drain the outbox:

1. Select `queued` rows in batches with `FOR UPDATE`-style leasing or a claimed
   status, oldest first.
2. Resolve the business's provider configuration and template.
3. Send with an idempotency key derived from the notification id.
4. Record `sent`, provider message id and timestamp, or `failed` with a bounded
   retry count and a non-sensitive error code.

The outbox is deliberately separate from order writes: a provider outage must
not fail a customer's order.

## Channels and consent

| Channel | Provider options | Required configuration |
| --- | --- | --- |
| Email | Resend, Postmark, Amazon SES | Verified sending domain, from address, provider API key, bounce handling |
| WhatsApp | Meta WhatsApp Cloud API | Business phone number id, approved templates, opt-in records, provider token |
| Push | Web Push (VAPID) or FCM | App service-worker subscription, VAPID keys or Firebase project, per-device consent |

Consent rules:

- Transactional email tied to an order the customer placed may be sent to the
  contact they supplied, subject to local law and the business's privacy notice.
- WhatsApp and push require explicit opt-in. A WhatsApp template must be
  approved for the business, not a generic Plattr template with Plattr branding.
- Marketing messages (offers, re-engagement) are separate from transactional
  messages and require a separate, recorded consent that can be withdrawn.
- Every message must identify the business and provide a way to stop
  non-essential messages.
- Do not send to a shared Plattr address. The business's own reply-to and
  support contact must be used.

## Provider ownership

The **business** owns the sender identity and the customer relationship. Plattr
may operate a shared sending domain for deliverability, but the visible from
name, reply-to and content are the business's. Provider accounts and API keys
are server-side secrets, never embedded in a generated app or committed to the
repository.

## Not yet implemented

- Provider adapters, template rendering, retry scheduler and delivery webhooks.
- Per-business notification preferences in the dashboard.
- Customer notification preferences and unsubscribe records.
- Push subscription storage.
- SMS as a fallback channel.

Until these exist, the app shows confirmations inside the customer experience
and the dashboard shows the queued outbox; it never shows a false "email sent"
confirmation.
