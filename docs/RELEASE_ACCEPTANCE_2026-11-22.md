# Production release acceptance — 22 November 2026

## Release identity

- **Source commit:** `ba7e6be261f2421dd9966a1f0302846570b64971`
- **Deployment:** `7f3f33af-b49a-4d69-993b-46e31269a087`
- **Deploy request:** `305791f2-7b09-4c81-9b1f-6daa4bd8c513`
- **Deployed at:** `2026-11-22T11:41:35Z`
- **Production URL:** https://plattr-studio-67t93q.freebuff.page
- **Sites environment:** `57f8830f-daaa-4fd7-9e67-2cfaaa711461` (`published: true`)
- **Previous deployment for rollback:** `ab5bec21-11e9-47f2-9fa0-e3a2ee43e7d3` at `2026-11-22T10:31:32Z`
- **Parent source commit:** `50ed8bf`

## Release checks

- `bun test`: **761 passed, 0 failed**
- `bun run typecheck`: passed
- `bun run build`: passed, 5.6 MiB deploy asset tree
- Production `/`, `/start` and `/proof/app`: HTTP `200`
- Production deployment operation: `succeeded`
- Production publication status: `published: true`

### Source-to-deployment check

Before the acceptance window, the released source was checked against the
deployed build:

- `git diff --quiet ba7e6be -- src tests scripts deploy.json` returned `0`.
- The worktree has no changes in `src`, `tests`, `scripts` or `deploy.json`.
- Worker artifact `dist/plattr_studio/index.js`:
  `dc795ddeda2237103c392f25310a75301b9dbde379aece311588932731f1d20e`
- Deploy asset tree hash:
  `c768f2fc73eed0bc884488d537b7f117609524af37dce629bcbc3616fa3ba946`
- Rebuilding from that clean worktree produced the same two hashes, so the
  build is reproducible from `ba7e6be`.

The production deployment remains the one created at `2026-11-22T11:41:35Z`;
no production redeploy was made while waiting for the allowance reset.

## Geestores production acceptance

**Status: BLOCKED — not executed.**

The controlled Geestores journey could not be started because the production
`POST /api/discover` endpoint returns:

```json
{"error":{"code":"visitor_budget","message":"This connection has used its site reads for today. Fill the brief in by hand and the studio will read the site when you send it."}}
```

The daily bucket resets at **2026-11-23T00:00:00Z**. The check was made before
that reset. No further production discovery calls were made.

### Why internal testing exhausted the allowance

`/api/discover` spends two per-visitor buckets on each successful run:

- `import:<visitor>` for the outbound crawl
- `visitor:<visitor>` for the build

The visitor identity is a SHA-256 of Cloudflare's `cf-connecting-ip`.
`PROJECTS_PER_VISITOR` is `3` per UTC day. Earlier production acceptance runs
from the same connection consumed those three build tokens. The shared
`all` bucket was not exhausted (`PROJECTS_PER_DAY = 40`). This is the rate
limiter working as designed, not an import failure.

Do not raise the public cap to make QA easier. For future internal QA:

1. Use the preview environment for iterative discovery and concept review; it
   has its own database and visitor buckets.
2. Reserve one production visitor allowance for the final controlled run.
3. If frequent production QA is required, add a separate operator-gated QA
   allowance or a dedicated QA identity; keep the public cap unchanged.

## What was verified outside production

These results are **not** production acceptance and are recorded only as
implementation evidence:

- Local Geestores discovery: `GeeStores`, `Jewellery shop`, 10 pages,
  97 items, 97 priced, 67 source photographs, INR, phone and email.
- Deployed preview Geestores discovery: 96 items, 66 source photographs.
- All three local concepts rendered with distinct blueprints and real
  Geestores products.
- Product detail, cart, editor open and save/reload persistence worked in the
  local browser.
- Production homepage was loaded and inspected in a browser.

## Remaining acceptance step

After `2026-11-23T00:00:00Z`, run **one** controlled production journey with
`https://geestores.com/`:

1. Submit the URL on the production homepage.
2. Record the extracted counts and business profile.
3. Inspect all three concepts at desktop and mobile widths.
4. Select one concept and edit/save/reload.
5. Confirm the app is still private until approved and published.

Do not run exploratory discovery against production before that run.
