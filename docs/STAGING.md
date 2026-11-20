# Staging environment

Date: 20 November 2026

A separate Cloudflare environment for testing remote backup and restore against
real D1 and R2. It shares nothing with production: no database id, no bucket, no
secret and no hostname. The data in it is the local demo fixture set, not customer
data.

## Resources

| Resource | Name | Identifier | Purpose |
| --- | --- | --- | --- |
| Worker | `plattr-staging` | version `c027c104-602f-4dad-a009-9f8f3204e1d0` | The app under test, with staging bindings |
| Hostname | `plattr-staging.dio-app.workers.dev` | — | HTTPS origin for the staging app |
| D1 | `plattr-staging` | `edeca040-e3fd-49ce-99c4-318cac382046` | Staging database; the backup source |
| R2 (media) | `plattr-staging-media` | — | Staging app media, read by the backup job |
| R2 (backups) | `plattr-staging-backups` | — | Offsite runs and `plattr/index.json` |
| Worker | `plattr-staging-restore` | version `11be6668-cde6-4e03-aef6-b3b41c74c87b` | The restored copy, isolated from staging |
| Hostname | `plattr-staging-restore.dio-app.workers.dev` | — | HTTPS origin for the restored app |
| D1 | `plattr-staging-restore` | `b30fe103-1ef9-4c7f-abb6-c24a2cfbfd1d` | Rebuilt from a remote backup run |
| R2 (media) | `plattr-staging-restore-media` | — | Restored media objects |
| Secrets | `OWNER_SECRET`, `STUDIO_KEY`, `PAYMENT_ENCRYPTION_KEY` | per Worker, generated for staging | Never shared with production, never committed |
| Owner keys | `.wrangler/owner-keys/plattr-staging.txt`, `…-restore.txt` | derived from each Worker's own `OWNER_SECRET` | gitignored, mode 600; regenerate by rotating |

The two backup buckets are separate from the media buckets by design: the script
refuses to run if `--backup-bucket` equals `--bucket`.

## Configuration

`wrangler.staging.jsonc` and `wrangler.staging-restore.jsonc` deploy the same
build output with different bindings:

```bash
bun run build
bunx wrangler deploy --config wrangler.staging.jsonc
bunx wrangler deploy --config wrangler.staging-restore.jsonc
```

**Do not use `wrangler deploy --env staging`.** The Vite plugin writes
`dist/plattr_studio/wrangler.json` with the production bindings baked in and only
the environment *name* for `env.staging`, so `--env staging` deploys the
production D1 and R2 names under the staging Worker name. That was observed on
20 November (`D1 binding DB references database 6f1d7c52… which was not found`,
i.e. the production id). The dedicated config files avoid it.

## Seeding

The staging database was built from the local fixtures, not from production:

```bash
bunx wrangler d1 export plattr-studio --local --output /tmp/seed.sql
bunx wrangler d1 execute plattr-staging --remote --file /tmp/seed.sql -y
bunx wrangler d1 execute plattr-staging --remote -y --command \
  "DELETE FROM owner_sessions; UPDATE payment_connections SET secrets = '';"
# then upload the 21 media objects with `wrangler r2 object put --remote`
```

The scrub step matters: sessions and gateway ciphertext belong to the source
environment and cannot be decrypted with a different `PAYMENT_ENCRYPTION_KEY`.

## Owner access

Owner keys are not stored: they are `hmac_sha256(OWNER_SECRET, 'plattr-owner-key-v1:' + project token)`,
first 32 hex characters (`src/worker/ownerAuth.ts`), so one key per project per
environment. Cloudflare never returns a secret value, which means the keys are
only knowable at the moment the secret is written — rotating by hand in the
dashboard would lock every business out.

`scripts/owner-keys.mjs` therefore rotates and records in one step:

```bash
bun scripts/owner-keys.mjs --config wrangler.staging.jsonc --database plattr-staging \
  --host https://plattr-staging.dio-app.workers.dev --out .wrangler/owner-keys/plattr-staging.txt
bun scripts/owner-keys.mjs --config wrangler.staging-restore.jsonc --database plattr-staging-restore \
  --host https://plattr-staging-restore.dio-app.workers.dev --out .wrangler/owner-keys/plattr-staging-restore.txt
```

It reads the projects first (so an unreachable database stops it before the
secret changes), writes a fresh 32-byte secret through stdin, derives every key,
writes them to the gitignored file, deletes the existing `owner_sessions` rows,
and then signs in once against `--host` to prove the Worker picked the new
secret up: wrong key `401`, derived key `303` with a session, dashboard `200`.
The secret is never printed, logged or written anywhere.

Each environment has its own secret, so its keys differ by design: a key from
`plattr-staging` is not valid on `plattr-staging-restore`. Sign in at
`/p/<project token>/dashboard/login`.

`STUDIO_KEY` is a different credential: it opens `/studio`, the operator board
that lists every build. Owner keys open one business's dashboard.

## Abandoned backup runs

A run that fails after it starts uploading stays `pending` in
`plattr/index.json` and its objects stay in `plattr-staging-backups`.
`scripts/backup-sweep.mjs` removes them:

```bash
bun scripts/backup-sweep.mjs --remote --backup-bucket plattr-staging-backups            # dry run
bun scripts/backup-sweep.mjs --remote --backup-bucket plattr-staging-backups --execute
```

The staging evidence is in `docs/qa/remote/REPORT.md`: 25 objects from the two
failed acceptance runs, both marked `abandoned`, both verified runs untouched.
The sweeper's rules are re-runnable against a local bucket — recorded list, too
young, verified, already abandoned, unindexed, unrecorded and one claiming keys
outside its prefix:

```bash
bun run backup:sweep:fixture
```

## Isolation rules

- Never point a staging command at `plattr-studio`, `plattr-media` or the
  production Worker. The staging configs are the only deploy path used.
- Never copy production credentials, customer rows or owner sessions into
  staging.
- Staging hostnames are `noindex` like every build unless a project opts in.
- Deleting a staging resource is safe; deleting a production resource is not.

## Teardown

```bash
bunx wrangler delete --config wrangler.staging.jsonc
bunx wrangler delete --config wrangler.staging-restore.jsonc
bunx wrangler d1 delete plattr-staging
bunx wrangler d1 delete plattr-staging-restore
bunx wrangler r2 bucket delete plattr-staging-media
bunx wrangler r2 bucket delete plattr-staging-restore-media
bunx wrangler r2 bucket delete plattr-staging-backups
```

Deleting the backup bucket deletes the run history and its index; take a copy
first if the runs are evidence you still need.

## Cost

At staging size (1.5 MB database, 0.5 MB media per environment, ~50 MB of backup
runs) everything is inside the free tiers: D1 5 GB and 25 M rows read per day, R2
10 GB with no egress charge, Workers requests far below the free allowance. On a
Workers Paid account the $5/month plan already covers it. See the acceptance
report for the itemised estimate.
