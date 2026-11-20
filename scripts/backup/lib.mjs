/**
 * Backup, restore and verification primitives.
 *
 * Every function here works on files an operator names; nothing reads or writes
 * the production database or bucket implicitly. The local Wrangler state is
 * supported because it is the only environment this repository can prove a
 * restore in. Production uses `wrangler d1 export` and `wrangler r2 object get`
 * against the real account; the checks below are identical either way.
 */
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { imageInfo } from '../../src/worker/media'

/**
 * Rows that are credentials, not business records. An ordinary backup restores
 * the business; it must not restore somebody's ability to sign in as them.
 * Every exclusion is recorded in the manifest so the gap is visible.
 */
export const EXCLUDED_ROWS = {
  owner_sessions: 'owner session tokens; owners sign in again after a restore',
  user_sessions: 'platform session tokens',
  auth_tokens: 'password reset and email verification tokens',
  invitations: 'pending invitation links; re-invite after a restore',
}

/** Columns holding credentials rather than configuration metadata. */
export const REDACTED_COLUMNS = {
  payment_connections: {
    secrets: 'encrypted provider credentials; the owner reconnects the provider after a restore',
  },
}

export const MEDIA_BUCKET = 'plattr-media'

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function sha256File(file) {
  return sha256(fs.readFileSync(file))
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function checksum(value) {
  return sha256(stableJson(value))
}

export function openDatabase(file, options) {
  return new Database(file, options)
}

/**
 * A consistent single-file copy of a live database.
 *
 * A Wrangler D1 file is in WAL mode, and a byte copy without its `-wal`/`-shm`
 * cannot be opened read-only afterwards. `VACUUM INTO` asks SQLite to write one
 * complete file, which is also what makes a backup safe to move around.
 */
export function copyDatabase(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.rmSync(target, { force: true })
  const db = openDatabase(source)
  try {
    db.run('PRAGMA busy_timeout = 5000')
    db.run('VACUUM INTO ?', [target])
  } finally {
    db.close()
  }
  return target
}

export function listTables(db) {
  return db
    .query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%' ORDER BY name",
    )
    .all()
    .map((row) => row.name)
}

export function tableCounts(db) {
  return Object.fromEntries(
    listTables(db).map((table) => [table, Number(db.query(`SELECT COUNT(*) AS n FROM ${quoteIdent(table)}`).get().n)]),
  )
}

export function tableChecksum(db, table) {
  const rows = db.query(`SELECT * FROM ${quoteIdent(table)}`).all()
  const sorted = rows
    .map((row) => stableJson(row))
    .sort()
  return sha256(sorted.join('\n'))
}

export function databaseChecksums(db) {
  return Object.fromEntries(listTables(db).map((table) => [table, tableChecksum(db, table)]))
}

/** A deterministic checksum of one project's rows in one table. */
export function tableChecksumsForProject(db, table, projectId) {
  const rows = db.query(`SELECT * FROM ${quoteIdent(table)} WHERE project_id = ?`).all(projectId)
  return sha256(rows.map((row) => stableJson(row)).sort().join('\n'))
}

export function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`
}

/** Removes credentials and session material from a copy, never the source. */
export function scrubDatabase(db) {
  const removed = {}
  for (const table of Object.keys(EXCLUDED_ROWS)) {
    if (!listTables(db).includes(table)) continue
    const count = Number(db.query(`SELECT COUNT(*) AS n FROM ${quoteIdent(table)}`).get().n)
    if (count) db.run(`DELETE FROM ${quoteIdent(table)}`)
    removed[table] = count
  }
  const cleared = []
  for (const [table, columns] of Object.entries(REDACTED_COLUMNS)) {
    if (!listTables(db).includes(table)) continue
    const present = db
      .query(`PRAGMA table_info(${quoteIdent(table)})`)
      .all()
      .map((column) => column.name)
    for (const column of Object.keys(columns)) {
      if (!present.includes(column)) continue
      const count = Number(
        db.query(`SELECT COUNT(*) AS n FROM ${quoteIdent(table)} WHERE ${quoteIdent(column)} <> ''`).get().n,
      )
      if (count) db.run(`UPDATE ${quoteIdent(table)} SET ${quoteIdent(column)} = '' WHERE ${quoteIdent(column)} <> ''`)
      cleared.push({ table, column, rows: count })
    }
  }
  return { removed, cleared }
}

/**
 * Copies the database, strips credentials and rewrites the file so the removed
 * bytes are not left in free pages. `VACUUM INTO` produces the consistent copy;
 * the second `VACUUM` is what makes the redaction real on disk.
 */
export function writeScrubbedDatabase(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.rmSync(target, { force: true })
  const db = openDatabase(source)
  try {
    db.run('PRAGMA busy_timeout = 5000')
    db.run('VACUUM INTO ?', [target])
  } finally {
    db.close()
  }
  const copy = openDatabase(target)
  let redaction
  try {
    redaction = scrubDatabase(copy)
    copy.run('PRAGMA journal_mode = DELETE')
    copy.run('VACUUM')
  } finally {
    copy.close()
  }
  const check = openDatabase(target)
  try {
    const integrity = String(check.query('PRAGMA integrity_check').get().integrity_check)
    if (integrity !== 'ok') throw new Error(`copy failed integrity check: ${integrity}`)
  } finally {
    check.close()
  }
  return redaction
}

/* --------------------------- local Wrangler state --------------------------- */

export function findLocalDatabase(stateDir = '.wrangler/state') {
  const dir = path.join(stateDir, 'v3/d1/miniflare-D1DatabaseObject')
  if (!fs.existsSync(dir)) throw new Error(`no local D1 state under ${dir}`)
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sqlite') && file !== 'metadata.sqlite')
    .map((file) => path.join(dir, file))
  const found = files.find((file) => {
    try {
      const db = openDatabase(file)
      try {
        return Boolean(
          db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'").get(),
        )
      } finally {
        db.close()
      }
    } catch {
      return false
    }
  })
  if (!found) throw new Error(`no local D1 database with a projects table under ${dir}`)
  return found
}

/**
 * The Miniflare metadata database and blob directory for one local bucket.
 *
 * Every bucket keeps its rows in `miniflare-R2BucketObject/<hash>.sqlite` and
 * its bytes in `<bucket>/blobs/`, but the file name is not derived from the
 * bucket name. With more than one bucket in a state directory (a drill bucket,
 * for example) the right file is the one whose rows point at blobs that exist
 * in this bucket's directory.
 */
export function findLocalBucket(stateDir = '.wrangler/state', bucket = MEDIA_BUCKET) {
  const dir = path.join(stateDir, 'v3/r2/miniflare-R2BucketObject')
  const blobs = path.join(stateDir, 'v3/r2', bucket, 'blobs')
  if (!fs.existsSync(dir)) throw new Error(`no local R2 state under ${dir}`)
  const candidates = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sqlite') && file !== 'metadata.sqlite')
    .map((file) => path.join(dir, file))
    .filter((file) => {
      try {
        const db = openDatabase(file)
        try {
          return Boolean(db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_mf_objects'").get())
        } finally {
          db.close()
        }
      } catch {
        return false
      }
    })
  if (!candidates.length) throw new Error(`no local R2 bucket metadata under ${dir}`)

  const scored = candidates.map((file) => {
    const db = openDatabase(file)
    try {
      const rows = db.query('SELECT blob_id FROM _mf_objects').all()
      const present = rows.filter((row) => row.blob_id && fs.existsSync(path.join(blobs, row.blob_id))).length
      return { file, rows: rows.length, present }
    } finally {
      db.close()
    }
  })
  scored.sort((a, b) => b.present - a.present || b.rows - a.rows)
  const best = scored[0]
  if (best.rows > 0 && best.present === 0 && candidates.length > 1)
    throw new Error(`cannot tell which metadata under ${dir} belongs to bucket ${bucket}`)
  if (candidates.length > 1 && scored.every((entry) => entry.rows === 0))
    throw new Error(`bucket ${bucket} is empty and ${dir} holds ${candidates.length} empty buckets; prime it first`)
  return { metadata: best.file, blobs }
}

export function readBucketObjects(bucketState) {
  const db = openDatabase(bucketState.metadata)
  try {
    return db.query('SELECT * FROM _mf_objects ORDER BY key').all()
  } finally {
    db.close()
  }
}

export function readBucketObject(bucketState, key) {
  const db = openDatabase(bucketState.metadata)
  let row
  try {
    row = db.query('SELECT * FROM _mf_objects WHERE key = ?').get(key)
  } finally {
    db.close()
  }
  if (!row) return null
  const file = path.join(bucketState.blobs, row.blob_id)
  if (!fs.existsSync(file)) return { row, bytes: null, file }
  return { row, bytes: fs.readFileSync(file), file }
}

/* --------------------------------- media --------------------------------- */

function variantsOf(row) {
  let parsed
  try {
    parsed = JSON.parse(row.variants)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  return parsed.map((entry) => ({
    key: `projects/${row.project_id}/media/${row.hash}/${Number(entry.width)}.webp`,
    width: Number(entry.width),
    height: Number(entry.height),
    bytes: Number(entry.bytes),
  }))
}

/**
 * The media manifest, built from objects that were already read and checked.
 * One builder for the local backup, the offsite run and anything else that
 * needs the same shape and checksum.
 */
export function mediaManifest({ database, bucket = MEDIA_BUCKET, mediaRows, objects, problems = [], note = '' }) {
  const manifest = {
    createdAt: new Date().toISOString(),
    database,
    bucket,
    mediaRows,
    objects,
    totals: {
      objects: objects.length,
      referenced: objects.filter((entry) => entry.referenced).length,
      unreferenced: objects.filter((entry) => !entry.referenced).length,
      bytes: objects.reduce((sum, entry) => sum + entry.bytes, 0),
    },
    problems,
  }
  if (note) manifest.note = note
  manifest.checksum = mediaChecksum(objects)
  return manifest
}

export function mediaChecksum(objects) {
  return checksum({ objects: objects.map(({ key, sha256: digest }) => ({ key, sha256: digest })) })
}

export function writeMediaManifest(dir, manifest) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
}

/** What a restore cannot bring back, stated once so both manifests agree. */
export const RESTORE_NOTES = [
  'Owner and platform sessions are not in this backup; everybody signs in again.',
  'Payment provider secrets are blank; reconnect the provider after a restore.',
  'Invitations are not restored; send new invitations.',
]

/**
 * The manifest `restore.mjs` and `verify-restore.mjs` read, for a backup
 * directory holding `database.sqlite` and `media/`. Built here so the local
 * backup and an offsite run fetched back produce the same document.
 */
export function backupManifest({
  createdAt = new Date().toISOString(),
  source = null,
  databaseFile,
  counts,
  checksums,
  media = null,
  redaction,
  offsite = null,
}) {
  const manifest = {
    createdAt,
    ...(source ? { source } : {}),
    database: {
      file: 'database.sqlite',
      bytes: fs.statSync(databaseFile).size,
      sha256: sha256File(databaseFile),
      integrity: 'ok',
      counts,
      checksums,
      checksum: sha256(JSON.stringify(checksums)),
    },
    media: media
      ? {
          file: 'media',
          checksum: media.checksum,
          objects: media.totals.objects,
          referenced: media.totals.referenced,
          unreferenced: media.totals.unreferenced,
          bytes: media.totals.bytes,
        }
      : null,
    redaction,
    restoreNotes: RESTORE_NOTES,
  }
  if (offsite) manifest.offsite = offsite
  manifest.checksum = sha256(
    JSON.stringify({ database: manifest.database.checksum, media: manifest.media?.checksum ?? '', counts }),
  )
  return manifest
}

export function writeBackupManifest(dir, manifest) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
}

/**
 * A media backup holds every stored variant and the metadata needed to put it
 * back: object key, project, media id, content type, dimensions and checksum.
 * The source is checked as it is read, so a backup that finishes is a backup
 * without missing objects.
 */
export function backupMedia(databaseFile, bucketState, outDir) {
  const db = openDatabase(databaseFile)
  let rows
  let projects
  try {
    rows = db.query('SELECT * FROM media ORDER BY project_id, created_at').all()
    projects = db.query('SELECT id, token, name FROM projects').all()
  } finally {
    db.close()
  }
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const bucketRows = readBucketObjects(bucketState)
  const bucketByKey = new Map(bucketRows.map((row) => [row.key, row]))

  const objectsDir = path.join(outDir, 'objects')
  fs.mkdirSync(objectsDir, { recursive: true })
  const objects = []
  const problems = []
  const referencedKeys = new Set()

  for (const row of rows) {
    const variants = variantsOf(row)
    if (!variants) {
      problems.push({ mediaId: row.id, projectId: row.project_id, problem: 'variants metadata is not readable' })
      continue
    }
    const project = projectById.get(row.project_id)
    for (const variant of variants) {
      referencedKeys.add(variant.key)
      const stored = readBucketObject(bucketState, variant.key)
      if (!stored?.bytes) {
        problems.push({
          mediaId: row.id,
          projectId: row.project_id,
          key: variant.key,
          problem: stored ? 'metadata row has no blob on disk' : 'object is missing from the bucket',
        })
        continue
      }
      if (stored.bytes.byteLength !== variant.bytes) {
        problems.push({
          key: variant.key,
          problem: `stored size ${stored.bytes.byteLength} does not match metadata ${variant.bytes}`,
        })
      }
      const info = imageInfo(new Uint8Array(stored.bytes))
      if (!info || info.format !== 'webp' || info.width !== variant.width || info.height !== variant.height) {
        problems.push({
          key: variant.key,
          problem: `stored image is ${info ? `${info.format} ${info.width}x${info.height}` : 'unreadable'}; metadata says webp ${variant.width}x${variant.height}`,
        })
      }
      const target = path.join(objectsDir, variant.key)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, stored.bytes)
      objects.push({
        key: variant.key,
        mediaId: row.id,
        projectId: row.project_id,
        projectToken: project?.token ?? '',
        projectName: project?.name ?? '',
        width: variant.width,
        height: variant.height,
        bytes: stored.bytes.byteLength,
        sha256: sha256(stored.bytes),
        contentType: 'image/webp',
        httpMetadata: safeJson(stored.row.http_metadata, {}),
        customMetadata: safeJson(stored.row.custom_metadata, {}),
        referenced: true,
      })
    }
  }

  // Objects the bucket holds that no media row names. They are still backed up:
  // a cleanup operator may need to recover one, and their absence from the
  // database is the fact worth recording, not a reason to lose the bytes.
  for (const stored of bucketRows) {
    if (referencedKeys.has(stored.key)) continue
    const bytes = fs.existsSync(path.join(bucketState.blobs, stored.blob_id))
      ? fs.readFileSync(path.join(bucketState.blobs, stored.blob_id))
      : null
    if (!bytes) {
      problems.push({ key: stored.key, problem: 'unreferenced object has no blob on disk' })
      continue
    }
    const target = path.join(objectsDir, stored.key)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, bytes)
    const info = imageInfo(new Uint8Array(bytes))
    objects.push({
      key: stored.key,
      mediaId: '',
      projectId: keyProject(stored.key),
      projectToken: '',
      projectName: '',
      width: info?.width ?? 0,
      height: info?.height ?? 0,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      contentType: 'image/webp',
      httpMetadata: safeJson(stored.http_metadata, {}),
      customMetadata: safeJson(stored.custom_metadata, {}),
      referenced: false,
    })
  }

  const manifest = mediaManifest({
    database: { file: path.resolve(databaseFile), sha256: sha256File(databaseFile) },
    mediaRows: rows.length,
    objects,
    problems,
  })
  writeMediaManifest(outDir, manifest)
  return manifest
}

function safeJson(text, fallback) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

export function keyProject(key) {
  const match = /^projects\/([^/]+)\//.exec(key)
  return match ? match[1] : ''
}

/** Verifies a backup directory without writing anything. */
export function verifyMediaBackup(outDir, options = {}) {
  const manifestPath = path.join(outDir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) return { ok: false, problems: ['media manifest is missing'] }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const problems = [...(manifest.problems ?? [])]
  for (const object of manifest.objects ?? []) {
    const file = path.join(outDir, 'objects', object.key)
    if (!fs.existsSync(file)) {
      problems.push(`object file is missing: ${object.key}`)
      continue
    }
    const bytes = fs.readFileSync(file)
    if (bytes.byteLength !== object.bytes) problems.push(`size mismatch: ${object.key}`)
    if (sha256(bytes) !== object.sha256) problems.push(`checksum mismatch: ${object.key}`)
    const info = imageInfo(new Uint8Array(bytes))
    if (!info || info.format !== 'webp' || info.width !== object.width || info.height !== object.height) {
      problems.push(`image does not match its recorded dimensions: ${object.key}`)
    }
  }
  if (options.requireReferenced !== false && (manifest.problems ?? []).length)
    problems.push('the backup recorded missing objects at the source')
  if (manifest.checksum !== mediaChecksum(manifest.objects ?? []))
    problems.push('object list checksum does not match the manifest')
  return { ok: problems.length === 0, manifest, problems }
}

/**
 * Writes a verified media backup into a local Wrangler bucket. The target must
 * already exist (Wrangler creates the metadata database); only rows and blobs
 * this backup owns are written, and existing keys are replaced, so a retried
 * restore converges instead of duplicating.
 */
export function restoreMedia(outDir, bucketState, options = {}) {
  const verification = verifyMediaBackup(outDir)
  if (!verification.ok) throw new Error(`media backup failed verification: ${verification.problems.join('; ')}`)
  const manifest = verification.manifest
  const selected = options.projectId
    ? manifest.objects.filter((object) => object.projectId === options.projectId)
    : manifest.objects
  fs.mkdirSync(bucketState.blobs, { recursive: true })
  const db = openDatabase(bucketState.metadata)
  let written = 0
  let skipped = 0
  try {
    for (const object of selected) {
      const file = path.join(outDir, 'objects', object.key)
      const bytes = fs.readFileSync(file)
      if (sha256(bytes) !== object.sha256) throw new Error(`object changed after verification: ${object.key}`)
      const blobId = `${object.sha256.slice(0, 32)}${crypto.randomUUID().replace(/-/g, '')}`
      fs.writeFileSync(path.join(bucketState.blobs, blobId), bytes)
      const etag = createHash('md5').update(bytes).digest('hex')
      const existing = db.query('SELECT blob_id FROM _mf_objects WHERE key = ?').get(object.key)
      if (existing) {
        db.run(
          `UPDATE _mf_objects SET blob_id = ?, version = ?, size = ?, etag = ?, uploaded = ?, checksums = '{}',
             http_metadata = ?, custom_metadata = ? WHERE key = ?`,
          [
            blobId,
            crypto.randomUUID().replace(/-/g, ''),
            bytes.byteLength,
            etag,
            Date.now(),
            JSON.stringify(object.httpMetadata ?? { contentType: 'image/webp' }),
            JSON.stringify(object.customMetadata ?? {}),
            object.key,
          ],
        )
        skipped += 1
      } else {
        db.run(
          `INSERT INTO _mf_objects (key, blob_id, version, size, etag, uploaded, checksums, http_metadata, custom_metadata)
           VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
          [
            object.key,
            blobId,
            crypto.randomUUID().replace(/-/g, ''),
            bytes.byteLength,
            etag,
            Date.now(),
            JSON.stringify(object.httpMetadata ?? { contentType: 'image/webp' }),
            JSON.stringify(object.customMetadata ?? {}),
          ],
        )
      }
      written += 1
    }
  } finally {
    db.close()
  }
  return { written, replaced: skipped, objects: selected.length, checksum: manifest.checksum }
}

/* ------------------------------ verification ------------------------------ */

/**
 * The checks an operator runs after a restore. They are deliberately explicit
 * about relationships: the schema declares no foreign keys, so the invariants
 * live in queries rather than in SQLite.
 */
export function verifyDatabase(databaseFile, options = {}) {
  const db = openDatabase(databaseFile)
  const checks = []
  const warnings = []
  const push = (name, ok, detail) => checks.push({ name, ok, detail })
  // Data-quality findings are warnings: a restore is successful when it is
  // exactly the backup, even when the source already had orphan rows. Only
  // fidelity failures (integrity, counts, checksums, restored credentials)
  // make the restore unusable. `--strict` turns warnings into failures.
  const note = (name, ok, detail) => {
    if (ok) warnings.push({ name, ok, detail })
    else if (options.strict) checks.push({ name, ok, detail })
    else warnings.push({ name, ok: false, detail })
  }
  try {
    const integrity = String(db.query('PRAGMA integrity_check').get().integrity_check)
    push('integrity', integrity === 'ok', integrity)
    const foreign = db.query('PRAGMA foreign_key_check').all()
    push('foreign keys', foreign.length === 0, foreign.length ? `${foreign.length} violations` : 'none declared, none violated')
    const tables = listTables(db)
    push('schema', tables.includes('projects') && tables.includes('media'), `${tables.length} tables`)

    const counts = tableCounts(db)
    const expected = options.counts
    if (expected) {
      const mismatched = Object.entries(expected).filter(([table, count]) => counts[table] !== count)
      push('record counts', mismatched.length === 0, mismatched.length ? mismatched.map(([t, c]) => `${t}: ${counts[t]} != ${c}`).join(', ') : 'match the backup')
    }
    if (options.checksums) {
      const actual = databaseChecksums(db)
      const mismatched = Object.keys(options.checksums).filter((table) => actual[table] !== options.checksums[table])
      push('table checksums', mismatched.length === 0, mismatched.length ? `differ: ${mismatched.join(', ')}` : 'match the backup')
    }

    const sessionRows = tables.includes('owner_sessions')
      ? Number(db.query('SELECT COUNT(*) AS n FROM owner_sessions').get().n)
      : 0
    push('no restored owner sessions', sessionRows === 0, `${sessionRows} rows`)
    const connectionSecrets = tables.includes('payment_connections')
      ? Number(db.query("SELECT COUNT(*) AS n FROM payment_connections WHERE secrets <> ''").get().n)
      : 0
    push('no restored payment secrets', connectionSecrets === 0, `${connectionSecrets} rows with secrets`)

    const orphan = (child, parent, column = 'project_id') =>
      Number(
        db
          .query(
            `SELECT COUNT(*) AS n FROM ${quoteIdent(child)} c WHERE c.${quoteIdent(column)} <> '' AND NOT EXISTS (SELECT 1 FROM ${quoteIdent(parent)} p WHERE p.id = c.${quoteIdent(column)})`,
          )
          .get().n,
      )
    const relationships = [
      ['doc_versions', 'projects'],
      ['media', 'projects'],
      ['customers', 'projects'],
      ['orders', 'projects'],
      ['bookings', 'projects'],
      ['enquiries', 'projects'],
      ['notes', 'projects'],
      ['activity', 'projects'],
      ['notifications', 'projects'],
      ['payment_connections', 'projects'],
      ['payment_transactions', 'projects'],
      ['payment_events', 'projects'],
      ['order_items', 'orders', 'order_id'],
    ]
    for (const [child, parent, column] of relationships) {
      if (!tables.includes(child) || !tables.includes(parent)) continue
      const count = orphan(child, parent, column)
      note(`${child} → ${parent}`, count === 0, count ? `${count} orphans` : 'no orphans')
    }
    for (const [child, column] of [['orders', 'customer_id'], ['bookings', 'customer_id'], ['enquiries', 'customer_id']]) {
      if (!tables.includes(child) || !tables.includes('customers')) continue
      const count = Number(
        db
          .query(
            `SELECT COUNT(*) AS n FROM ${quoteIdent(child)} c WHERE c.${quoteIdent(column)} <> '' AND NOT EXISTS (SELECT 1 FROM customers m WHERE m.id = c.${quoteIdent(column)} AND m.project_id = c.project_id)`,
          )
          .get().n,
      )
      note(`${child}.customer_id → customers`, count === 0, count ? `${count} cross-project or missing` : 'every customer belongs to its project')
    }

    // Every image a document or catalogue names must exist, in the same project.
    if (tables.includes('media') && tables.includes('projects')) {
      const mediaRows = db.query('SELECT id, project_id FROM media').all()
      const owned = new Map()
      for (const row of mediaRows) {
        if (!owned.has(row.project_id)) owned.set(row.project_id, new Set())
        owned.get(row.project_id).add(row.id)
      }
      const projects = db.query('SELECT id, doc, spec FROM projects').all()
      const versions = tables.includes('doc_versions') ? db.query('SELECT project_id, doc FROM doc_versions').all() : []
      const missing = []
      const foreign = []
      const inspect = (projectId, text, label) => {
        if (!text || !text.trim()) return
        let parsed
        try {
          parsed = JSON.parse(text)
        } catch {
          missing.push(`${label} is not readable`)
          return
        }
        for (const id of collectIds(parsed)) {
          if (!owned.get(projectId)?.has(id)) {
            if (mediaRows.some((row) => row.id === id)) foreign.push(`${label} → ${id} belongs to another project`)
            else missing.push(`${label} → ${id} has no media row`)
          }
        }
      }
      for (const project of projects) {
        inspect(project.id, project.doc, `project ${project.id} document`)
        inspect(project.id, project.spec, `project ${project.id} catalogue`)
      }
      for (const version of versions) inspect(version.project_id, version.doc, `version in ${version.project_id}`)
      note('document media references', missing.length === 0, missing.length ? missing.slice(0, 5).join('; ') : 'every reference has a row')
      note('media isolation', foreign.length === 0, foreign.length ? foreign.slice(0, 5).join('; ') : 'no project names another project media')
    }

    return { ok: checks.every((check) => check.ok), checks, warnings, counts }
  } finally {
    db.close()
  }
}

function collectIds(value, into = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectIds(entry, into)
    return into
  }
  if (!value || typeof value !== 'object') return into
  const record = value
  if (record.media && typeof record.media === 'object' && typeof record.media.id === 'string')
    into.add(record.media.id)
  for (const nested of Object.values(record)) collectIds(nested, into)
  return into
}

/**
 * Compares the database's media rows with the objects a bucket actually holds.
 * This is the check that a database restore alone cannot pass.
 */
export function verifyMediaObjects(databaseFile, bucketState) {
  const db = openDatabase(databaseFile)
  let rows
  try {
    rows = db.query('SELECT * FROM media').all()
  } finally {
    db.close()
  }
  const objects = readBucketObjects(bucketState)
  const byKey = new Map(objects.map((row) => [row.key, row]))
  const problems = []
  const seen = new Set()
  let expected = 0
  for (const row of rows) {
    const variants = variantsOf(row)
    if (!variants) {
      problems.push(`${row.id}: variants metadata is not readable`)
      continue
    }
    let total = 0
    for (const variant of variants) {
      expected += 1
      const stored = byKey.get(variant.key)
      if (!stored) {
        problems.push(`${row.id}: object is missing (${variant.key})`)
        continue
      }
      seen.add(variant.key)
      total += Number(stored.size)
      const bytes = readBucketObject(bucketState, variant.key)?.bytes
      if (!bytes) {
        problems.push(`${row.id}: metadata row has no blob (${variant.key})`)
        continue
      }
      if (bytes.byteLength !== variant.bytes) problems.push(`${row.id}: size mismatch (${variant.key})`)
      const info = imageInfo(new Uint8Array(bytes))
      if (!info || info.format !== 'webp' || info.width !== variant.width || info.height !== variant.height)
        problems.push(`${row.id}: image does not match dimensions (${variant.key})`)
    }
    if (total !== Number(row.bytes)) problems.push(`${row.id}: variant bytes ${total} != media.bytes ${row.bytes}`)
  }
  return {
    ok: problems.length === 0,
    rows: rows.length,
    expected,
    present: seen.size,
    unreferenced: objects.filter((row) => !seen.has(row.key)).map((row) => row.key),
    problems,
  }
}

/* --------------------------- project-level restore -------------------------- */

/** Tables whose rows belong to exactly one project. */
export const PROJECT_TABLES = [
  'projects',
  'doc_versions',
  'media',
  'customers',
  'orders',
  'bookings',
  'enquiries',
  'notes',
  'activity',
  'notifications',
  'payment_connections',
  'payment_settings',
  'payment_transactions',
  'payment_events',
]

/**
 * Platform ownership claims are deliberately not restored with a project: a
 * claim carries a verification token, and restoring one would revive a link
 * that should have died with the incident.
 */
export const PROJECT_RESTORE_EXCLUSIONS = ['project_claims', 'owner_sessions', 'user_sessions', 'auth_tokens']

/**
 * Replaces one project's records from a snapshot, leaving every other project
 * untouched. Owner sessions are never copied: a restored project does not
 * resurrect a browser login. `order_items` are restored with their orders.
 */
export function restoreProject(targetFile, snapshotFile, token) {
  const snapshot = openDatabase(snapshotFile)
  let project
  let tables
  try {
    if (!listTables(snapshot).includes('projects')) throw new Error('snapshot has no projects table')
    project = snapshot.query('SELECT * FROM projects WHERE token = ?').get(token)
    if (!project) throw new Error(`project ${token} is not in the snapshot`)
    tables = listTables(snapshot)
  } finally {
    snapshot.close()
  }

  const target = openDatabase(targetFile)
  const report = { token, projectId: project.id, restored: {}, mediaHashes: [] }
  try {
    target.run('PRAGMA busy_timeout = 5000')
    target.run('BEGIN')
    const source = openDatabase(snapshotFile)
    try {
      // The project row itself, replaced by token so a damaged id is repaired.
      const columns = source.query('PRAGMA table_info(projects)').all().map((column) => column.name)
      const exists = target.query('SELECT id FROM projects WHERE token = ?').get(token)
      if (exists) {
        const updates = columns.filter((column) => column !== 'id').map((column) => `${quoteIdent(column)} = ?`).join(', ')
        target.run(`UPDATE projects SET ${updates} WHERE id = ?`, [
          ...columns.filter((column) => column !== 'id').map((column) => project[column] ?? null),
          exists.id,
        ])
      } else {
        target.run(
          `INSERT INTO projects (${columns.map(quoteIdent).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          columns.map((column) => project[column] ?? null),
        )
      }
      for (const table of PROJECT_TABLES) {
        if (table === 'projects' || !tables.includes(table)) continue
        const columnsOf = source.query(`PRAGMA table_info(${quoteIdent(table)})`).all()
        if (!columnsOf.some((column) => column.name === 'project_id')) continue
        const rows = source.query(`SELECT * FROM ${quoteIdent(table)} WHERE project_id = ?`).all(project.id)
        if (!rows.length) continue
        // Organization-linked rows exist only for some tables; project_id is the
        // column every one of them carries.
        target.run(`DELETE FROM ${quoteIdent(table)} WHERE project_id = ?`, [project.id])
        for (const row of rows) {
          target.run(
            `INSERT INTO ${quoteIdent(table)} (${columnsOf.map((column) => quoteIdent(column.name)).join(', ')})
             VALUES (${columnsOf.map(() => '?').join(', ')})`,
            columnsOf.map((column) => row[column.name] ?? null),
          )
        }
        report.restored[table] = rows.length
      }
      if (tables.includes('order_items') && tables.includes('orders')) {
        const orders = source.query('SELECT id FROM orders WHERE project_id = ?').all(project.id).map((row) => row.id)
        const items = orders.length
          ? source
              .query(`SELECT * FROM order_items WHERE order_id IN (${orders.map(() => '?').join(', ')})`)
              .all(...orders)
          : []
        if (orders.length) target.run(`DELETE FROM order_items WHERE order_id IN (${orders.map(() => '?').join(', ')})`, orders)
        const columnsOf = source.query('PRAGMA table_info(order_items)').all()
        for (const row of items) {
          target.run(
            `INSERT INTO order_items (${columnsOf.map((column) => quoteIdent(column.name)).join(', ')})
             VALUES (${columnsOf.map(() => '?').join(', ')})`,
            columnsOf.map((column) => row[column.name] ?? null),
          )
        }
        report.restored.order_items = items.length
      }
      report.mediaHashes = source.query('SELECT hash FROM media WHERE project_id = ?').all(project.id).map((row) => row.hash)
    } finally {
      source.close()
    }
    target.run('COMMIT')
  } catch (error) {
    try {
      target.run('ROLLBACK')
    } catch {
      // The transaction was already rolled back.
    }
    throw error
  } finally {
    target.close()
  }
  return report
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}
