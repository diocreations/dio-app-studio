# Plattr commercial platform — architecture audit and migration proposal

Phase 1 deliverable. **Audit and proposal only:** no schema, authentication, routing
or UI changes were made in this pass, and nothing was deployed.

Scope: how Plattr is owned, authenticated, isolated, metered and operated today,
and the smallest migration that turns it into a multi-business platform without
losing any generated app, customer order, booking or payment record.

Evidence: `src/worker/db.ts`, `src/worker/index.ts`, `src/worker/ownerAuth.ts`,
`src/worker/studioAuth.ts`, `src/worker/payments/*`, `src/worker/media.ts`,
`src/worker/views/studio.ts`, `wrangler.jsonc`, and the existing operations,
security, backup and payments documents.

---

## 1. Executive summary

Plattr today is a **single-tenant-per-row, single-operator** application builder.
A business is represented by one `projects` row; its "account" is a derived
owner key shown to the operator and sent to the business out of band. There is
no user, no organisation, no membership, no email identity and no subscription
entity anywhere in the schema or the routes.

What that means commercially:

- **No customer identity exists.** Nobody can register, verify an email, recover
  access or be audited as an individual. `OWNER_SECRET` is one deployment-wide
  secret from which every project's owner key is derived.
- **Anyone can create an app.** `POST /api/projects` is public and unauthenticated
  (capped at 3 builds per connection per day and 40 per day globally). There is
  no account to attach the app to and no way to bill its owner.
- **One app = one login.** `owner_sessions.project_id` ties a session to exactly
  one project, and the owner cookie is per project, so a business with three apps
  has three credentials and three sessions.
- **Tenant isolation is application-enforced only.** Every query adds
  `project_id = ?`; there are no foreign keys and D1 has no row-level security.
  It works today because all data hangs off one resolved project token.
- **There is no billing domain at all.** The existing payment tables are
  business→customer payments. Subscription billing, plans, invoices and platform
  revenue do not exist and must not reuse those tables.
- **The operator board is a global key over everything.** `/studio` lists every
  business, prints every owner key and can delete any build. It has no roles,
  no usage, no subscription view, no suspension and no audit actor.

The migration below is additive: `projects` stays the tenant root for app data,
`org_id` is added nullable and backfilled, and every existing generated app keeps
its token, row ids, media and payment history.

---

## 2. Audit findings

### 2.1 Project ownership and `OWNER_SECRET`

| Fact | Evidence |
| --- | --- |
| A business is one `projects` row; `token` (24 hex) is the app's public capability | `db.ts` schema, `loadProject` in `index.ts` |
| Owner credential = `HMAC_SHA256(secret, "plattr-owner-key-v1:" + token)` truncated to 32 hex | `ownerAuth.ts: ownerAccessKey` |
| `secret = OWNER_SECRET ?? STUDIO_KEY` | `index.ts: ownerSecret()` |
| Owner key is not stored in D1; it is recomputed on demand | `ownerAuth.ts`, `/studio` handler |
| The operator board renders every project's owner key in a `<details>` block | `views/studio.ts` |
| `projects` has no `owner_id`, `account_id`, `org_id` or email-verified flag | `db.ts` schema |
| `contact` and `email` on `projects` are the business's own contact fields, not an identity | `db.ts`, brief flow |

Consequences worth naming plainly:

- A leak of `OWNER_SECRET` (or `STUDIO_KEY`) yields the owner key of **every**
  business, because the derivation input is public (the token) and constant.
- Rotating `OWNER_SECRET` revokes **all** owner keys and every outstanding
  dashboard credential at once; there is no overlap window and no per-business
  rotation.
- Because the key is derived rather than chosen, a business cannot change its own
  credential, cannot recover it by email and cannot prove ownership of its email.
- The operator must transmit credentials out of band; there is no self-serve path.

**Verdict:** adequate as a provisional capability model for a studio-managed
build; not an account system and not viable for self-serve commerce.

### 2.2 Owner sessions and authentication lifecycle

| Fact | Evidence |
| --- | --- |
| Session ids `own_` + 48 hex, stored in `owner_sessions` | `ownerAuth.ts` |
| Cookie name `plattr_owner_<token[0:12]>`, `path=/`, `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS | `ownerCookieName`, login handler |
| 30-day absolute lifetime, 7-day idle expiry, idle timestamp refreshed at most hourly | `OWNER_SESSION_DAYS`, `OWNER_IDLE_DAYS`, `hasOwnerSession` |
| Sign out deletes one session; "Sign out everywhere" deletes all for a project | `deleteOwnerSession(s)` |
| Login capped at 10 attempts per project per connection per day | `owner-login:` budget in `index.ts` |
| Every `/api/projects/:token/*` route is behind one owner middleware | `index.ts` line ~326 |
| Session has no actor identity, no device label, no last-IP record, no rotation on privilege change | `owner_sessions` columns |
| No email verification, password, magic link, TOTP or recovery flow anywhere | no tables or routes |

**Gaps:** identity, verification, recovery, session listing/revocation per device,
privilege-aware rotation, actor attribution, and any notion of "this user, not
this project" authentication.

### 2.3 D1 schema and tenant-level isolation

Current tables (all in one D1 database, `DB` binding):

| Domain | Tables |
| --- | --- |
| Tenant root | `projects` (`id`, `token`, `plan`, `status`, `spec`, `doc`, `version`, `variation_slot`, …) |
| Platform counters | `variation_counter`, `daily_budget`, `import_budget` |
| Collaboration | `notes`, `activity`, `doc_versions` |
| Media | `media` (metadata only; objects in R2 `MEDIA`) |
| Business operations | `customers`, `orders`, `order_items`, `bookings`, `enquiries`, `notifications` |
| Owner auth | `owner_sessions` |
| Business payments | `payment_connections`, `payment_settings`, `payment_transactions`, `payment_events` |

Isolation facts:

- Every child table carries `project_id` and is queried with it, resolved from the
  URL token — never from a client-supplied id. This is consistent across
  `business.ts`, `payments/service.ts`, `db.ts` and the dashboard.
- `orders` and `bookings` also carry `payment_status` written by the payment
  service, scoped by `project_id`.
- **No foreign keys**, no `ON DELETE CASCADE`, no triggers. Integrity and cascade
  are the application's responsibility.
- Indexes exist per `project_id`; there is no composite tenant key on `orders`
  beyond that.
- `UNIQUE` constraints that matter across tenants are correctly composite
  (`customers(project_id, contact_key)`, `media(project_id, hash)`,
  `payment_connections(project_id, provider)`, `payment_events(project_id,
  provider, event_id)`), plus two provider-level unique indexes on
  `payment_transactions(provider, mode, provider_order_id|provider_payment_id)`.
- `deleteProject` deletes only `notes`, `activity` and `projects`. `owner_sessions`,
  `media` rows, `doc_versions`, `customers`, `orders`, `order_items`, `bookings`,
  `enquiries`, `notifications` and all `payment_*` rows are left orphaned, and R2
  objects are untouched. That is already a data-hygiene defect and becomes a
  compliance defect once accounts can be deleted.

**Verdict:** correct single-tenant isolation today; no database-level guarantee,
no account layer above `project_id`, and an incomplete delete path.

### 2.4 How businesses create and access their mobile applications

1. `GET /brief` renders the public brief. `POST /api/projects` is **public** and
   rate-limited only by hashed connection (`cf-connecting-ip`) counters.
2. `createProject` writes a `projects` row, seeds `spec`/`doc`, allocates a
   `variation_slot` from `variation_counter`, and returns a quote.
3. The same request creates the first owner session and sets the cookie. The
   creator is therefore the only holder of that browser session; the operator
   separately holds the derived owner key and hands it to the business.
4. Access afterwards: `/p/:token` (build page), `/p/:token/edit` (visual editor),
   `/p/:token/dashboard` (business dashboard) — all behind the owner session.
5. The customer app is `/p/:token/app`, public with the token as its capability.

**Gaps:** the creator is never identified, the app is never attached to an
account, and there is no way to add a second app to the same business identity.

### 2.5 Application publishing and update mechanisms

- There is **no per-app deployment**. The Worker renders every app from D1 on
  request (`/p/:token/app`); a save is immediately live.
- `projects.status` is a *review workflow*, not a release state:
  `in_review` → (`changes_requested`) → `approved`, set by `approveProject` and
  `addNote`. It is a business/owner review signal, not a publication gate.
- Design history: `doc_versions` keeps the last 20 snapshots, restorable from the
  editor. Saves bump `projects.version`.
- The whole platform ships as one Worker (`wrangler.jsonc`, `deploy.json`) with
  D1 + R2 bindings; there is no app-by-app artefact, subdomain or custom domain.

Implication for plans: "published applications" has no existing definition. The
proposal uses **approved apps with an active public link** (see §5.4) and records
that this changes nothing about how an app is served.

### 2.6 Existing metering, usage limits and rate limits

| Meter | Scope | Value | Storage |
| --- | --- | --- | --- |
| Builds created | per hashed connection / day | 3 | `daily_budget` |
| Builds created | global / day | 40 | `daily_budget` |
| Imports | per hashed connection / day | 3 | `daily_budget` |
| Imports | global / day | 400 (`IMPORT_DAILY_CAP`) | `import_budget` |
| Owner logins | per project + connection / day | 10 | `daily_budget` |
| Customer orders | per project + connection / day | 30 | `daily_budget` |
| Customer bookings | per project + connection / day | 15 | `daily_budget` |
| Customer enquiries | per project + connection / day | 10 | `daily_budget` |
| Media uploads | per project + connection / day | 40 | `daily_budget` |
| Gateway credential tests | per project / day | 30 | `daily_budget` |
| Payment starts | per project + visitor / day | 20 | `daily_budget` |
| Media per app | absolute | 24 files / 40 MB, 8 MB per file | `media` rows + constants |
| Design versions | per app | 20 | `doc_versions` |
| Body size | per request | 256 KB JSON, 18 MB upload | middleware |

There is no per-account quota, no storage rollup, no AI spend accounting and no
usage history beyond today's counters (rows are pruned by day). "AI generation"
in this build is deterministic (`applyCommand`), so a credit system must meter
*builds and AI edit requests*, not model tokens.

### 2.7 Operator dashboard and permissions

- `/studio` is gated by one `STUDIO_KEY`; the cookie holds an HMAC of the key.
- It lists **all** builds with name, trade, contact, email, status, quote plan,
  value and version; it can reveal each owner key and delete any build.
- Totals shown are build count and quoted one-time/monthly value from
  `quote` — i.e. pre-sales estimates, not collected revenue.
- No usage, subscription, invoice, suspension, audit-actor, tenant-isolation or
  system-health view. `/health` exists separately and is public.
- No roles: the same key can view every business's contact details and delete it.

### 2.8 Razorpay / Stripe business payment credential isolation

- Per project + provider connection (`payment_connections`), mode `test|live`,
  `key_id` in clear (public key id), secrets encrypted with AES-GCM.
- Key: `PAYMENT_ENCRYPTION_KEY` (base64, 32 bytes). AAD binds
  `plattr-payment-v1:<project_id>:<provider>`, so a ciphertext copied to another
  business or provider fails to decrypt. No key → save fails closed.
- Webhooks: `/p/:token/payments/webhook/<provider>`, signature verified against
  the per-project webhook secret before parsing; events deduped by
  `(project_id, provider, event_id)`.
- Money moves business→its own gateway account; Plattr never holds it.
- Dashboard/API never return secrets (`hasKeySecret` only).

**Verdict:** this is a good boundary and must be kept intact. It is, however,
entirely the *wrong* place to put Plattr's own subscription revenue.

### 2.9 Backup, restoration and recovery

- `docs/BACKUP.md` documents D1 export + R2 replica, nightly + pre-deploy, 7/4/3
  retention, and a rehearsed local restore with integrity check and row counts.
- Scripts exist: `scripts/d1-backup.mjs`, `scripts/d1-restore.mjs`.
- **No scheduled job runs in this repository**, no offsite bucket is provisioned,
  and the rehearsal was local rather than a remote production restore.
- Design rollback is in-app (`doc_versions`); Worker rollback is a provider
  action.
- Credential recovery today means re-entering gateway keys; owner credentials
  cannot be recovered, only re-derived or rotated globally.

New subscription and invoice tables inherit the D1 export path but add financial
retention obligations (see §7 risks).

---

## 3. Current entity model (as built)

```
projects (tenant root)
  id, token UNIQUE, name, contact, email, vertical, plan('onetime'|'monthly'),
  status(in_review|changes_requested|approved), spec(JSON), doc(TSV/JSON),
  version, variation_slot UNIQUE, created_at, updated_at
    │
    ├── owner_sessions(project_id)        ← the only auth link
    ├── notes / activity / doc_versions
    ├── media (metadata; blobs in R2)
    ├── customers → orders → order_items
    │             → bookings
    │             → enquiries
    │             → notifications
    └── payment_connections(project_id, provider)
        payment_settings(project_id)
        payment_transactions(project_id, …)
        payment_events(project_id, provider, event_id)

platform counters: daily_budget(key), import_budget(day), variation_counter(name)
operator: STUDIO_KEY → /studio (no table, no identity)
```

Nothing above `projects` exists. That is the gap the migration fills.

---

## 4. Gaps that block commercial operation

| # | Gap | Impact | Severity |
| --- | --- | --- | --- |
| 1 | No user/account entity | No registration, verification, recovery, actor audit | Blocker |
| 2 | Public app creation | Unbounded free apps, no owner to bill, abuse surface | Blocker |
| 3 | One global `OWNER_SECRET` | Total blast radius; global rotation; keys shown on `/studio` | Blocker |
| 4 | Session bound to one project | No multi-app business, three logins for three apps | Blocker |
| 5 | No organisation/ownership table | Cannot express "this business owns these apps" | Blocker |
| 6 | No plan/subscription/invoice schema | No revenue, no entitlements, no dunning | Blocker |
| 7 | No operator roles or audit actor | Any operator can read all contacts and delete any tenant | High |
| 8 | No DB-level isolation/keys | One query missing `project_id` leaks across tenants | High |
| 9 | Incomplete project delete | Orphaned customer/payment rows and R2 objects | High |
| 10 | No email infrastructure | Verification, reset, receipts, dunning impossible | High |
| 11 | No usage ledger | Quotas and overage cannot be enforced or reported | Medium |
| 12 | No CSP; origin-only CSRF | Session-bearing HTML surfaces are weakly hardened | Medium |

---

## 5. Proposed architecture

### 5.1 Design principles

1. **`projects` remains the tenant root for app data.** Existing app, order,
   booking, enquiry, media and payment rows keep their `project_id`; no data
   rewrite, no token change.
2. **Add an account layer above it.** `users` ↔ `organizations` ↔ `projects`.
   One organisation owns many apps; users join organisations through memberships.
3. **New auth is additive.** Legacy owner keys keep working during a migration
   window; they are then converted into account claims, not silently dropped.
4. **Platform billing is a separate domain.** Separate tables, secrets, routes,
   permissions, provider account and reports. It never reads or writes
   `payment_*`.
5. **Configurable plans, versioned.** Limits live in data, not code, and a
   subscription pins the plan *version* it bought.
6. **No destructive migrations.** Add columns/tables, backfill, keep the old path
   readable for at least one release, then remove behind a verified flag.

### 5.2 Proposed entity relationship model

```
users ─────────┐
  id           │  memberships (org_id, user_id, role)
  email        ├──────────────┐
  email_verified_at           │
  password_hash               ▼
  status                 organizations ──── invitations
  created_at                 id            (org_id, email, role, token_hash)
  last_login_at              name
                             slug
                             country / currency
                             status (active|suspended|closed)
                             created_at
                                  │ 1:N
                                  ▼
                              projects  (existing table + org_id, created_by)
                                  │
                                  ├── existing app data (unchanged)
                                  ├── project_claims → ownership_transfers
                                  └── payment_* (unchanged, business money)

plans ── plan_limits (plan_key, version, limit_key, value)
   │
   └── subscriptions (org_id, plan_key, plan_version, provider, status,
                      previous_subscription_id, trial_ends_at, current_period_*)
            ├── subscription_changes (from/to plan, provider_event_id UNIQUE)
            ├── platform_invoices (org_id-scoped history)
            └── platform_billing_events (provider, event_id UNIQUE)

users ── user_sessions          (identity sessions, hashed tokens)
users ── email_tokens           (verify / reset, hashed, single use)
users ── operator_roles         (platform staff: support|billing|admin)
audit_events                    (actor_user_id, org_id, action, target, ip_hash)
usage_counters / usage_events   (org_id, project_id?, metric, period, used)
```

### 5.3 Proposed tables (DDL sketch — not applied)

All new tables are additive. `IF NOT EXISTS`, no `ALTER` of existing columns
except the nullable `projects.org_id` / `projects.created_by` additions.

```sql
-- Identity
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,                 -- stored lowercased + trimmed
  email_normalized TEXT NOT NULL UNIQUE,
  email_verified_at TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',   -- PBKDF2-SHA256/scrypt envelope, versioned
  status TEXT NOT NULL DEFAULT 'active',    -- active|suspended|closed
  display_name TEXT NOT NULL DEFAULT '',
  locale TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,     -- hex(SHA-256(token)); cookie carries the token
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT '',
  revoked_at TEXT NOT NULL DEFAULT '',
  user_agent_hash TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS user_sessions_by_user ON user_sessions (user_id, expires_at);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,               -- verify_email|reset_password|invite
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- Tenancy
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'active',   -- active|suspended|closed
  -- New orgs start claimed; backfilled legacy orgs start 'unclaimed' and only
  -- reach 'claimed' through an approved claim (§5.6).
  claim_status TEXT NOT NULL DEFAULT 'claimed', -- unclaimed|claim_pending|claimed|disputed
  claimed_at TEXT NOT NULL DEFAULT '',
  first_trial_at TEXT NOT NULL DEFAULT '', -- one trial per organisation, enforced in code
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',      -- owner|admin|staff|viewer
  created_at TEXT NOT NULL,
  invited_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  token_hash TEXT NOT NULL UNIQUE,
  invited_by TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- A claim is the only path that turns possession of a legacy credential into
-- organisation ownership. Neither the owner key nor an unverified email is
-- sufficient alone; see §5.6.
CREATE TABLE IF NOT EXISTS project_claims (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email_normalized TEXT NOT NULL,        -- must match projects.email or an approved override
  email_source TEXT NOT NULL DEFAULT 'project', -- project|operator_override
  verify_token_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_email',
    -- pending_email|pending_review|approved|rejected|expired|cancelled|disputed
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  email_verified_at TEXT NOT NULL DEFAULT '',
  decided_at TEXT NOT NULL DEFAULT '',
  decided_by TEXT NOT NULL DEFAULT '',
  decision_note TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS project_claims_one_open
  ON project_claims (project_id)
  WHERE status IN ('pending_email', 'pending_review', 'disputed');
CREATE INDEX IF NOT EXISTS project_claims_by_user ON project_claims (user_id, created_at);

-- Immutable record of every project → organisation transfer, including a
-- reversal after a dispute.
CREATE TABLE IF NOT EXISTS ownership_transfers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  claim_id TEXT NOT NULL DEFAULT '',
  from_org_id TEXT NOT NULL DEFAULT '',
  to_org_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,              -- user|operator
  actor_id TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  reversed_at TEXT NOT NULL DEFAULT '',
  reversal_reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ownership_transfers_by_project
  ON ownership_transfers (project_id, created_at);

ALTER TABLE projects ADD COLUMN org_id TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN created_by TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS projects_by_org ON projects (org_id, created_at);

-- Plans and subscriptions
CREATE TABLE IF NOT EXISTS plans (
  plan_key TEXT NOT NULL,               -- free|starter|growth|business
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  interval TEXT NOT NULL DEFAULT 'month',  -- month|year
  trial_days INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  PRIMARY KEY (plan_key, version)
);

CREATE TABLE IF NOT EXISTS plan_limits (
  plan_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  limit_key TEXT NOT NULL,              -- apps|published_apps|ai_credits|storage_mb|…
  value INTEGER NOT NULL,               -- -1 = unlimited
  unit TEXT NOT NULL DEFAULT 'count',
  PRIMARY KEY (plan_key, version, limit_key)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  plan_key TEXT NOT NULL,
  plan_version INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT '',    -- razorpay|stripe
  provider_customer_id TEXT NOT NULL DEFAULT '',
  provider_subscription_id TEXT NOT NULL DEFAULT '',
  -- One row per commercial contract, not one row per organisation. `replaced`
  -- marks a contract superseded by a newer one so the chain stays readable;
  -- it is never a live state.
  status TEXT NOT NULL DEFAULT 'trialing',
    -- trialing|active|past_due|grace|cancelled|expired|replaced
  previous_subscription_id TEXT NOT NULL DEFAULT '', -- chain link to the prior contract
  superseded_by TEXT NOT NULL DEFAULT '',            -- set on the row that was replaced
  trial_ends_at TEXT NOT NULL DEFAULT '',
  current_period_start TEXT NOT NULL DEFAULT '',
  current_period_end TEXT NOT NULL DEFAULT '',
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  grace_until TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- History is per organisation, not per row: upgrades, downgrades, cancellations
-- and re-subscriptions each keep their own row. Only one row may be live.
CREATE INDEX IF NOT EXISTS subscriptions_by_org ON subscriptions (org_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_live_per_org
  ON subscriptions (org_id)
  WHERE status IN ('trialing', 'active', 'past_due', 'grace');
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_by_provider
  ON subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id <> '';

-- Immutable record of every plan move, whether it happened in place at the
-- provider (same subscription id) or by creating a new contract.
CREATE TABLE IF NOT EXISTS subscription_changes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  next_subscription_id TEXT NOT NULL DEFAULT '',
  from_plan_key TEXT NOT NULL,
  from_plan_version INTEGER NOT NULL,
  to_plan_key TEXT NOT NULL,
  to_plan_version INTEGER NOT NULL,
  change_type TEXT NOT NULL,             -- upgrade|downgrade|resubscribe|reactivate|trial_start
  effective_at TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system', -- user|operator|system
  actor_id TEXT NOT NULL DEFAULT '',
  provider_event_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS subscription_changes_by_org
  ON subscription_changes (org_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_changes_by_event
  ON subscription_changes (provider_event_id)
  WHERE provider_event_id <> '';

-- Billing history is queried by org_id. subscription_id points at the contract
-- that was live when the invoice was issued and is never rewritten when that
-- contract is superseded.
CREATE TABLE IF NOT EXISTS platform_invoices (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_invoice_id TEXT NOT NULL DEFAULT '',
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'open',
  issued_at TEXT NOT NULL,
  paid_at TEXT NOT NULL DEFAULT '',
  pdf_url TEXT NOT NULL DEFAULT ''
);
-- Invoice mirroring is idempotent: one row per provider invoice in an
-- environment's account.
CREATE UNIQUE INDEX IF NOT EXISTS platform_invoices_by_provider
  ON platform_invoices (provider, provider_invoice_id)
  WHERE provider_invoice_id <> '';

CREATE TABLE IF NOT EXISTS platform_billing_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'received',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (provider, event_id)
);

-- Platform operations
CREATE TABLE IF NOT EXISTS operator_roles (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'support',   -- support|billing|admin
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,               -- user|operator|system
  actor_id TEXT NOT NULL DEFAULT '',
  org_id TEXT NOT NULL DEFAULT '',
  project_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL DEFAULT '',
  metric TEXT NOT NULL,                   -- build|ai_edit|upload|order|…
  quantity INTEGER NOT NULL DEFAULT 1,
  period TEXT NOT NULL,                   -- YYYY-MM-DD (UTC)
  created_at TEXT NOT NULL
);
```

### 5.4 Plan structure (proposal, no pricing fixed)

Prices and numbers are **placeholders for the product owner**; the point is the
shape. Every plan is a row set in `plans` + `plan_limits`, so changing a limit is
a data change, not a deploy.

| Limit key | Free / Trial | Starter | Growth | Business | Enforcement point |
| --- | --- | --- | --- | --- | --- |
| `apps` | 1 | 1 | 3 | 10 | `POST /api/projects` |
| `published_apps` | 1 | 1 | 2 | 10 | approve/publish action |
| `ai_credits` (per month) | 10 | 100 | 400 | 1500 | `POST /api/projects`, `/doc/ai` |
| `monthly_ai_requests` | 50 | 500 | 2000 | 8000 | same, counted separately from credits |
| `storage_mb` | 40 | 200 | 800 | 3000 | media upload route |
| `media_files` | 24 | 100 | 400 | 1200 | media upload route |
| `team_members` | 1 | 1 | 3 | 10 | invitation accept |
| `premium_features[]` | — | `payments` | `payments,offers,loyalty` | all | capability check |
| `support_level` | community | email | priority | dedicated | metadata only |

Per-plan rules that matter:

- **Free/trial default equals today's behaviour** for a single app: 24 media
  files, 40 MB, all existing trade features, no payment gate. No existing
  functionality is removed by the migration; the only new gates are *counts*
  above today's usage (and today's 40-build/day global cap already bounds abuse).
- `published_apps` is defined as apps with `status = 'approved'` and a live token.
  Documented impact: an app in `in_review` does not consume a published slot, and
  serving is unchanged.
- Entitlements are resolved from the **live** subscription row's
  `plan_version`, so raising a plan's limits does not retroactively change an
  existing customer's contract.
- Grace and dunning affect *new* privileged actions only (new apps, new uploads,
  new AI edits). They never take a live customer app offline and never block
  customer orders or payments.

### 5.5 Subscription lifecycle

```
trial_start ──► active ──► past_due ──► grace ──► expired
     │            │  ▲                    │
     │            │  └── payment ok ──────┘
     │            └── cancel_at_period_end ──► cancelled (at period end)
     └── trial expired without payment ──► expired (downgrade to free)
```

- Provider creates the subscription (Razorpay Subscriptions / Stripe Billing);
  Plattr stores ids and states, and mirrors every state change from signed
  webhooks into `subscriptions` + `platform_invoices`.
- Webhook events are idempotent by `(provider, event_id)`; handlers are
  upserts keyed by provider subscription id, so out-of-order delivery converges.
- Downgrade applies at period end and is gated by current usage: an org with 3
  apps cannot drop to a 1-app plan until it archives two (archiving is a new,
  reversible state — see §6).
- Cancellation never deletes apps or customer data; it schedules expiry.
- Every transition writes `audit_events` and is visible in the org's billing
  history.

#### Subscription history across upgrades and re-subscriptions

A plan move is expressed in one of two ways, and both preserve history:

- **In-place change** — the provider keeps the same subscription object (for
  example Stripe proration or a Razorpay plan change). Update `plan_key` and
  `plan_version` on the live row and append a `subscription_changes` row. There
  is still exactly one live row.
- **New contract** — re-subscribing after `cancelled`/`expired`, or a provider
  that issues a new subscription id. Insert a new `subscriptions` row with
  `previous_subscription_id` set, mark the old row `replaced` with
  `superseded_by`, and append a `subscription_changes` row.

Rules:

- The partial index `subscriptions_one_live_per_org` is the only cardinality
  constraint. An organisation may hold any number of closed rows, so every
  upgrade, downgrade, cancellation and later re-subscription keeps its own
  period, plan version and provider ids.
- `platform_invoices` rows are never rewritten when their contract is
  superseded; billing history is queried by `org_id`, not by "the current
  subscription row".
- A re-subscription never reuses a `provider_subscription_id`. If a provider did
  reuse one, the handler updates that row instead of inserting; the unique
  partial index makes the mistake fail closed rather than fork history.
- Trials are per organisation (`organizations.first_trial_at`), so cancelling and
  re-subscribing does not mint another trial.
- `subscription_changes.provider_event_id` is unique, so a replayed webhook
  cannot duplicate a plan-change record.

### 5.6 Legacy claim and ownership transfer

The Phase 1 sketch created a user lazily on the first legacy owner login. That is
unsafe: possessing an owner key would then be enough to bind an arbitrary,
unverified email to a live business — and possession of the key is not proof of
the business, because operators, former staff and leaked credentials all hold it.

A claim therefore requires **two independent proofs**, and creating an account
never grants ownership by itself:

1. **Legacy credential** — the owner key the studio sent, compared in constant
   time on the server. It is never echoed, logged or placed in a URL.
2. **Control of the project's registered contact email** — a single-use, hashed,
   60-minute token sent to `projects.email`, which must already be on the
   project. An arbitrary address (including the one the claimant just registered
   with) is rejected.

Flow:

```
owner opens the claim link / "Set up an account" on the login page
  └─ registers or signs in (the account email may still be unverified)
      └─ POST /claim/start { claimCode | projectToken, ownerKey }
          ├─ uniform 202 response whether or not the project exists
          ├─ claim row pending_email; token mailed to projects.email
          └─ no data access, no token disclosure, no membership yet
              └─ POST /claim/verify { claimId, token }
                  ├─ 5 attempts, then the claim dies and must restart
                  └─ status pending_review (email proven, transfer pending)
                      └─ transfer (automatic for a clean case, operator-approved otherwise)
                          ├─ org created or reused; projects.org_id set
                          ├─ owner membership created; claim approved
                          ├─ ownership_transfers + audit_events rows
                          └─ legacy owner session bound to the user, not left parallel
```

Rules and edge cases:

- **No self-serve claim when `projects.email` is empty or undeliverable.** The
  claim goes to `pending_review` and an `admin` operator verifies by an
  out-of-band route (studio contract, invoice, domain email, call-back), with the
  evidence recorded in `ownership_transfers.evidence`. The operator action is
  audited and cannot target the operator's own account.
- A project already owned by a claimed organisation cannot be re-claimed; the UI
  routes the person to the dispute path. This closes "claim again with a
  different email" as a takeover route.
- Changing the contact email after verification does not move ownership. Editing
  the contact email on a claimed project requires an owner session and notifies
  the previous address.
- **Disputes:** `project_claims.status = 'disputed'` freezes ownership transfers
  for that project; only `admin` resolves, and either outcome writes an
  `ownership_transfers` reversal or a rejection with a note, notifies both
  parties and is audited. The app stays online during a dispute; only ownership
  changes freeze.
- Abuse limits: 3 claim starts per project per day, 10 per connection per day,
  one open claim per project (partial unique index), single-use tokens, and
  identical responses for unknown/known projects and verified/unverified emails.
- If the account email and `projects.email` are the same address, the claim
  verification also marks the account email verified — one proof, one event.
- Ownership can be granted to an account whose own email is still unverified,
  but **billing, plan changes and member invitations require a verified account
  email**. An unverified account can therefore own an app, and can never spend
  money or add people.
- The operator interface never shows owner keys, claim tokens or derived key
  material — only claim status and the evidence trail.
- Legacy login stays valid during M3 but no longer creates accounts. Ownership
  is created only by an approved claim, or by the audited operator path for a
  business that cannot receive email.

### 5.7 Two payment domains — separation contract

| Dimension | Business customer payments (exists) | Plattr subscriptions (new) |
| --- | --- | --- |
| Money flow | Business Gateway → business account | Customer → Plattr account |
| Credentials | `payment_connections.secrets`, AAD `plattr-payment-v1:<project>:<provider>` | New `platform_billing_accounts`; AAD `plattr-platform-billing-v1:platform:<provider>`; separate env names |
| Tables | `payment_*` | `subscriptions`, `subscription_changes`, `platform_invoices`, `platform_billing_events` |
| Webhook route | `/p/:token/payments/webhook/:provider` | `/billing/webhook/:provider` |
| Verification | Per-project webhook secret | Platform webhook secret, per environment |
| Permission | Business owner | Plattr `billing` operator or the subscription owner (read-only) |
| Reports | Business dashboard collected/refunded | Platform MRR, invoices, churn |
| Refunds | `payment_transactions.refund_status` | Credit notes on `platform_invoices`; never touches business refunds |
| Failure handling | Order/booking stays unpaid | Subscription `past_due` → grace → downgrade |

Hard rules for implementation:

1. No platform code path may import `payments/service.ts` for subscription money,
   and no subscription handler may write `payment_transactions`.
2. The platform webhook route is not under `/p/:token`, has no project scope and
   must reject unknown provider events without touching business data.
3. Platform billing credentials are never rendered in a business dashboard, and
   business credentials never appear in the operator admin.

---

## 6. Migration plan (backward compatible)

Each step is deployable on its own and independently reversible. Nothing deletes
or rewrites existing app data.

**Status (19 Nov 2026):** M0, M1 and M2 are implemented and rehearsed locally —
flags in `src/worker/platform/flags.ts`, schema in `src/worker/platform/schema.ts`,
backfill in `src/worker/platform/backfill.ts`, runner in
`scripts/platform-migrate.ts`. Evidence, counts, rollback and restore results are in
`docs/PLATFORM_M0_M2_REPORT.md`; the dispute runbook is
`docs/PLATFORM_OWNERSHIP_DISPUTE.md`. Nothing is deployed, and M3 has not started.

### M0 — Preconditions (no schema change)

- Decide pricing, plan limits, provider eligibility (Razorpay Subscriptions vs
  Stripe Billing), and the email provider.
- Add an email sender abstraction and outbox (reusing `notifications` semantics
  is possible, but account email should not depend on the business notification
  queue).
- Add a feature flag mechanism (`flags` table or env) to dark-launch accounts:
  `accounts.enabled`, `billing.enabled`, `admin.enabled`.

### M1 — Additive schema

- Create `users`, `user_sessions`, `auth_tokens`, `organizations`,
  `memberships`, `invitations`, `operator_roles`, `audit_events`, `plans`,
  `plan_limits`, `subscriptions`, `subscription_changes`, `platform_invoices`,
  `platform_billing_events`, `usage_events`, `project_claims`,
  `ownership_transfers`.
- `ALTER TABLE projects ADD COLUMN org_id TEXT NOT NULL DEFAULT ''` and
  `created_by TEXT NOT NULL DEFAULT ''`; add `projects_by_org`.
- Extend `ensureSchema` with the same idempotent pattern already used; no data
  change yet. Existing code paths ignore the new columns.

**Impact:** none. Old Worker versions continue to read `projects` unchanged.
**Rollback:** drop the new tables/columns (they are unused).

### M2 — Backfill one organisation per existing project

```sql
-- Conceptual; run in batches, idempotent, wrapped in a transaction per batch.
INSERT OR IGNORE INTO organizations (id, name, slug, currency, status, created_at, updated_at)
SELECT 'org_' || lower(hex(randomblob(10))), p.name,
       'app-' || p.token, 'USD', 'active', p.created_at, p.created_at
FROM projects p WHERE p.org_id = '';

UPDATE projects SET org_id = (SELECT o.id FROM organizations o WHERE o.slug = 'app-' || projects.token)
WHERE org_id = '';
```

- One synthetic org per project preserves today's isolation exactly. Merging
  two apps into one org is a later, explicit operator action.
- Backfilled orgs are written with `claim_status = 'unclaimed'` and
  `claimed_at = ''`. **M2 creates no users and no memberships.** Ownership is
  only ever created by an approved claim in M3 (§5.6); a successful legacy login
  during the dual-auth window does not create an account or bind an email.
- Implemented with a deterministic id derived from the token (`org_<token>`, slug
  `app-<token>`) rather than `randomblob`, so re-runs, partial failures and restored
  backups converge instead of creating duplicates.
- Deleting an unclaimed app also deletes its synthetic organisation (only while it
  has no members, billing or transfers), so the backfill cannot introduce a new
  orphan class.
- Until then, `org_id` is populated but unread by production paths.

**Impact:** no app, order, booking, payment or media row is touched.
**Backward compatibility:** `projects.org_id` is defaulted, so inserts from old
code paths still succeed; the app layer treats `org_id = ''` as "legacy, resolve
via project".

### M3 — Accounts go live (dual auth window)

- New routes: `POST /auth/register`, `/auth/login`, `/auth/logout`,
  `/auth/verify`, `/auth/forgot`, `/auth/reset`, `/auth/invite/accept`.
- `user_sessions` cookie is a distinct name (`plattr_user`) scoped to `/`, with
  `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS, 30-day absolute / 7-day idle —
  matching the existing session policy.
- Authorisation resolves **either** a user session with org membership **or** a
  valid legacy owner session, and records which in request context.
- Legacy owner keys keep working for the migration window. The dashboard offers
  **Set up an account**, which starts the claim flow in §5.6 (owner key + token to
  the project's registered email); logging in alone never creates a user, a
  membership or an email binding.
- `GET /api/projects` (list my apps) is added; `POST /api/projects` now requires
  an account and attaches `org_id` + `created_by` (public creation is closed by
  flag once every active build has an owner path).

**Impact:** no change for existing businesses until they claim. Operators cannot
force-claim; they can only approve a claim that has already proven the owner key
and the registered email, or record an out-of-band verification with evidence.
**Rollback:** disable `accounts.enabled`; legacy sessions still authenticate and
claims stop being accepted.

### M4 — Team roles and operator admin

- `memberships.role` gates actions:
  `owner` (billing, delete, members) > `admin` (apps, settings, catalogue) >
  `staff` (orders, bookings, enquiries) > `viewer` (read-only).
- Operator area `/admin` (separate from `/studio`): accounts, apps, subscription
  status, usage, invoices, suspensions, audit, health. `/studio` becomes a
  pre-sales tool only and stops printing owner keys.
- Every operator action writes `audit_events` with actor identity, target org/app
  and a redacted detail string.
- `STUDIO_KEY` is retained only for the legacy board until `/admin` is verified,
  then retired.

**Impact:** none on app data; permissions become stricter, not looser.

### M5 — Subscriptions and platform billing

- `plans`/`plan_limits` seeded with Free/Starter/Growth/Business; entitlements
  read from the live subscription's plan version.
- Provider setup: separate Plattr merchant account, separate webhook endpoint
  `/billing/webhook/:provider`, separate secrets. Nothing is enabled in live mode
  without approval.
- Enforcement is added at the specific points in §5.4, behind
  `billing.enabled`; with the flag off every limit resolves to unlimited, which
  reproduces today's behaviour exactly.
- Dunning: `past_due` → grace (configurable, e.g. 7 days) → downgrade to Free.
  Apps stay online; only new privileged actions pause.

**Impact:** zero on existing apps until they are assigned a plan. Existing builds
default to `business`-equivalent entitlements during migration so no limit is hit
retroactively (recorded decision, reversible).

### M6 — Retirement of the legacy owner path

Only after: every active build has at least one verified owner; password reset
and verification are exercised; operator admin has replaced `/studio`; and the
regression suite proves legacy keys no longer grant access.

- Stop deriving/displaying owner keys; delete unused `owner_sessions` rows;
  remove the legacy branch from the auth resolver.
- Replace `OWNER_SECRET` with per-user credentials; keep `STUDIO_KEY` retired.
- Fix `deleteProject` to purge every child table and R2 objects via a queued
  job (`project_deletion_jobs`) with an audit record, instead of the current
  three-statement delete.

**Impact:** apps, tokens, orders, bookings, enquiries, media and payment history
are unchanged; only the credential that opens the dashboard changes.

### 6.1 Backward-compatibility matrix

| Change | Existing rows | Existing code | Existing links | Rollback |
| --- | --- | --- | --- | --- |
| `projects.org_id` nullable-default `''` | Untouched; backfilled | Old inserts still work | Unchanged | Drop column |
| New account tables | N/A | Not referenced until flag on | Unchanged | Drop tables |
| `owner_sessions` retained | Untouched | Still authenticates during window | Unchanged | Keep |
| Legacy owner keys | Still derivable | Still accepted until M6 | Unchanged | Re-enable branch |
| Plan/limit tables | N/A | Unlimited when flag off | Unchanged | Delete plan rows |
| `subscriptions` | N/A | Never read by app serving | Unchanged | Drop |
| Media/project delete change | N/A | Purge is broader than today | Unchanged | Revert job |

Preservation guarantees: **no project token changes, no row id changes, no schema
rewrite of `spec`/`doc`, no media re-upload, no payment re-keying.**

---

## 7. Security model and risk register

### 7.1 Proposed role matrix

| Capability | owner | admin | staff | viewer | support op | billing op | admin op |
| --- | --- | --- | --- | --- | --- | --- | --- |
| View apps/orders | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Change order/booking status | ✓ | ✓ | ✓ | — | — | — | — |
| Edit catalogue/design | ✓ | ✓ | — | — | — | — | — |
| Gateway credentials | ✓ | ✓ | — | — | — | — | — |
| Invite members | ✓ | ✓ | — | — | — | — | — |
| Billing / plan change | ✓ | — | — | — | — | ✓ | ✓ |
| Delete app/account | ✓ | — | — | — | — | — | ✓ |
| Suspend account | — | — | — | — | — | — | ✓ |
| Read audit log | ✓ (own org) | — | — | — | — | — | ✓ |

### 7.2 Risks

| Risk | Likelihood | Impact | Mitigation | Phase |
| --- | --- | --- | --- | --- |
| Global `OWNER_SECRET` compromise reveals every owner key | Medium | Critical | Move to per-user credentials; stop printing keys on `/studio`; rotate only after accounts live | M3/M6 |
| Missing `project_id`/`org_id` predicate in a new query | Medium | High | Single `requireOrgProject()` helper; every new route takes project via helper; cross-tenant regression tests per entity | M1–M5 |
| Privilege escalation via team roles (staff → owner) | Medium | High | Server-side role checks on every mutation; role changes owner-only and audited; no client-supplied role on invite accept | M4 |
| Webhook spoofing on platform billing | Low | High | Signature verify before parse; per-environment secret; reject unknown event types; timestamp tolerance | M5 |
| Duplicate/out-of-order subscription events | Medium | Medium | Unique `(provider, event_id)`; state machine upsert by provider subscription id; reconcile job | M5 |
| Account takeover via reset links | Medium | High | Hashed single-use tokens, 30-min expiry, invalidate sessions on password change, rate-limit by email + IP, no user enumeration | M3 |
| Email enumeration | High | Low | Uniform responses on register/forgot/claim-start; generic errors | M3 |
| Takeover via unverified email on a legacy project | Medium | Critical | Claims need owner key **and** a token to `projects.email`; no lazy user creation; one open claim per project; disputes freeze transfer (§5.6) | M3 |
| Claim-token guessing or replay | Low | High | Hashed single-use tokens, 60-min expiry, 5 attempts, per-project and per-connection limits, no token in URLs | M3 |
| Operator reassigns a project to themselves or a colluder | Low | Critical | Operator claims require recorded evidence, are audited, and cannot target the acting admin's own account; disputed transfers are reversible | M4 |
| Trial farming by cancel/re-subscribe | Medium | Medium | One trial per organisation via `organizations.first_trial_at`; every re-subscription writes `subscription_changes` | M5 |
| Subscription history lost on upgrade/re-subscribe | Medium | High | Many closed rows per org; only one live row (partial unique index); immutable `subscription_changes`; invoices keyed by `org_id` | M5 |
| Orphaned customer/payment data after delete | High (today) | High | Cascading purge job + R2 delete + audit, before accounts can self-delete | M6 |
| Billing data mixed into business payment tables | Medium | High | Separate tables/routes/secrets/AAD; code review rule; tests asserting no cross-writes | M5 |
| Over-limit enforcement blocks a live app | Medium | High | Limits gate *new* actions only; grace period; documented downgrade path | M5 |
| Operator overreach (support sees billing) | Medium | Medium | Role separation + audit actor + least-privilege queries | M4 |
| Plan limit drift for existing customers | Medium | Medium | Version-pinned entitlements; legacy default = generous; explicit decision record | M5 |
| Session fixation / cookie scope mistakes | Low | High | New cookie name, `__Host-` prefix where possible, rotate session id on login, revoke on password change | M3 |
| No CSP on account pages | Medium | Medium | Add nonce-based CSP with the account work, not after | M3 |
| Backup gap (no scheduled job) | High | High | Provision scheduled D1 export + a scheduled R2 bucket copy before billing goes live (R2 has no replication rule); include new tables and invoice retention | M0/M5 |

---

## 8. Implementation sequence (M0–M2 approved; M3 onward gated)

| Phase | Work | Exit criteria | Tests |
| --- | --- | --- | --- |
| 1 | This audit | Approved | — |
| 2 | M1 schema + M2 backfill (approved) | New tables exist; every project has `org_id` and its org is `unclaimed`; no users or memberships created; nothing reads the new columns | Migration idempotency; row-count parity; `unclaimed` invariant |
| 3 | Registration, verification, reset, sessions, claim flow (M3) | A new business can register, verify, log in/out, recover, and claim a legacy app with owner key + registered email; legacy login still works | Auth suite: enumeration, token reuse, expiry, session revocation, cross-org 403; claim suite: wrong email, unverified email, replay, concurrent claim, dispute |
| 4 | Organisations, multi-app, team roles (M4 part 1) | One account owns 2 apps; staff cannot see billing or credentials | Role matrix tests per route |
| 5 | Operator admin + audit (M4 part 2) | `/admin` replaces `/studio` reads; every action audited | Audit assertions; support-role denials |
| 6 | Plans, entitlements, usage (M5 part 1) | Limits resolve from data; flag-off equals today | Entitlement resolver tests; over-limit 402/409 |
| 7 | Billing integration (M5 part 2) | Test-mode subscription, invoice, dunning, cancellation in sandbox | Signed webhook replay, out-of-order, grace expiry |
| 8 | M6 retirement + purge job | Legacy keys rejected; delete purges everything | Full-suite + deletion parity |
| 9 | Browser verification | Registration → app → plan → billing in a real browser at 320/390 | Recorded screenshots |

Nothing is deployed and no billing provider is enabled without explicit approval.
Existing mobile apps and business payment connections are preserved at every step.

---

## 9. Decisions recorded (Phase 2 approval)

Approved by the product owner for M0–M2 only:

1. Independent user accounts, organisations, multiple apps per organisation,
   future team members; `projects` stays the application-data tenant root.
2. Existing studio-managed apps become **claimable** by their legitimate owners
   through the §5.6 flow; nothing is auto-assigned.
3. Four configurable tiers (Free, Starter, Growth, Business), limits in database
   records; no final pricing; plan limits never take a live app, order or payment
   offline.
4. Provider-independent billing adapters for Razorpay Subscriptions and Stripe
   Billing, fully separate from business customer payments.
5. **Resend** is the preferred email provider, subject to a verified sender
   domain; verification, reset, invitations, subscription notices and security
   notifications all go through it.
6. Platform administration with `support|billing|admin` roles and a recorded
   actor for every action; owner credentials are never shown to operators.
7. M0–M2 now; evidence (schema, backfill, security review, migration tests) is
   presented before M3.

### 9.1 Open decisions before M5

1. **Pricing and currency** per plan, and whether Free is permanent or trial-only.
2. **Billing provider** for production: Razorpay Subscriptions, Stripe Billing, or
   both behind the adapter — requires documented merchant eligibility, supported
   countries, currencies and operating costs.
3. **Sender domain** for Resend (DNS, SPF/DKIM/DMARC) and the `From`/reply-to
   addresses.
4. **Definition of a published app** — approve-only, or a separate publish toggle.
5. **Legacy entitlement default** during migration (proposed: most generous plan).
6. **Data retention** for invoices and audit events (financial vs operational).
7. **Whether existing studio-managed builds become self-serve accounts** or stay
   operator-managed with an account attached.

## 10. Scope boundaries

- Audit and proposal complete; M0–M2 approved, **M3 onward not started**.
- No schema, auth, route, UI or billing implementation has been applied yet.
- No change to app generation, document model, renderer, editor or payment flow.
- No deployment, no live billing, no production secret changes, no retirement of
  legacy authentication.
