# Functional audit: 27 trade categories

Audited against the generated customer app and the owner dashboard. A feature is
**functional** only when it writes real data that another surface reads back.
Rendering a button, showing a toast, or storing something only in one browser is
not counted as functional.

## Status key

| Status | Meaning |
| --- | --- |
| **Functional** | Customer action creates or reads a D1-backed record; the owner dashboard reads or updates the same record. |
| **Partial** | The core action is real, but a business capability needed to operate it is missing (availability, inventory, fulfilment, payouts, access provisioning). |
| **Presentation** | Seeded content, a visual affordance or local-only state; no business record is created. |
| **Not implemented** | The feature is absent. |

## Trade matrix

| Trade | Commerce | Bookings | Enquiries | Presentation-only / not implemented |
| --- | --- | --- | --- | --- |
| Restaurant | **Functional** — menu, cart, guest checkout, status | **Partial** — table request, no table inventory | **Functional** — contact/quote form | Table allocation; reviews |
| Café & bakery | **Functional** — menu, cart, pickup | — | **Functional** — contact form | Reviews |
| Shop & retail | **Functional** — catalogue, search, cart, checkout | — | **Functional** — contact form | Delivery is a flat-fee request, not dispatch tracking |
| Salon & spa | — | **Partial** — service, date/time, optional staff, owner confirmation | **Functional** — contact form | Staff calendars and double-booking prevention |
| Gym & studio | — | **Partial** — session/appointment request | **Functional** — contact form | Class timetable is display-only; class capacity not implemented |
| Clinic & health | — | **Partial** — appointment request | **Functional** — quote/contact | Clinical intake and triage not implemented |
| Trades & home services | — | **Partial** — visit request, flagship call-out booking | **Functional** — quote/contact | Job scheduling, route planning and engineer assignment |
| Professional services | — | **Partial** — appointment request | **Functional** — quote/contact | Document upload and engagement letters |
| Property & estate agency | — | **Partial** — viewing request | **Functional** — quote/contact | Listing availability and offer workflow |
| Hotel & guesthouse | — | **Partial** — stay request, no room inventory | **Functional** — quote/contact | Room types, availability calendar, deposits |
| Creative studio | — | **Partial** — shoot/consultation request | **Functional** — quote/contact | Contracts and deliverables |
| Garage & auto | — | **Partial** — service request, flagship slot picker | **Functional** — quote/contact | Vehicle records, registration lookup and workshop scheduling |
| Hospital & health | — | **Partial** — appointment request | **Functional** — quote/contact | Departments, bed/clinical systems, insurance |
| Online store | **Functional** — catalogue, cart, guest checkout, flat $2.99 delivery | — | **Functional** — contact form | Delivery tracking and free-delivery thresholds; tax calculation |
| Indoor plant shop | **Functional** — catalogue, cart | — | **Functional** — contact form | Delivery tracking |
| Garden centre | **Functional** — catalogue, cart | **Partial** — visit/appointment request | **Functional** — contact form | Delivery tracking |
| Online courses | **Partial** — course detail, enrolment checkout creates an order | — | **Functional** — contact form | Course access, lesson delivery, progress and certificates |
| Tuition centre | — | **Partial** — assessment/visit request | **Functional** — contact form | Tutor allocation and progress records |
| School | — | **Partial** — visit request | **Functional** — contact form | Admissions workflow; classes/events are display-only |
| Kindergarten | — | **Partial** — visit request | **Functional** — contact form | Places, ratios and fee collection |
| Financial services | — | **Partial** — appointment request, flagship disclosure panel | **Functional** — quote/contact | Regulated onboarding, suitability checks and advice records |
| Business agency | — | — | **Functional** — quote/contact | Project delivery and retainers |
| Influencer & creator | — | — | **Functional** — quote/contact | Media kit analytics and campaign tracking |
| Personal portfolio | — | — | **Functional** — quote/contact | Commission workflow and rights management |
| Film & production | — | **Partial** — screening/booking request | **Functional** — contact form | Rights, screening inventory and ticketing |
| Art gallery | — | **Partial** — visit request | **Functional** — contact form | Artwork inventory and consignment |
| Marketplace | **Partial** — cart and checkout across vendors | — | **Functional** — contact form | Vendor onboarding, split settlement, per-vendor payouts |

Batch 3 (trades, auto, ecommerce, courses, finance) added flagship
compositions but did not change any status: the customer actions are the same
real D1 records, now reached through a trade-specific journey. The finance
disclosure panel is template copy, not regulated advice or a suitability check.
Course enrolment creates an order; it does not yet provision lesson access.

## What is genuinely shared

These work across every trade and are not tied to a vertical:

- **Catalogue browsing, search and item details** read the owner's current
  catalogue.
- **Offers** are displayed from the same catalogue record the dashboard edits.
- **Media** is uploaded, converted and delivered through R2 with private,
  token-scoped URLs.
- **Orders, bookings and enquiries** are D1 records with owner status changes
  and customer status lookup.
- **Dashboard modules** are gated by trade: a salon does not see Orders; a shop
  does not see Bookings; Offers only appears when the app offers them.

## Deliberately not implemented

- Customer registration/login/password recovery. Browsing and enquiries are
  guest-first; orders and bookings support guest checkout. Device history uses
  capability IDs (see `docs/OPERATIONS.md`), not accounts.
- Payment capture. Orders are explicitly `unpaid`; the customer app says to pay
  the business. See `docs/PAYMENTS.md`.
- External email/WhatsApp/push delivery. Notifications are queued in an outbox;
  no provider is connected. See `docs/NOTIFICATIONS.md`.
- Loyalty stamps are local device state and are not fraud-resistant.
- Reviews are not persisted; the review control remains a local confirmation.
- Table/room/class inventory, delivery dispatch, marketplace payouts, course
  access and staff calendars remain future work.
