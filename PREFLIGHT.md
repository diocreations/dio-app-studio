# Production preflight

Run after the daily hosting allowance resets (2026-11-19 00:00 UTC). Confirm the
Sites panel no longer says "paused" before starting; every provisioning call is
refused while it does.

## 1. Provision (no deployment yet)

1. `sites_add_storage` — production, kind `d1`, binding `DB`.
2. `sites_set_secret` — production, `STUDIO_KEY`, value file `.studio-key`
   (never paste the key into chat, a commit, or a variable).
3. Set `CONTACT_EMAIL` in Sites → Variables if the privacy page should publish a
   deletion address. It is public information, not a secret.
4. `sites_inspect` production: `bindings` should list `DB`, and the secret name
   should appear. Still `deployed_at: null`.

## 2. Gate the code

```sh
git status --short        # must be empty
bun run typecheck
bun test
bun run build
```

All three must pass on the exact commit being deployed. `dist/client` must
contain `favicon.ico`, `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`
and `og.png`.

## 3. Deploy, then publish on explicit go-ahead

1. `sites_deploy` production with `deploy.json`; wait for a `succeeded` receipt.
2. A deploy to an unpublished environment stays offline. `sites_inspect` should
   show the deployment but `published: false`.
3. Only with the owner's word: `sites_set_published` production, `published: true`.
4. `sites_inspect` again and confirm `published: true` before calling it live.

## 4. Smoke test the live origin

- `GET /api/health` → `{"ok":true,"service":"plattr"}`
- `/`, `/brief`, `/privacy` → 200; `/terms` → 301 to `/privacy`
- `/robots.txt` → four disallows and a **production** sitemap URL
- `/sitemap.xml` → three absolute production URLs
- `/og.png` → `image/png`, 1200×630; all three icons → 200
- `/p/not-a-token` → 404 **with** `X-Robots-Tag: noindex, nofollow`
- `/studio` → 401 (not 503: that would mean `STUDIO_KEY` did not attach) and the
  board must not render any customer row without the key
- Create one build from `/brief`, confirm it opens at its `/p/:token` link, open
  `/p/:token/edit`, add a section, confirm autosave says Saved, reload and see
  the section still there; then delete the probe from `/studio` and clear its
  counters

## 5. If something is wrong

- Take it offline immediately: `sites_set_published` with `published: false`
  (stops serving in under 30 seconds, keeps data, secrets and the URL).
- Fix, rerun section 2, redeploy, republish.
- Code rollback: the git history in this folder (oldest useful point is the
  initial commit); data rollback: deletion is manual from `/studio`, so export
  anything precious before experimenting on production.

## Do not

- Deploy from a dirty tree or with failing tests.
- Put `STUDIO_KEY` in `wrangler.jsonc`, `deploy.json`, a variable, or this file.
- Announce before `CONTACT_EMAIL` is decided and the live smoke test passes.
