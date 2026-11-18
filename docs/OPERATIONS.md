# Operating architecture

The product is three separate surfaces sharing one scoped data layer.

| Surface | URL | Who uses it | Purpose |
| --- | --- | --- | --- |
| **A. Plattr Studio** | `/studio`, `/brief`, `/p/:token`, `/p/:token/edit` | Plattr and the owner's designer | Generate, design, photograph, review and publish the app |
| **B. Business dashboard** | `/p/:token/dashboard` | The business owner and staff | Run orders, bookings, enquiries, catalogue, offers, customers and settings |
| **C. Customer app** | `/p/:token/app` | The business's customers | Browse, search, order, book, enquire and check status |

They do not share a layout or navigation. The dashboard is not a tab in the
visual editor, and the customer app has no owner controls.

## Shared data and permissions

Every business record carries `project_id`. Reads and writes are always scoped by
the project resolved from the private token, never by a client-supplied project
id.

| Data | Written by | Read by | Owner can change |
| --- | --- | --- | --- |
| Project, spec, catalogue, offers | Studio / dashboard catalogue API | App, dashboard, editor | Yes |
| Document, design, media refs | Visual editor | App, editor | Yes |
| Media objects and metadata | Editor upload | App via token-scoped media URL | Yes, with live-reference protection |
| Orders and order items | Customer app checkout endpoint | Customer status lookup, dashboard | Status only; prices come from server catalogue |
| Bookings | Customer app request endpoint | Customer status lookup, dashboard | Status only |
| Customers | Checkout/booking/enquiry (guest) | Dashboard | Not edited in this slice |
| Enquiries | Customer contact/quote form | Dashboard | Status |
| Notifications | Business events | Dashboard outbox | Provider setup not yet connected |

The app never receives merchant credentials, other customers' data, owner notes
or the full dashboard payload. The dashboard never writes the design document.

## Owner access

The current model is a **private capability URL**: possession of the project's
random edit token grants owner access. It is the same model already used by the
studio review and editor links. It is adequate for this local milestone but it
is not an account system.

Production needs:

- Owner accounts with a session cookie, passwordless email or SSO.
- Team roles (`owner`, `manager`, `staff`) and permission checks on every
  dashboard mutation.
- Audit log entries for refunds, cancellations and data exports.
- Token rotation and revocation; a leaked dashboard URL currently exposes
  customer contact details and operations.

Until then the dashboard must be treated as a private link and not shared with
customers. The footer says so.

## Customer authentication assessment

**Not required to browse, search, place a guest order, request a booking or send
an enquiry.** Forcing registration before those actions would reduce conversion
and is unnecessary for a single-business app.

Order and booking history currently works through **device-held capability
ids**: the app stores the returned order/booking id in local storage and can read
that record's status from the server. The ids are random and scoped to the app
token. This gives a usable confirmation/history flow without asking for a
password, but it is not portable across devices and is not protection against
someone using the same unlocked device.

A future optional account should add:

- Passwordless email magic-link login (no password recovery burden).
- A verified email/phone claim that links guest orders and bookings by matching
  the contact used at checkout.
- A server session scoped to the business app, not a global Plattr customer
  identity.
- Profile, order history, booking history and saved items.
- Account deletion and data export, with the business as controller and Plattr
  as processor.

Do not add passwords, social login or a central Plattr customer account before
the owner account and notification infrastructure exist. Guest checkout and
capability history are the safe default for this milestone.

## Dashboard modules by trade

`src/worker/business.ts` computes the module set from the project's enabled
features:

| Module | Visible when |
| --- | --- |
| Overview | Always |
| Orders | `ordering` enabled |
| Bookings | `booking` enabled |
| Products & services | Always |
| Categories | Always |
| Customers | Always |
| Enquiries | Always (contact/quote forms write here) |
| Offers | `offers` enabled |
| Sales & analytics | Ordering or booking enabled |
| Application settings | Always |

This is enforced in the rendered dashboard and the APIs still verify the
feature before creating an order or booking.

## Status transitions

Orders: `new → preparing → ready → completed`, with `cancelled` allowed before
completion. Bookings: `requested → confirmed → completed`, with cancellation
before completion. Enquiries: `new → replied → closed`. Invalid jumps return
`409`; a UI button is not proof that a transition is valid.

## Testing

`tests/business.test.ts` exercises real HTTP requests against a memory D1:
order creation with server-side pricing, guest validation, disabled trades,
cross-origin rejection, status transitions, bookings with staff/service,
enquiries, dashboard module gating and application settings. It does not mock
success responses; assertions read the stored rows and the dashboard payload.
