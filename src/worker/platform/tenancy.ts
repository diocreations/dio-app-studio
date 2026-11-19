/**
 * Organisation-scoped reads.
 *
 * Every platform query that returns business data must take the organisation
 * from the authenticated session, never from the request. These helpers exist
 * so the scoping is one line at the call site and testable in isolation: a
 * project belonging to another organisation is simply not found.
 */

export type OrgProject = {
  id: string
  token: string
  name: string
  status: string
  version: number
  created_at: string
  updated_at: string
}

export async function listOrgProjects(
  db: D1Database,
  orgId: string,
  limit = 200,
): Promise<OrgProject[]> {
  if (!orgId) return []
  const { results } = await db
    .prepare(
      `SELECT id, token, name, status, version, created_at, updated_at
         FROM projects WHERE org_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(orgId, Math.max(1, Math.min(500, limit)))
    .all<OrgProject>()
  return results ?? []
}

export async function getOrgProject(
  db: D1Database,
  orgId: string,
  projectId: string,
): Promise<OrgProject | null> {
  if (!orgId || !projectId) return null
  return db
    .prepare(
      `SELECT id, token, name, status, version, created_at, updated_at
         FROM projects WHERE id = ? AND org_id = ?`,
    )
    .bind(projectId, orgId)
    .first<OrgProject>()
}

export async function countOrgProjects(db: D1Database, orgId: string): Promise<number> {
  if (!orgId) return 0
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM projects WHERE org_id = ?')
    .bind(orgId)
    .first<{ n: number }>()
  return Number(row?.n ?? 0)
}
