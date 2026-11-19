/**
 * M1 — additive platform schema.
 *
 * Nothing here alters or rewrites an existing row. Existing tables are only
 * extended with two defaulted columns (`projects.org_id`, `projects.created_by`)
 * that the current code never reads, so an older Worker keeps working against a
 * migrated database and a newer Worker keeps working against an unmigrated one
 * until the backfill runs.
 *
 * The subscription tables are shaped around one contract per row:
 * `subscriptions_one_live_per_org` is a *partial* unique index, so an
 * organisation can keep every closed contract (cancelled, expired, replaced)
 * while only one may be live at a time. `subscription_changes` is the immutable
 * plan-move log and `platform_invoices` stays keyed by `org_id`, so superseding
 * a contract never rewrites billing history.
 */

/** Parents first; rollback drops this list in reverse. */
export const PLATFORM_TABLES = [
  'users',
  'user_sessions',
  'auth_tokens',
  'organizations',
  'memberships',
  'invitations',
  'project_claims',
  'ownership_transfers',
  'plans',
  'plan_limits',
  'subscriptions',
  'subscription_changes',
  'platform_invoices',
  'platform_billing_events',
  'operator_roles',
  'audit_events',
  'usage_events',
] as const

export type PlatformTable = (typeof PLATFORM_TABLES)[number]

export const PLATFORM_SCHEMA = [
  // ---------------------------------------------------------------- identity
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL UNIQUE,
    email_verified_at TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    display_name TEXT NOT NULL DEFAULT '',
    locale TEXT NOT NULL DEFAULT 'en',
    created_at TEXT NOT NULL,
    last_login_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id),
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL DEFAULT '',
    revoked_at TEXT NOT NULL DEFAULT '',
    user_agent_hash TEXT NOT NULL DEFAULT '',
    ip_hash TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS user_sessions_by_user ON user_sessions (user_id, expires_at)`,
  `CREATE TABLE IF NOT EXISTS auth_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id),
    purpose TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS auth_tokens_by_user ON auth_tokens (user_id, purpose)`,

  // ----------------------------------------------------------------- tenancy
  `CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    country TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'active',
    claim_status TEXT NOT NULL DEFAULT 'claimed',
    claimed_at TEXT NOT NULL DEFAULT '',
    first_trial_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS organizations_by_claim ON organizations (claim_status, created_at)`,
  `CREATE TABLE IF NOT EXISTS memberships (
    org_id TEXT NOT NULL REFERENCES organizations (id),
    user_id TEXT NOT NULL REFERENCES users (id),
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TEXT NOT NULL,
    invited_by TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (org_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS memberships_by_user ON memberships (user_id)`,
  `CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations (id),
    email_normalized TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    token_hash TEXT NOT NULL UNIQUE,
    invited_by TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    accepted_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS invitations_by_org ON invitations (org_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS invitations_by_email ON invitations (email_normalized, created_at)`,

  // ------------------------------------------------------- ownership evidence
  `CREATE TABLE IF NOT EXISTS project_claims (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects (id),
    user_id TEXT NOT NULL REFERENCES users (id),
    email_normalized TEXT NOT NULL,
    email_source TEXT NOT NULL DEFAULT 'project',
    verify_token_hash TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending_email',
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    email_verified_at TEXT NOT NULL DEFAULT '',
    decided_at TEXT NOT NULL DEFAULT '',
    decided_by TEXT NOT NULL DEFAULT '',
    decision_note TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS project_claims_one_open
     ON project_claims (project_id)
     WHERE status IN ('pending_email', 'pending_review', 'disputed')`,
  `CREATE INDEX IF NOT EXISTS project_claims_by_user ON project_claims (user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS ownership_transfers (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects (id),
    claim_id TEXT NOT NULL DEFAULT '',
    from_org_id TEXT NOT NULL DEFAULT '',
    to_org_id TEXT NOT NULL REFERENCES organizations (id),
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    evidence TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    reversed_at TEXT NOT NULL DEFAULT '',
    reversal_reason TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS ownership_transfers_by_project
     ON ownership_transfers (project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS ownership_transfers_by_org
     ON ownership_transfers (to_org_id, created_at)`,

  // ------------------------------------------------------- plans and billing
  `CREATE TABLE IF NOT EXISTS plans (
    plan_key TEXT NOT NULL,
    version INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_minor INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    interval TEXT NOT NULL DEFAULT 'month',
    trial_days INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    PRIMARY KEY (plan_key, version)
  )`,
  `CREATE TABLE IF NOT EXISTS plan_limits (
    plan_key TEXT NOT NULL,
    version INTEGER NOT NULL,
    limit_key TEXT NOT NULL,
    value INTEGER NOT NULL,
    unit TEXT NOT NULL DEFAULT 'count',
    PRIMARY KEY (plan_key, version, limit_key)
  )`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations (id),
    plan_key TEXT NOT NULL,
    plan_version INTEGER NOT NULL,
    provider TEXT NOT NULL DEFAULT '',
    provider_customer_id TEXT NOT NULL DEFAULT '',
    provider_subscription_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'trialing',
    previous_subscription_id TEXT NOT NULL DEFAULT '',
    superseded_by TEXT NOT NULL DEFAULT '',
    trial_ends_at TEXT NOT NULL DEFAULT '',
    current_period_start TEXT NOT NULL DEFAULT '',
    current_period_end TEXT NOT NULL DEFAULT '',
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    grace_until TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS subscriptions_by_org ON subscriptions (org_id, created_at)`,
  // The only cardinality constraint: many closed contracts, one live one.
  `CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_live_per_org
     ON subscriptions (org_id)
     WHERE status IN ('trialing', 'active', 'past_due', 'grace')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_by_provider
     ON subscriptions (provider, provider_subscription_id)
     WHERE provider_subscription_id <> ''`,
  `CREATE TABLE IF NOT EXISTS subscription_changes (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations (id),
    subscription_id TEXT NOT NULL REFERENCES subscriptions (id),
    next_subscription_id TEXT NOT NULL DEFAULT '',
    from_plan_key TEXT NOT NULL,
    from_plan_version INTEGER NOT NULL,
    to_plan_key TEXT NOT NULL,
    to_plan_version INTEGER NOT NULL,
    change_type TEXT NOT NULL,
    effective_at TEXT NOT NULL,
    actor_type TEXT NOT NULL DEFAULT 'system',
    actor_id TEXT NOT NULL DEFAULT '',
    provider_event_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS subscription_changes_by_org
     ON subscription_changes (org_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS subscription_changes_by_subscription
     ON subscription_changes (subscription_id, created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS subscription_changes_by_event
     ON subscription_changes (provider_event_id)
     WHERE provider_event_id <> ''`,
  `CREATE TABLE IF NOT EXISTS platform_invoices (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations (id),
    subscription_id TEXT NOT NULL REFERENCES subscriptions (id),
    provider TEXT NOT NULL,
    provider_invoice_id TEXT NOT NULL DEFAULT '',
    amount_minor INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'open',
    issued_at TEXT NOT NULL,
    paid_at TEXT NOT NULL DEFAULT '',
    pdf_url TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS platform_invoices_by_org ON platform_invoices (org_id, issued_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS platform_invoices_by_provider
     ON platform_invoices (provider, provider_invoice_id)
     WHERE provider_invoice_id <> ''`,
  `CREATE TABLE IF NOT EXISTS platform_billing_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'received',
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (provider, event_id)
  )`,

  // ------------------------------------------------------- platform operations
  `CREATE TABLE IF NOT EXISTS operator_roles (
    user_id TEXT PRIMARY KEY REFERENCES users (id),
    role TEXT NOT NULL DEFAULT 'support',
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL DEFAULT '',
    org_id TEXT NOT NULL DEFAULT '',
    project_id TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    ip_hash TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS audit_events_by_org ON audit_events (org_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS audit_events_by_project ON audit_events (project_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS audit_events_by_action ON audit_events (action, created_at)`,
  `CREATE TABLE IF NOT EXISTS usage_events (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations (id),
    project_id TEXT NOT NULL DEFAULT '',
    metric TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    period TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS usage_events_by_org ON usage_events (org_id, metric, period)`,
]

/**
 * `ALTER TABLE` cannot use `IF NOT EXISTS`, so these are attempted and a
 * duplicate-column error is treated as "already applied".
 */
export const PLATFORM_COLUMNS = [
  `ALTER TABLE projects ADD COLUMN org_id TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE projects ADD COLUMN created_by TEXT NOT NULL DEFAULT ''`,
  `CREATE INDEX IF NOT EXISTS projects_by_org ON projects (org_id, created_at)`,
]

const ready = new WeakMap<D1Database, Promise<void>>()

export function ensurePlatformSchema(db: D1Database): Promise<void> {
  const existing = ready.get(db)
  if (existing) return existing
  const setup = (async () => {
    // D1 enforces foreign keys itself; this makes the same guarantee hold for
    // the local SQLite engine used by tests and the migration script.
    try {
      await db.prepare('PRAGMA foreign_keys = ON').run()
    } catch {
      // Not supported on this binding; D1's own enforcement still applies.
    }
    for (const statement of PLATFORM_SCHEMA) await db.prepare(statement).run()
    for (const statement of PLATFORM_COLUMNS) {
      try {
        await db.prepare(statement).run()
      } catch (error) {
        if (!/duplicate column/i.test(String(error))) throw error
      }
    }
  })()
  ready.set(db, setup)
  return setup
}

export type PlatformSchemaState = {
  present: PlatformTable[]
  missing: PlatformTable[]
  projectColumns: { org_id: boolean; created_by: boolean }
  complete: boolean
}

export async function platformSchemaState(db: D1Database): Promise<PlatformSchemaState> {
  const { results } = await db
    .prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name IN (${PLATFORM_TABLES.map(() => '?').join(', ')})`,
    )
    .bind(...PLATFORM_TABLES)
    .all<{ name: string }>()
  const found = new Set((results ?? []).map((row) => row.name))
  const present = PLATFORM_TABLES.filter((table) => found.has(table))
  const missing = PLATFORM_TABLES.filter((table) => !found.has(table))
  const columns = await db.prepare('PRAGMA table_info(projects)').all<{ name: string }>()
  const names = new Set((columns.results ?? []).map((row) => row.name))
  const projectColumns = { org_id: names.has('org_id'), created_by: names.has('created_by') }
  return {
    present: [...present],
    missing: [...missing],
    projectColumns,
    complete: missing.length === 0 && projectColumns.org_id && projectColumns.created_by,
  }
}

/**
 * Rollback for M1: remove only what M1 added. Project rows, tokens and every
 * pre-existing table are untouched. If the SQLite build cannot drop columns the
 * two nullable, defaulted columns are left behind — an old Worker ignores them,
 * so that is a safe end state rather than a half-rollback.
 */
export type RollbackResult = {
  droppedTables: string[]
  columnsDropped: boolean
  remaining: PlatformTable[]
}

export async function rollbackPlatformSchema(db: D1Database): Promise<RollbackResult> {
  const dropped: string[] = []
  for (const table of [...PLATFORM_TABLES].reverse()) {
    try {
      await db.prepare(`DROP TABLE IF EXISTS ${table}`).run()
      dropped.push(table)
    } catch {
      // A table another object still depends on stays; reported below.
    }
  }
  await db.prepare('DROP INDEX IF EXISTS projects_by_org').run()
  for (const column of ['created_by', 'org_id']) {
    try {
      await db.prepare(`ALTER TABLE projects DROP COLUMN ${column}`).run()
    } catch {
      // Reported by the state check below; a leftover nullable column is a
      // safe end state, a wrong "dropped" claim would not be.
    }
  }
  const state = await platformSchemaState(db)
  return {
    droppedTables: dropped,
    columnsDropped: !state.projectColumns.org_id && !state.projectColumns.created_by,
    remaining: state.present,
  }
}

/** Used by the CLI/report only; safe to call repeatedly. */
export async function projectColumnNames(db: D1Database): Promise<string[]> {
  const columns = await db.prepare('PRAGMA table_info(projects)').all<{ name: string }>()
  return (columns.results ?? []).map((row) => row.name)
}
