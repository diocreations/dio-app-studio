# Production deployment checklist

Use this before a production release. Nothing below authorizes a deploy by
itself; production publishing needs explicit owner approval.

## 1. Configuration and secrets

- [ ] `DB` D1 binding points at the production database, not the local miniflare
      file.
- [ ] `MEDIA` R2 binding points at a private production bucket.
- [ ] `OWNER_SECRET` is set as a Worker secret (not `STUDIO_KEY`) and is at least
      32 random bytes. Rotating it invalidates every derived owner key.
- [ ] `STUDIO_KEY` is set separately for the operator board, or the board stays
      closed.
- [ ] `CONTACT_EMAIL` is set if the privacy page publishes a contact address.
- [ ] `PEXELS_API_KEY` is optional; without it the local flagship library is used.
- [ ] No `.dev.vars`, `.env`, local sqlite file, owner key or edit token is in the
      uploaded assets or Git.
- [ ] `robots.txt` is intentional: `/studio`, `/p/`, `/api/`, `/demo/` and
      `/health` stay disallowed.
- [ ] Customer builds keep `noindex, nofollow`; a production app must opt in to
      indexing explicitly, not inherit a development default.

## 2. Database and media

- [ ] Run the schema against a restored copy first. `ensureSchema` is idempotent;
      the `owner_sessions.last_seen_at` and `projects.doc` migrations are both
      additive.
- [ ] Snapshot the production D1 database before the deploy and record the
      backup id.
- [ ] Snapshot the R2 bucket or rely on the bucket replication policy; record the
      object count.
- [ ] Check no project still has `sampleContent` true unless it is intentionally
      a demo. The dashboard panel and `clear-samples` are the supported path.
- [ ] Confirm sample/demo credentials are not embedded in a customer app. The
      app reads only its own token-scoped project spec.

## 3. Hosting and cache

- [ ] Attach the custom domain and verify the canonical origin.
- [ ] SSL is active and HSTS is set by the host/CDN, not by this Worker.
- [ ] Static assets use the provider's immutable cache policy; HTML and API
      responses remain `no-store` or `private`.
- [ ] `/health` returns `200 {"ok":true,"db":"up"}` from the production origin.
- [ ] `/p/:token/app` returns 200 and a known build still renders.
- [ ] `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and
      `X-Robots-Tag` are present on HTML and media responses.
- [ ] No CSP is claimed yet; inline styles/script mean hashes or nonces are still
      required before enforcing one.

## 4. Monitoring and limits

- [ ] Error monitoring is connected at the host/Worker level. This repository
      logs server errors but has no external error sink.
- [ ] Rate limits are live: owner login 10/day, orders 30/day, bookings 15/day,
      enquiries 10/day, media uploads 40/day, builds 3/visitor/day and 40/day
      globally. Confirm a 429 has `Retry-After`.
- [ ] Import cap is set intentionally (`IMPORT_DAILY_CAP`).
- [ ] D1/R2 quota alerts are configured with the provider.

## 5. Rollback

- [ ] Previous Worker deployment is recorded and can be promoted again.
- [ ] Previous D1 backup is restorable and the media snapshot is available.
- [ ] The editor's last 20 document versions are present; restoring a version is
      a normal save and can be undone.
- [ ] A post-deploy smoke test covers home, app, owner login, dashboard, one
      booking and one enquiry.
- [ ] Owner sessions are revoked after an emergency credential rotation with
      **Sign out everywhere**.

## 6. Evidence to attach

- Typecheck, full test run and production build output.
- DB backup manifest and restore rehearsal output.
- Media snapshot checksum and object count.
- `/health` response.
- Five-app width matrix and Lighthouse reports.
- Confirmation that no production deploy was performed without approval.
