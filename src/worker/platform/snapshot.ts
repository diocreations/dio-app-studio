/**
 * Before/after evidence for M1–M2.
 *
 * A migration that claims "nothing changed" needs to show it. These helpers
 * count every existing table and hash the contents of the tables the backfill
 * must not touch, so a report can compare two snapshots taken at different
 * points. Only hashes are ever printed: `payment_connections` holds encrypted
 * credentials and must not leak into logs or reports.
 */

/** Tables whose row contents must be byte-for-byte preserved. */
export const PRESERVED_TABLES = [
  'projects',
  'notes',
  'activity',
  'doc_versions',
  'media',
  'customers',
  'orders',
  'order_items',
  'bookings',
  'enquiries',
  'payment_connections',
  'payment_settings',
  'payment_transactions',
  'payment_events',
] as const

/** Additionally counted (volatile: sessions and counters move on their own). */
export const COUNTED_TABLES = [
  ...PRESERVED_TABLES,
  'notifications',
  'owner_sessions',
  'variation_counter',
  'import_budget',
  'daily_budget',
] as const

export type TableName = (typeof COUNTED_TABLES)[number]

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function tableCount(db: D1Database, table: string): Promise<number | null> {
  try {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>()
    return Number(row?.n ?? 0)
  } catch {
    return null
  }
}

export type LegacySnapshot = {
  at: string
  counts: Record<string, number | null>
  digests: Record<string, string>
  combined: string
}

/**
 * `projects.org_id` / `created_by` are the two columns M1–M2 are allowed to
 * write, so they are excluded from the preservation digest: every business
 * column, id and token must still hash identically.
 */
async function digestTable(db: D1Database, table: string): Promise<string> {
  let columns = '*'
  if (table === 'projects') {
    try {
      const info = await db.prepare('PRAGMA table_info(projects)').all<{ name: string }>()
      const names = (info.results ?? [])
        .map((row) => row.name)
        .filter((name) => name !== 'org_id' && name !== 'created_by')
      if (names.length) columns = names.join(', ')
    } catch {
      // Fall back to every column; the digest is compared with itself only.
    }
  }
  const { results } = await db.prepare(`SELECT ${columns} FROM ${table} ORDER BY rowid`).all()
  return sha256(JSON.stringify(results ?? []))
}

export async function legacySnapshot(
  db: D1Database,
  at = new Date().toISOString(),
): Promise<LegacySnapshot> {
  const counts: Record<string, number | null> = {}
  for (const table of COUNTED_TABLES) counts[table] = await tableCount(db, table)

  const digests: Record<string, string> = {}
  for (const table of PRESERVED_TABLES) {
    if (counts[table] === null) {
      digests[table] = 'missing'
      continue
    }
    digests[table] = await digestTable(db, table)
  }
  const combined = await sha256(
    PRESERVED_TABLES.map((table) => `${table}:${digests[table]}`).join('|'),
  )
  return { at, counts, digests, combined }
}

export type SnapshotDiff = {
  countChanges: { table: string; before: number | null; after: number | null }[]
  digestChanges: string[]
  preserved: boolean
}

export function diffSnapshots(before: LegacySnapshot, after: LegacySnapshot): SnapshotDiff {
  const countChanges = Object.keys(before.counts)
    .filter((table) => before.counts[table] !== after.counts[table])
    .map((table) => ({ table, before: before.counts[table], after: after.counts[table] ?? null }))
  const digestChanges = PRESERVED_TABLES.filter(
    (table) => before.digests[table] !== after.digests[table],
  )
  return {
    countChanges,
    digestChanges: [...digestChanges],
    preserved: digestChanges.length === 0,
  }
}
