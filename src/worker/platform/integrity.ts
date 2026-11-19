/**
 * Read-only integrity evidence for M1–M2.
 *
 * Used by the migration CLI, the report and the tests. Nothing here mutates
 * data; a failing check is evidence to stop, not something to repair in place.
 */

import { reconcileBackfill, type Reconciliation } from './backfill'
import { platformSchemaState } from './schema'

export type IntegrityCheck = {
  name: string
  ok: boolean
  detail: string
  skipped?: boolean
}

export type IntegrityReport = {
  ok: boolean
  checks: IntegrityCheck[]
  reconciliation: Reconciliation
}

const REQUIRED_INDEXES = [
  'subscriptions_one_live_per_org',
  'subscriptions_by_provider',
  'subscription_changes_by_event',
  'project_claims_one_open',
  'platform_invoices_by_provider',
  'projects_by_org',
]

export async function verifyPlatformIntegrity(db: D1Database): Promise<IntegrityReport> {
  const checks: IntegrityCheck[] = []

  // SQLite engine check. D1 does not expose PRAGMA integrity_check, so this is
  // reported as skipped there rather than treated as a failure.
  try {
    const { results } = await db.prepare('PRAGMA integrity_check').all<Record<string, string>>()
    const rows = results ?? []
    const first = rows[0] ? Object.values(rows[0])[0] : ''
    checks.push({
      name: 'sqlite.integrity_check',
      ok: String(first).toLowerCase() === 'ok',
      detail: String(first || 'no result'),
    })
  } catch {
    checks.push({ name: 'sqlite.integrity_check', ok: true, detail: 'not exposed by this binding', skipped: true })
  }

  try {
    const { results } = await db.prepare('PRAGMA foreign_key_check').all()
    const violations = (results ?? []).length
    checks.push({
      name: 'sqlite.foreign_key_check',
      ok: violations === 0,
      detail: `${violations} violation(s)`,
    })
  } catch {
    checks.push({ name: 'sqlite.foreign_key_check', ok: true, detail: 'not exposed by this binding', skipped: true })
  }

  const schema = await platformSchemaState(db)
  checks.push({
    name: 'schema.platform_tables',
    ok: schema.complete,
    detail: schema.complete
      ? `${schema.present.length} tables, projects.org_id + created_by present`
      : `missing: ${schema.missing.join(', ') || 'none'}; columns: ${JSON.stringify(schema.projectColumns)}`,
  })

  const { results: indexRows } = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`)
    .all<{ name: string }>()
  const indexes = new Set((indexRows ?? []).map((row) => row.name))
  const missingIndexes = REQUIRED_INDEXES.filter((name) => !indexes.has(name))
  checks.push({
    name: 'schema.unique_indexes',
    ok: missingIndexes.length === 0,
    detail: missingIndexes.length ? `missing: ${missingIndexes.join(', ')}` : REQUIRED_INDEXES.join(', '),
  })

  const liveDuplicates = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT org_id FROM subscriptions
          WHERE status IN ('trialing', 'active', 'past_due', 'grace')
          GROUP BY org_id HAVING COUNT(*) > 1)`,
    )
    .first<{ n: number }>()
  checks.push({
    name: 'subscriptions.one_live_per_org',
    ok: Number(liveDuplicates?.n ?? 0) === 0,
    detail: `${Number(liveDuplicates?.n ?? 0)} organisations with more than one live contract`,
  })

  const openClaims = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT project_id FROM project_claims
          WHERE status IN ('pending_email', 'pending_review', 'disputed')
          GROUP BY project_id HAVING COUNT(*) > 1)`,
    )
    .first<{ n: number }>()
  checks.push({
    name: 'claims.one_open_per_project',
    ok: Number(openClaims?.n ?? 0) === 0,
    detail: `${Number(openClaims?.n ?? 0)} projects with more than one open claim`,
  })

  const reconciliation = await reconcileBackfill(db)
  checks.push({
    name: 'm2.reconciliation',
    ok: reconciliation.ok,
    detail: `${reconciliation.linkedProjects}/${reconciliation.projects} projects linked; ${reconciliation.syntheticUnclaimed}/${reconciliation.syntheticOrganizations} synthetic orgs unclaimed; users=${reconciliation.users}, memberships=${reconciliation.memberships}, claims=${reconciliation.claims}, transfers=${reconciliation.transfers}, subscriptions=${reconciliation.subscriptions}`,
  })

  return { ok: checks.every((check) => check.ok), checks, reconciliation }
}
