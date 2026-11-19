/**
 * Owner access is deliberately separate from the customer app token. The app
 * token is a public capability used to open the customer experience; it must
 * never be enough to read customer contact details or change an order.
 *
 * The owner key is derived from a server secret and the project token. It is
 * shown only on the operator-authenticated studio board, can be rotated by
 * rotating OWNER_SECRET, and is exchanged for a short-lived random session in
 * D1. The session cookie is scoped to the project path and is HttpOnly.
 */

export const OWNER_SESSION_DAYS = 30
/** Absolute sessions last 30 days; a session unused for this long is dead. */
export const OWNER_IDLE_DAYS = 7

/**
 * One cookie name per project, because the cookie is scoped to the origin root
 * so /api requests can see it. Two owner sessions in one browser therefore do
 * not overwrite each other.
 */
export function ownerCookieName(token: string): string {
  return `plattr_owner_${token.slice(0, 12)}`
}

const encoder = new TextEncoder()

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function same(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message))))
}

/** A stable, per-project owner key. Never expose this to the customer app. */
export async function ownerAccessKey(token: string, secret: string): Promise<string> {
  if (!secret) return ''
  const digest = await hmac(secret, 'plattr-owner-key-v1:' + token)
  return digest.slice(0, 32)
}

export async function matchesOwnerKey(given: string, token: string, secret: string): Promise<boolean> {
  if (!given || !secret) return false
  return same(given.trim().toLowerCase(), await ownerAccessKey(token, secret))
}

export async function createOwnerSession(
  db: D1Database,
  projectId: string,
): Promise<{ id: string; expiresAt: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const id = 'own_' + [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const now = new Date()
  const expires = new Date(now.getTime() + OWNER_SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db
    .prepare('INSERT INTO owner_sessions (id, project_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, projectId, now.toISOString(), expires.toISOString(), now.toISOString())
    .run()
  return { id, expiresAt: expires.toISOString() }
}

export async function hasOwnerSession(
  db: D1Database,
  projectId: string,
  cookie: string | undefined,
): Promise<boolean> {
  if (!cookie || !/^own_[a-f0-9]{48}$/.test(cookie)) return false
  const row = await db
    .prepare('SELECT expires_at, created_at, last_seen_at FROM owner_sessions WHERE id = ? AND project_id = ?')
    .bind(cookie, projectId)
    .first<{ expires_at: string; created_at: string; last_seen_at: string }>()
  if (!row || Date.parse(row.expires_at) <= Date.now()) return false
  const lastSeen = Date.parse(row.last_seen_at || row.created_at)
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > OWNER_IDLE_DAYS * 24 * 60 * 60 * 1000) return false
  // Avoid a write on every dashboard poll; one update an hour is enough to
  // keep the idle window accurate without turning reads into write traffic.
  if (Date.now() - lastSeen > 60 * 60 * 1000)
    await db.prepare('UPDATE owner_sessions SET last_seen_at = ? WHERE id = ?').bind(new Date().toISOString(), cookie).run()
  return true
}

export async function deleteOwnerSession(db: D1Database, cookie: string | undefined): Promise<void> {
  if (!cookie) return
  await db.prepare('DELETE FROM owner_sessions WHERE id = ?').bind(cookie).run()
}

/** Revoke every browser session for one business. */
export async function deleteOwnerSessions(db: D1Database, projectId: string): Promise<void> {
  await db.prepare('DELETE FROM owner_sessions WHERE project_id = ?').bind(projectId).run()
}
