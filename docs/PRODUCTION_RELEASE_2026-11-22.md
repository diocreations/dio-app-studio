# Plattr production release — 22 November 2026

## Live origin

**https://plattr-studio-67t93q.freebuff.page**

Sites project `c3f5b2a4-7d61-4e08-9b2a-1f6c8d4e5a70` (production
`57f8830f-daaa-4fd7-9e67-2cfaaa711461`). The release was deployed with the
existing `deploy.json` Worker-plus-assets manifest. Production is published;
preview is `https://plattr-studio-67t93q-preview.freebuff.page`.

Release snapshot: `.wrangler/releases/plattr-production-2026-11-22.tar.gz`;
its sha256 is written beside it as
`.wrangler/releases/plattr-production-2026-11-22.tar.gz.sha256`.

## Production resources

| Resource | Binding | Provider id | State |
| --- | --- | --- | --- |
| D1 | `DB` | `ff79d0e4-9531-421d-a450-8893d98d4fa6` | Fresh production database; schema created by the Worker |
| R2 | `MEDIA` | `site-8cdb85f5b99a4d329b746a39f1484c44` | Private media bucket; upload/variant delivery verified |
| Owner secret | `OWNER_SECRET` | Worker secret | 32 random bytes, generated for this release |
| Operator secret | `STUDIO_KEY` | Worker secret | Separate random value for `/studio` |

The secret files are local, mode `600`, at `.wrangler/production-secrets/`.
They are not committed or included in the release snapshot. Rotating
`OWNER_SECRET` invalidates every derived owner key.

## What was verified

Executed against the deployed production origin, not a local mock:

- `/health` returns `200 {"ok":true,"db":"up"}`; `/` is `200` with CSP, HSTS,
  `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`.
- A disposable project was created, previewed privately, approved, published,
  edited to version 2, re-approved, re-published, and served at its stable
  `/p/:token/app` URL. The smoke project was then deleted; the studio reports
  “No builds”.
- Private app and public-write gate: before publication `/app` is `404`; the
  owner session still sees it; after publication it is `200`; after unpublish it
  is `404` again. Dashboard access without a session redirects to login.
- Owner authentication: wrong owner key `401`, correct key creates a dashboard
  session, dashboard contains a submitted customer enquiry, and sign-out
  redirects the dashboard back to login.
- Discovery: `POST /api/discover` on `https://books.toscrape.com/` read 10 pages
  and returned three distinct concepts with no blockers.
- Customer write: same-origin professional enquiry `201`; cross-origin enquiry
  `403`; dashboard showed the enquiry.
- R2: WebP original plus 320/640 variants uploaded (`201`); 320 and 640 delivery
  returned `200 image/webp`; project deletion removed the studio row.
- Editor/API persistence: `PATCH /api/projects/:token` saved version 2 and
  cleared publication; the app was private until re-approved and re-published;
  the edited name appeared in the public app after publication.
- `bun run typecheck` passed, `bun test` passed **761/761**, and
  `bun run build` passed with a **5.6 MiB** deploy asset tree.

Not executed: a headless-browser DOM pass, mobile/desktop screenshot review, a
real payment, hotel booking, or an outbound email/webhook. The HTTP journey is
verified; the UI itself was not clicked through or visually inspected.

## Publishing gate

`projects.published_at` is the public gate. Public app, cards, media, manifest,
service worker, icon, orders, bookings and enquiries are unavailable with
`404` unless the project is published or the request has the owner session.
`status` remains the review state. Saving a rebuild clears `published_at`, so an
unapproved edit cannot silently replace the live copy; the owner approves and
publishes the new build. Unpublishing retains all rows, versions and media.

## Operational state

**Working:** production deployment, D1 schema, R2 media, HTTPS, CSP/security
headers, owner/operator auth, connect-timeout-free schema fast path, discovery,
three concepts, review, editor API, publish/unpublish, customer app, dashboard,
enquiries, rate limits and delete-with-media cleanup.

**Not implemented / not verified:**

- Self-serve named owner accounts, password reset, team roles and per-user audit.
  Owners use a per-project key derived from `OWNER_SECRET`.
- Custom domain and DNS. The freebuff.page origin and its TLS certificate work;
  no customer domain was supplied or attached.
- Automated off-site database/media backup, a tested production restore, an
  external uptime monitor, error alerting, a backup heartbeat and a named alert
  owner. The repository has the procedures and the local/staging rehearsals;
  none is scheduled against this production account.
- Hotel/accommodation creation is rejected by the public project API
  (`422 trade_unavailable`), and live payments remain disabled because no
  gateway is connected. The renderer and booking model remain in the codebase
  for a later release.
- Invite-only onboarding. `/brief` remains the public entry point, and there is
  no account or invitation gate yet.

## Owner action

1. Keep `.wrangler/production-secrets/OWNER_SECRET` and `STUDIO_KEY` safe. To
   enter the operator board, use `STUDIO_KEY` at `/studio`; project owner keys
   are shown there after unlock.
2. Confirm whether `https://plattr-studio-67t93q.freebuff.page` is the launch
   origin or supply the custom domain and DNS access to attach it.
3. Name an alert recipient and a host for the daily backup job before inviting
   real businesses. Until then, do not promise recovery or uptime.
4. Keep `/brief` private or accept that anyone can create a build; there is no
   invitation gate yet.

## Rollback

Rebuild from the release snapshot and run `sites_deploy` against the previous
manifest; Site deployments and the release archive are the rollback source.
The schema changes are additive (`schema_meta`, `projects.published_at`) and the
current Worker tolerates the previous schema. A database rollback still requires
a provider-side D1 restore, which is not yet configured here.