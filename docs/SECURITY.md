# Owner authentication and API authorization

## Current model

- **Customer app capability:** `/p/:token/app` is public and carries only the
  project token. The customer app calls public `/p/:token/orders`,
  `/p/:token/bookings` and `/p/:token/enquiries`; those routes are rate-limited,
  same-origin checked and scoped to that project.
- **Owner credential:** an owner key derived from the project token and
  `OWNER_SECRET` (HMAC, not stored in D1). It is exchanged at
  `/p/:token/dashboard/login` for a random `own_` session in `owner_sessions`.
- **Owner session:** `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS, 30-day
  absolute lifetime, **7-day idle expiry**. The idle timestamp is refreshed at
  most hourly. The cookie name is project-specific.
- **Editor and private build pages:** `/p/:token/edit` and `/p/:token` now
  redirect to the owner login unless a valid session exists.
- **Every `/api/projects/:token/*` route:** protected by one middleware in
  `src/worker/index.ts`. That includes documents, versions, AI proposals, media
  list/upload/replace/delete, catalogue, notes, approval, status changes,
  settings and sample removal. A customer app token alone gets `401`.
- **Revocation:** sign out deletes one session; **Sign out everywhere** deletes
  every session for the project. Both clear the cookie and write an activity
  entry.
- **Audit trail:** sign in, sign out, revoke-all, catalogue saves, settings
  changes, sample removal, order/booking/enquiry status changes and build
  creation write to `activity` with a timestamp.
- **Cross-site writes:** every owner mutation checks `Origin` when it is present;
  the session cookie is `SameSite=Lax`. The dashboard forms post same-origin.

## Authorization review

| Surface | Auth | Scope |
| --- | --- | --- |
| `GET /p/:token/app` | public | project token; read-only render |
| `POST /p/:token/orders` | public | project token, 30/day, same-origin |
| `POST /p/:token/bookings` | public | project token, 15/day, same-origin |
| `POST /p/:token/enquiries` | public | project token, 10/day, same-origin |
| `GET /p/:token/media/:id/:file` | public | token + media id scoped to project |
| `GET /p/:token`, `/edit` | owner session | project ID from token, redirect otherwise |
| `GET /p/:token/dashboard` | owner session | project ID from token |
| `GET/PUT/POST/DELETE /api/projects/:token/*` | owner session middleware | project ID resolved from token |
| `PATCH /api/projects/:token` | owner session | project ID resolved from token |
| `POST /api/projects` | public, rate-limited | creates a new project and its first owner session |
| `/studio` | `STUDIO_KEY` | operator board |
| `/health` | public | liveness and D1 `SELECT 1`, no data |

Tests cover: a customer token cannot read the owner dashboard, cannot open the
editor, cannot read the document API and cannot write the catalogue; one
business cannot read or mutate another's orders; cross-origin writes are
refused; idle sessions expire; revoke-all invalidates every session.

## Indexing policy

Customer apps default to `noindex, nofollow` in both the meta tag and
`X-Robots-Tag`. The owner can deliberately enable indexing in **Application
settings**; only then does the app emit `index, follow`. The owner dashboard,
review page, editor, media library and API remain `noindex`. `robots.txt`
disallows `/studio`, `/p/`, `/api/`, `/demo/` and `/health`.

## Remaining limitations

- There is one shared owner key per project, not named owner accounts or roles.
  A proper identity provider or per-user credentials is still outstanding.
- Key rotation is all-or-nothing by rotating `OWNER_SECRET`; per-project token
  rotation with an overlap window is not implemented.
- The audit trail has no actor identity or IP because there is only one owner
  principal. It is an activity log, not a tamper-evident audit system.
- CSRF uses origin checks and `SameSite=Lax` rather than per-form tokens.
- There is no CSP yet; inline styles and scripts require nonces or hashes before
  enforcing one.
- Sessions are stored in D1, so a D1 outage prevents owner sign-in. Customer app
  reads do not depend on sessions.
- No production secret is configured in this workspace; production must supply
  `OWNER_SECRET` and `STUDIO_KEY` as Worker secrets.
