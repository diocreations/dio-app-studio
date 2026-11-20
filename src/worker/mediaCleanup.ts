import { ensureSchema, type Project } from './db'
import { collectMediaIds, variantKey, type MediaBucket } from './media'

/**
 * Two-stage removal of uploads nothing points at.
 *
 * Stage A (`planMediaCleanup`) reads every place a reference can live for one
 * project and lists the rows that are genuinely unused and older than the grace
 * period. Stage B (`executeMediaCleanup`) re-reads those references immediately
 * before touching storage, deletes the stored variants, then the metadata row,
 * and writes one audit entry per item. A failed object delete leaves the row in
 * place so the same command can be retried; nothing here is a one-way door
 * without a backup id to point at.
 */

const MIN_GRACE_HOURS = 24
const MAX_GRACE_HOURS = 24 * 30

export type MediaCleanupObject = { key: string; width: number; height: number; bytes: number }

export type MediaCleanupCandidate = {
  id: string
  hash: string
  createdAt: string
  ageHours: number
  bytes: number
  objects: MediaCleanupObject[]
}

export type MediaCleanupReport = {
  projectId: string
  token: string
  name: string
  graceHours: number
  checkedAt: string
  uploads: number
  protectedUploads: number
  candidates: MediaCleanupCandidate[]
  skipped: { id: string; reason: string }[]
  objects: number
  bytes: number
  references: { currentDocument: boolean; versions: number; catalog: boolean }
}

export type MediaCleanupOutcome = {
  runId: string
  dryRun: false
  backupId: string
  deleted: { id: string; objects: string[]; bytes: number }[]
  skipped: { id: string; reason: string }[]
  failed: { id: string; reason: string }[]
  report: MediaCleanupReport
}

export type MediaCleanupErrorCode =
  | 'reference_check_failed'
  | 'backup_required'
  | 'confirmation_required'
  | 'media_unavailable'

export class MediaCleanupError extends Error {
  constructor(
    readonly code: MediaCleanupErrorCode,
    message: string,
    readonly status = 409,
  ) {
    super(message)
  }
}

type MediaRow = {
  id: string
  project_id: string
  hash: string
  created_at: string
  bytes: number
  variants: string
}

type References = {
  current: unknown
  spec: unknown
  versions: unknown[]
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function newId(prefix: string): string {
  return `${prefix}_${hex(crypto.getRandomValues(new Uint8Array(10)))}`
}

export function clampGraceHours(value: unknown): number {
  const hours = Number(value ?? MIN_GRACE_HOURS)
  if (!Number.isFinite(hours)) return MIN_GRACE_HOURS
  return Math.min(MAX_GRACE_HOURS, Math.max(MIN_GRACE_HOURS, Math.floor(hours)))
}

/**
 * Reads the raw stored document, specification and every saved version.
 *
 * `toProject` falls back to `null` when a document cannot be parsed, which is
 * right for rendering and wrong for deletion: an unreadable document might name
 * any image. Here a parse failure stops the whole operation instead.
 */
async function readReferences(db: D1Database, project: Project): Promise<References> {
  const row = await db
    .prepare('SELECT doc, spec FROM projects WHERE id = ?')
    .bind(project.id)
    .first<{ doc: string; spec: string }>()

  const parse = (text: string | undefined, label: string): unknown => {
    if (!text || !text.trim()) return null
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new MediaCleanupError(
        'reference_check_failed',
        `The ${label} cannot be read, so unused images cannot be identified safely.`,
      )
    }
  }

  const versions = await db
    .prepare('SELECT id, doc FROM doc_versions WHERE project_id = ?')
    .bind(project.id)
    .all<{ id: string; doc: string }>()

  const parsedVersions: unknown[] = []
  for (const version of versions.results ?? []) {
    if (!version.doc || !version.doc.trim()) continue
    try {
      parsedVersions.push(JSON.parse(version.doc) as unknown)
    } catch {
      throw new MediaCleanupError(
        'reference_check_failed',
        `Saved version ${version.id} cannot be read, so nothing is deleted until it is repaired.`,
      )
    }
  }

  return {
    current: parse(row?.doc, 'current document'),
    spec: parse(row?.spec, 'business specification'),
    versions: parsedVersions,
  }
}

/** Every media id this project's own records name, exactly. */
export function referencedMediaIds(references: References): Set<string> {
  return collectMediaIds([references.current, references.spec, ...references.versions])
}

function objectsFor(row: MediaRow): MediaCleanupObject[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(row.variants)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const objects: MediaCleanupObject[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') return null
    const variant = entry as { width?: unknown; height?: number; bytes?: unknown }
    if (!Number.isFinite(variant.width) || !Number.isFinite(variant.bytes)) return null
    const width = Number(variant.width)
    objects.push({
      key: variantKey(row.project_id, row.hash, width),
      width,
      height: Number(variant.height ?? 0),
      bytes: Number(variant.bytes),
    })
  }
  return objects
}

/**
 * Stage A: a dry-run report. Reads only; writes nothing and deletes nothing.
 */
export async function planMediaCleanup(
  db: D1Database,
  project: Project,
  options: { graceHours?: number; now?: number } = {},
): Promise<MediaCleanupReport> {
  await ensureSchema(db)
  const graceHours = clampGraceHours(options.graceHours)
  const now = options.now ?? Date.now()
  const references = await readReferences(db, project)
  const referenced = referencedMediaIds(references)

  const rows = await db
    .prepare('SELECT id, project_id, hash, created_at, bytes, variants FROM media WHERE project_id = ? ORDER BY created_at')
    .bind(project.id)
    .all<MediaRow>()
  const media = rows.results ?? []

  // A stored variant key belongs to exactly one row: keys carry the project and
  // the content hash, and (project_id, hash) is unique. The check is kept so a
  // future change to either rule cannot silently delete a shared object.
  const keyOwners = new Map<string, string[]>()
  const objectsByRow = new Map<string, MediaCleanupObject[] | null>()
  for (const row of media) {
    const objects = objectsFor(row)
    objectsByRow.set(row.id, objects)
    for (const object of objects ?? []) {
      const owners = keyOwners.get(object.key) ?? []
      owners.push(row.id)
      keyOwners.set(object.key, owners)
    }
  }

  const candidates: MediaCleanupCandidate[] = []
  const skipped: { id: string; reason: string }[] = []

  for (const row of media) {
    if (referenced.has(row.id)) continue
    const objects = objectsByRow.get(row.id)
    if (!objects) {
      skipped.push({ id: row.id, reason: 'metadata could not be read; left untouched' })
      continue
    }
    if (objects.some((object) => (keyOwners.get(object.key) ?? []).length > 1)) {
      skipped.push({ id: row.id, reason: 'shares a stored object with another upload' })
      continue
    }
    const created = Date.parse(row.created_at)
    if (!Number.isFinite(created)) {
      skipped.push({ id: row.id, reason: 'upload date is unknown' })
      continue
    }
    const ageHours = Math.floor((now - created) / 3_600_000)
    if (now - created <= graceHours * 3_600_000) {
      skipped.push({ id: row.id, reason: `inside the ${graceHours}h grace period` })
      continue
    }
    candidates.push({
      id: row.id,
      hash: row.hash,
      createdAt: row.created_at,
      ageHours,
      bytes: objects.reduce((sum, object) => sum + object.bytes, 0),
      objects,
    })
  }

  return {
    projectId: project.id,
    token: project.token,
    name: project.name,
    graceHours,
    checkedAt: new Date(now).toISOString(),
    uploads: media.length,
    protectedUploads: media.length - candidates.length - skipped.length,
    candidates,
    skipped,
    objects: candidates.reduce((sum, entry) => sum + entry.objects.length, 0),
    bytes: candidates.reduce((sum, entry) => sum + entry.bytes, 0),
    references: {
      currentDocument: Boolean(references.current),
      versions: references.versions.length,
      catalog: Boolean(references.spec),
    },
  }
}

/** True while any current or saved record still names the image. */
async function stillReferenced(db: D1Database, project: Project, id: string): Promise<boolean> {
  const references = await readReferences(db, project)
  return referencedMediaIds(references).has(id)
}

async function audit(
  db: D1Database,
  entry: {
    runId: string
    projectId: string
    mediaId: string
    action: 'deleted' | 'failed' | 'skipped'
    reason: string
    keys: string[]
    bytes: number
    backupId: string
    now: number
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO media_cleanup_log
        (id, run_id, project_id, media_id, action, reason, object_keys, objects, bytes, backup_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId('mcl'),
      entry.runId,
      entry.projectId,
      entry.mediaId,
      entry.action,
      entry.reason.slice(0, 240),
      JSON.stringify(entry.keys),
      entry.keys.length,
      entry.bytes,
      entry.backupId.slice(0, 200),
      new Date(entry.now).toISOString(),
    )
    .run()
}

/**
 * Stage B: deletes only what a fresh reference read still agrees is unused.
 *
 * The caller supplies a verified backup id and an explicit confirmation; the id
 * is copied into every audit entry so a deletion can be traced to the snapshot
 * that made it recoverable. Retrying after a partial failure is safe: object
 * deletes are idempotent and a row whose objects remain is never removed.
 */
export async function executeMediaCleanup(
  db: D1Database,
  bucket: MediaBucket,
  project: Project,
  input: { backupId?: string; ids?: string[]; graceHours?: number; now?: number } = {},
): Promise<MediaCleanupOutcome> {
  await ensureSchema(db)
  const backupId = (input.backupId ?? '').trim()
  if (!backupId)
    throw new MediaCleanupError(
      'backup_required',
      'Take and verify a backup first, then send its id with the cleanup.',
    )

  const now = input.now ?? Date.now()
  const report = await planMediaCleanup(db, project, { graceHours: input.graceHours, now })
  const requested = input.ids && input.ids.length ? new Set(input.ids) : null
  const runId = newId('mcr')
  const outcome: MediaCleanupOutcome = {
    runId,
    dryRun: false,
    backupId,
    deleted: [],
    skipped: [],
    failed: [],
    report,
  }

  const planned = new Map(report.candidates.map((entry) => [entry.id, entry]))
  if (requested) {
    for (const id of requested) {
      if (planned.has(id)) continue
      const row = await db
        .prepare('SELECT id FROM media WHERE id = ? AND project_id = ?')
        .bind(id, project.id)
        .first<{ id: string }>()
      const reason = row
        ? (report.skipped.find((entry) => entry.id === id)?.reason ?? 'still referenced by this build')
        : 'already removed'
      outcome.skipped.push({ id, reason })
    }
  }

  for (const candidate of planned.values()) {
    // Re-read the references now. A save that landed after the report wins.
    let inUse = true
    try {
      inUse = await stillReferenced(db, project, candidate.id)
    } catch (error) {
      outcome.failed.push({
        id: candidate.id,
        reason: error instanceof Error ? error.message : 'reference check failed',
      })
      await audit(db, {
        runId, projectId: project.id, mediaId: candidate.id, action: 'failed',
        reason: 'reference check failed', keys: candidate.objects.map((object) => object.key),
        bytes: candidate.bytes, backupId, now,
      })
      continue
    }
    if (inUse) {
      outcome.skipped.push({ id: candidate.id, reason: 'referenced again since the report' })
      continue
    }

    const row = await db
      .prepare('SELECT hash FROM media WHERE id = ? AND project_id = ?')
      .bind(candidate.id, project.id)
      .first<{ hash: string }>()
    if (!row) {
      outcome.skipped.push({ id: candidate.id, reason: 'already removed' })
      continue
    }

    const keys = candidate.objects.map((object) => object.key)
    const unreachable: string[] = []
    for (const key of keys) {
      try {
        await bucket.delete(key)
      } catch {
        unreachable.push(key)
      }
    }
    // A delete that reported success but left the object behind is a failure
    // too: the metadata row stays so the next run can try again.
    for (const key of keys) {
      if (unreachable.includes(key)) continue
      try {
        if (await bucket.get(key)) unreachable.push(key)
      } catch {
        unreachable.push(key)
      }
    }

    if (unreachable.length) {
      outcome.failed.push({
        id: candidate.id,
        reason: `${unreachable.length} stored ${unreachable.length === 1 ? 'object' : 'objects'} could not be removed`,
      })
      await audit(db, {
        runId, projectId: project.id, mediaId: candidate.id, action: 'failed',
        reason: 'object delete incomplete', keys, bytes: candidate.bytes, backupId, now,
      })
      continue
    }

    try {
      await db.prepare('DELETE FROM media WHERE id = ? AND project_id = ?').bind(candidate.id, project.id).run()
    } catch (error) {
      outcome.failed.push({
        id: candidate.id,
        reason: error instanceof Error ? error.message : 'metadata row could not be removed',
      })
      await audit(db, {
        runId, projectId: project.id, mediaId: candidate.id, action: 'failed',
        reason: 'metadata delete failed; objects already removed', keys, bytes: candidate.bytes, backupId, now,
      })
      continue
    }

    await audit(db, {
      runId, projectId: project.id, mediaId: candidate.id, action: 'deleted',
      reason: 'unreferenced and past the grace period', keys, bytes: candidate.bytes, backupId, now,
    })
    outcome.deleted.push({ id: candidate.id, objects: keys, bytes: candidate.bytes })
  }

  return outcome
}

/** Recent audit entries for one project, for the operator and the dashboard. */
export async function listMediaCleanupLog(
  db: D1Database,
  projectId: string,
  limit = 50,
): Promise<
  { id: string; runId: string; mediaId: string; action: string; reason: string; bytes: number; createdAt: string }[]
> {
  await ensureSchema(db)
  const { results } = await db
    .prepare(
      `SELECT id, run_id, media_id, action, reason, bytes, created_at FROM media_cleanup_log
        WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(projectId, Math.min(200, Math.max(1, limit)))
    .all<{
      id: string
      run_id: string
      media_id: string
      action: string
      reason: string
      bytes: number
      created_at: string
    }>()
  return (results ?? []).map((row) => ({
    id: row.id,
    runId: row.run_id,
    mediaId: row.media_id,
    action: row.action,
    reason: row.reason,
    bytes: row.bytes,
    createdAt: row.created_at,
  }))
}
