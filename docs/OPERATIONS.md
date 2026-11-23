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

## Personalisation and sample content

`spec.sampleContent` records which groups still came from Plattr's trade seed.
Saving changed business details clears the matching flags; saving a changed
catalogue clears the menu/offers flags. `POST
/api/projects/:token/personalise/clear-samples` requires the owner session, a
same-origin JSON request and the explicit confirmation phrase
`remove-sample-content`. It clears only groups still flagged, so an owner-edited
catalogue or details survive. Photos and the document layout are never deleted
by this action.

## Backup and rollback

- Content rollback: the last 20 design versions are listed and restorable from
  the editor (`/api/projects/:token/doc/versions`). Restoring is a normal save
  and can itself be undone in the session.
- Data recovery: D1 point-in-time recovery is a Cloudflare provider operation,
  not an automated application job. Media lives in R2 and must be included in
  the provider backup policy.
- Deployment rollback: versions and statuses are recorded on the build page, but
  rolling a Worker deployment back is a provider/dashboard operation.
- Offsite backup: `scripts/offsite-backup.mjs` exports D1, scrubs it, copies
  every media variant named by a row and uploads the run to a separate bucket,
  then reads every file back and compares checksums before marking the run
  verified. `scripts/offsite-fetch.mjs` fetches a run for restore. Retention and
  the audit index live in the backup bucket. The full procedure, the RPO/RTO
  targets, monitoring and the remaining gaps are in
  `docs/PRODUCTION_DISASTER_RECOVERY.md`.
- Production D1/R2 now exists, but that job is **not running**: this repository
  has no git remote, production `--remote` has not been executed against the
  Sites account, and no scheduler or alert owner is configured. It is rehearsed
  against local Wrangler state and the separate staging environment only.

## Owner access

The customer app token and the owner credential are deliberately separate. A
public app link opens the customer experience but **cannot** read the dashboard,
change order status, edit app settings or use the dashboard catalogue endpoint.

- The owner key is derived from a server secret (`OWNER_SECRET`, falling back to
  `STUDIO_KEY` locally) and the project token, so every build has a distinct
  credential without storing a plaintext key.
- It is shown only on the operator-authenticated `/studio` board, under **Owner
  access**, to be sent to the business owner out of band.
- Exchanging it at `/p/:token/dashboard/login` creates a random session in D1 and
  an HttpOnly, SameSite=Lax cookie. The cookie has a project-specific name and is
  scoped to the origin root, so both dashboard pages and `/api/projects/...`
  calls can use it without two owners in one browser overwriting each other.
  Sessions last 30 days absolute and expire after 7 idle days. **Sign out**
  revokes one browser; **Sign out everywhere** revokes every session.
- Dashboard pages redirect to the owner login. Dashboard data, status changes,
  catalogue writes and app settings return `401 owner_auth_required` without a
  session. The editor and review page redirect to login, and every
  `/api/projects/:token/*` route is behind the same check.
- Login is capped at 10 attempts per project and connection per day. Public
  order, booking and enquiry writes are capped at 30, 15 and 10 per project and
  connection per day, with `429` and `Retry-After` when exhausted. Media uploads
  are capped at 40 per project and connection per day.

`OWNER_SECRET` (or the local `STUDIO_KEY` fallback) must be supplied as a real
secret in production. Local QA uses a gitignored `.dev.vars`; without either
binding the dashboard says owner access is not configured and returns 503.

This closes the reported token-authorization weakness for owner operations. It
is still not a full account system: there is one owner credential per build, no
named team roles, no password reset and no per-user audit trail. Production
still needs owner accounts, team roles, audit entries for cancellations/refunds,
and key rotation. The visual editor remains a private build capability for the
studio and owner-designer workflow, separate from the customer link.

Live verification: unauthenticated dashboard API `401`, owner login reaches the
dashboard, and the same session reads `/api/projects/:token/dashboard` with
`200`. The regression suite covers the same split.

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
enquiries, dashboard module gating and application settings. It also proves that
the customer token cannot open the dashboard or mutate an order, and that a valid
owner login is required. It does not mock success responses; assertions read the
stored rows and the dashboard payload.
