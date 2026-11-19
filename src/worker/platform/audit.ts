/** Shared id and audit helpers for the platform modules. */

export function newPlatformId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export type AuditInput = {
  actorType: 'user' | 'operator' | 'system'
  actorId?: string
  orgId?: string
  projectId?: string
  action: string
  target?: string
  detail?: string
  ipHash?: string
  at?: string
}

/**
 * Every operator or system action that changes ownership, billing or access
 * writes one of these. `detail` is a redacted summary — never a key, token or
 * credential.
 */
export async function recordAudit(db: D1Database, input: AuditInput): Promise<string> {
  const id = newPlatformId('aud')
  await db
    .prepare(
      `INSERT INTO audit_events
        (id, actor_type, actor_id, org_id, project_id, action, target, detail, ip_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.actorType,
      input.actorId ?? '',
      input.orgId ?? '',
      input.projectId ?? '',
      input.action,
      input.target ?? '',
      (input.detail ?? '').slice(0, 400),
      input.ipHash ?? '',
      input.at ?? new Date().toISOString(),
    )
    .run()
  return id
}

export function changes(result: unknown): number {
  const meta = (result as { meta?: { changes?: number } } | null)?.meta
  return Number(meta?.changes ?? 0)
}
