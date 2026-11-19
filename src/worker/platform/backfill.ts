/**
 * M2 — one synthetic organisation per existing project.
 *
 * Preserves today's isolation exactly: every app gets its own organisation, so
 * nothing becomes visible to anything else. The organisation is deliberately
 * `unclaimed`, no user or membership is created, and `projects.org_id` is the
 * only row that changes. Running it again is a no-op.
 *
 * The organisation id is derived from the immutable project token
 * (`org_<token>`) and the slug from the same value (`app-<token>`), so a
 * re-run, a partial failure or a restored backup all converge on the same rows
 * instead of inventing new ones.
 */

import { changes, recordAudit } from './audit'
import { ensurePlatformSchema } from './schema'

export type BackfillOptions = { batchSize?: number; at?: string }

export type BackfillReport = {
  at: string
  projects: number
  linkedProjects: number
  createdOrganizations: number
  linkedNow: number
  alreadyLinked: number
  invalidProjects: number
  batches: number
}

const DEFAULT_BATCH = 100
const MAX_BATCHES = 1000

export function organizationIdForProject(token: string): string {
  return `org_${token}`
}

export function organizationSlugForProject(token: string): string {
  return `app-${token}`
}

export async function backfillProjectOrganizations(
  db: D1Database,
  options: BackfillOptions = {},
): Promise<BackfillReport> {
  await ensurePlatformSchema(db)
  const at = options.at ?? new Date().toISOString()
  const batchSize = Math.max(1, Math.min(500, options.batchSize ?? DEFAULT_BATCH))

  const totals = await db
    .prepare(
      `SELECT COUNT(*) AS projects,
              SUM(CASE WHEN org_id <> '' THEN 1 ELSE 0 END) AS linked,
              SUM(CASE WHEN token = '' THEN 1 ELSE 0 END) AS invalid
         FROM projects`,
    )
    .first<{ projects: number; linked: number | null; invalid: number | null }>()

  let createdOrganizations = 0
  let linkedNow = 0
  let batches = 0
  const invalidProjects = Number(totals?.invalid ?? 0)

  while (batches < MAX_BATCHES) {
    const { results } = await db
      .prepare(
        `SELECT id, token, name, created_at FROM projects
          WHERE org_id = '' AND token <> '' ORDER BY rowid LIMIT ?`,
      )
      .bind(batchSize)
      .all<{ id: string; token: string; name: string; created_at: string }>()
    const rows = results ?? []
    if (rows.length === 0) break
    batches += 1

    for (const project of rows) {
      const orgId = organizationIdForProject(project.token)
      const slug = organizationSlugForProject(project.token)
      const created = project.created_at || at
      const inserted = await db
        .prepare(
          `INSERT OR IGNORE INTO organizations
            (id, name, slug, country, currency, status, claim_status, claimed_at,
             first_trial_at, created_at, updated_at)
           VALUES (?, ?, ?, '', 'USD', 'active', 'unclaimed', '', '', ?, ?)
           RETURNING id`,
        )
        .bind(orgId, (project.name || 'Untitled app').slice(0, 120), slug, created, created)
        .first<{ id: string }>()
      if (inserted) createdOrganizations += 1

      const linked = await db
        .prepare(`UPDATE projects SET org_id = ? WHERE id = ? AND org_id = ''`)
        .bind(orgId, project.id)
        .run()
      if (changes(linked) > 0) linkedNow += 1

      if (inserted) {
        // One audit row per organisation the backfill created, never per re-run.
        await recordAudit(db, {
          actorType: 'system',
          orgId,
          projectId: project.id,
          action: 'backfill.organization_created',
          target: orgId,
          detail: 'M2 backfill: synthetic unclaimed organisation, no owner',
          at,
        })
      }
    }
  }

  const after = await db
    .prepare(
      `SELECT SUM(CASE WHEN org_id <> '' THEN 1 ELSE 0 END) AS linked FROM projects`,
    )
    .first<{ linked: number | null }>()

  return {
    at,
    projects: Number(totals?.projects ?? 0),
    linkedProjects: Number(after?.linked ?? 0),
    createdOrganizations,
    linkedNow,
    alreadyLinked: Number(totals?.linked ?? 0),
    invalidProjects,
    batches,
  }
}

export type Reconciliation = {
  projects: number
  linkedProjects: number
  unlinkedProjects: number
  organizations: number
  syntheticOrganizations: number
  syntheticUnclaimed: number
  orphanOrganizations: number
  projectsWithUnknownOrg: number
  users: number
  memberships: number
  invitations: number
  claims: number
  transfers: number
  subscriptions: number
  ok: boolean
}

async function count(db: D1Database, sql: string, ...values: unknown[]): Promise<number> {
  const statement = values.length ? db.prepare(sql).bind(...values) : db.prepare(sql)
  const row = await statement.first<{ n: number }>()
  return Number(row?.n ?? 0)
}

/**
 * The post-M2 invariant set. `ok` is the gate for "backfill is complete and
 * created no ownership": every project is linked, every synthetic organisation
 * belongs to a project and is unclaimed, and no user, membership, claim,
 * transfer or subscription exists yet.
 */
export async function reconcileBackfill(db: D1Database): Promise<Reconciliation> {
  await ensurePlatformSchema(db)
  const projects = await count(db, 'SELECT COUNT(*) AS n FROM projects')
  const linkedProjects = await count(
    db,
    `SELECT COUNT(*) AS n FROM projects WHERE org_id <> ''`,
  )
  const organizations = await count(db, 'SELECT COUNT(*) AS n FROM organizations')
  const syntheticOrganizations = await count(
    db,
    `SELECT COUNT(*) AS n FROM organizations WHERE slug LIKE 'app-%'`,
  )
  const syntheticUnclaimed = await count(
    db,
    `SELECT COUNT(*) AS n FROM organizations WHERE slug LIKE 'app-%' AND claim_status = 'unclaimed'`,
  )
  const orphanOrganizations = await count(
    db,
    `SELECT COUNT(*) AS n FROM organizations o
      WHERE o.slug LIKE 'app-%'
        AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.org_id = o.id)`,
  )
  const projectsWithUnknownOrg = await count(
    db,
    `SELECT COUNT(*) AS n FROM projects p
      WHERE p.org_id <> '' AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = p.org_id)`,
  )
  const users = await count(db, 'SELECT COUNT(*) AS n FROM users')
  const memberships = await count(db, 'SELECT COUNT(*) AS n FROM memberships')
  const invitations = await count(db, 'SELECT COUNT(*) AS n FROM invitations')
  const claims = await count(db, 'SELECT COUNT(*) AS n FROM project_claims')
  const transfers = await count(db, 'SELECT COUNT(*) AS n FROM ownership_transfers')
  const subscriptions = await count(db, 'SELECT COUNT(*) AS n FROM subscriptions')

  const result: Reconciliation = {
    projects,
    linkedProjects,
    unlinkedProjects: projects - linkedProjects,
    organizations,
    syntheticOrganizations,
    syntheticUnclaimed,
    orphanOrganizations,
    projectsWithUnknownOrg,
    users,
    memberships,
    invitations,
    claims,
    transfers,
    subscriptions,
    ok: false,
  }
  result.ok =
    result.unlinkedProjects === 0 &&
    result.orphanOrganizations === 0 &&
    result.projectsWithUnknownOrg === 0 &&
    result.users === 0 &&
    result.memberships === 0 &&
    result.invitations === 0 &&
    result.claims === 0 &&
    result.transfers === 0 &&
    result.subscriptions === 0 &&
    result.syntheticUnclaimed === result.syntheticOrganizations
  return result
}

/** Ids only, for the report: proves ids and tokens survived the migration. */
export async function projectIdentityDigestRows(
  db: D1Database,
): Promise<{ id: string; token: string }[]> {
  const { results } = await db
    .prepare('SELECT id, token FROM projects ORDER BY rowid')
    .all<{ id: string; token: string }>()
  return results ?? []
}
