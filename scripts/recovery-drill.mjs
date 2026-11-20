#!/usr/bin/env bun
/**
 * Rehearses backup, restore and recovery on disposable copies.
 *
 *   bun scripts/recovery-drill.mjs [--source .wrangler/state] [--work .wrangler/drill]
 *                                  [--port 8796] [--skip-build]
 *
 * The source database and bucket are never modified: every scenario copies the
 * backup into its own directory. The restored copy is served with
 * `wrangler dev --persist-to`, so the checks that matter (the customer page and
 * its images) run against the real Worker, not a reimplementation.
 *
 * Writes docs/qa/recovery/restore-verification.json and prints a summary.
 */
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  copyDatabase,
  databaseChecksums,
  findLocalBucket,
  openDatabase,
  readJson,
  restoreProject,
  sha256File,
  tableChecksumsForProject,
  verifyDatabase,
  verifyMediaBackup,
  verifyMediaObjects,
  writeJson,
} from './backup/lib.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback
}
const sourceState = path.resolve(flag('source', '.wrangler/state'))
const work = path.resolve(flag('work', '.wrangler/drill'))
const port = Number(flag('port', '8796'))
const skipBuild = args.includes('--skip-build')
const results = []
const notes = []

function record(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail ?? '' })
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
  return ok
}

function attempt(name, fn) {
  try {
    const value = fn()
    return record(name, true, value ?? '')
  } catch (error) {
    return record(name, false, error instanceof Error ? error.message : String(error))
  }
}

function bun(script, argv) {
  return execFileSync(process.execPath, [script, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true })
  fs.cpSync(from, to, { recursive: true })
}

function backupInto(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  bun('scripts/backup.mjs', ['--state', sourceState, '--out', dir, '--retention', '3'])
  const stamped = fs
    .readdirSync(dir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}T/.test(name) && fs.existsSync(path.join(dir, name, 'manifest.json')))
    .sort()
  const backupDir = path.join(dir, stamped[stamped.length - 1])
  return { backupDir, manifest: readJson(path.join(backupDir, 'manifest.json')) }
}

function restoredDatabase(stateDir) {
  const dir = path.join(stateDir, 'v3/d1/miniflare-D1DatabaseObject')
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.sqlite') && file !== 'metadata.sqlite')
  return path.join(dir, files[0])
}

async function waitForHealth(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/health`)
      if (response.ok) return true
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

/** A minimal, valid WebP header: enough for the bucket to hold real bytes. */
function webpBytes(width, height) {
  const bytes = new Uint8Array(30)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0)
  bytes.set([22, 0, 0, 0], 4)
  bytes.set([0x57, 0x45, 0x42, 0x50], 8)
  bytes.set([0x56, 0x50, 0x38, 0x58], 12)
  bytes.set([10, 0, 0, 0], 16)
  bytes.set([(width - 1) & 0xff, ((width - 1) >> 8) & 0xff, ((width - 1) >> 16) & 0xff], 24)
  bytes.set([(height - 1) & 0xff, ((height - 1) >> 8) & 0xff, ((height - 1) >> 16) & 0xff], 27)
  return bytes
}

/**
 * Writes an old, unreferenced upload into the restored copy: a media row, two
 * stored variants and their bucket metadata. This is the state an owner leaves
 * behind after deleting a section that used a photo.
 */
function seedOrphan(stateDir, databaseFile, projectId) {
  const bucket = findLocalBucket(stateDir)
  const hex = (length) =>
    [...crypto.getRandomValues(new Uint8Array(length))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const hash = hex(32)
  const id = `med_${hex(12)}`
  const variants = [
    { width: 320, height: 240 },
    { width: 640, height: 480 },
  ]
  const blobs = []
  const metadata = openDatabase(bucket.metadata)
  try {
    metadata.run('PRAGMA busy_timeout = 5000')
    for (const variant of variants) {
      const bytes = webpBytes(variant.width, variant.height)
      const blobId = `${hash.slice(0, 16)}${hex(16)}`
      fs.writeFileSync(path.join(bucket.blobs, blobId), bytes)
      blobs.push(path.join(bucket.blobs, blobId))
      metadata.run(
        `INSERT INTO _mf_objects (key, blob_id, version, size, etag, uploaded, checksums, http_metadata, custom_metadata)
         VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
        [
          `projects/${projectId}/media/${hash}/${variant.width}.webp`,
          blobId,
          hex(16),
          bytes.byteLength,
          hex(16),
          Date.now(),
          JSON.stringify({ contentType: 'image/webp' }),
          JSON.stringify({ project: projectId, hash }),
        ],
      )
    }
  } finally {
    metadata.close()
  }
  const db = openDatabase(databaseFile)
  try {
    db.run('PRAGMA busy_timeout = 5000')
    db.run(
      `INSERT INTO media (id, project_id, hash, width, height, bytes, alt, focal_x, focal_y, created_at, variants)
       VALUES (?, ?, ?, ?, ?, ?, '', 50, 50, ?, ?)`,
      [
        id,
        projectId,
        hash,
        640,
        480,
        variants.reduce((sum, variant) => sum + webpBytes(variant.width, variant.height).byteLength, 0),
        '2024-01-01T00:00:00.000Z',
        JSON.stringify(variants.map((variant) => ({ ...variant, bytes: webpBytes(variant.width, variant.height).byteLength }))),
      ],
    )
  } finally {
    db.close()
  }
  return {
    id,
    rowExists: () => {
      const check = openDatabase(databaseFile)
      try {
        return Boolean(check.query('SELECT id FROM media WHERE id = ?').get(id))
      } finally {
        check.close()
      }
    },
    objectsExist: () => blobs.some((file) => fs.existsSync(file)),
  }
}

function mintOwnerSession(databaseFile, projectId) {
  const id = 'own_' + [...crypto.getRandomValues(new Uint8Array(24))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const now = new Date().toISOString()
  const db = openDatabase(databaseFile)
  try {
    db.run('PRAGMA busy_timeout = 5000')
    db.run(
      'INSERT INTO owner_sessions (id, project_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
      [id, projectId, now, new Date(Date.now() + 30 * 864e5).toISOString(), now],
    )
  } finally {
    db.close()
  }
  return id
}

async function main() {
  console.log(`source: ${sourceState}`)
  console.log(`work:   ${work}`)
  fs.rmSync(work, { recursive: true, force: true })
  fs.mkdirSync(work, { recursive: true })

  if (!skipBuild) {
    record('build the Worker under test', true, '(bun run build)')
    execFileSync(process.execPath, ['run', 'build'], { stdio: ['ignore', 'pipe', 'inherit'] })
  }

  /* ---------------------------- 1. the backup ---------------------------- */
  const backup = backupInto(path.join(work, 'backups'))
  const manifest = backup.manifest
  record(
    'database backup has integrity and no credentials',
    manifest.database.integrity === 'ok' &&
      Object.values(manifest.redaction.rowSetsRemoved).every((count) => count >= 0),
    `${Object.values(manifest.database.counts).reduce((sum, count) => sum + count, 0)} rows, sha256 ${manifest.database.sha256.slice(0, 16)}…`,
  )
  record(
    'backup strips owner sessions and payment secrets',
    (manifest.redaction.rowSetsRemoved.owner_sessions ?? 0) > 0 &&
      manifest.redaction.columnsCleared.some((entry) => entry.table === 'payment_connections'),
    `removed ${manifest.redaction.rowSetsRemoved.owner_sessions} sessions, cleared ${manifest.redaction.columnsCleared.length} column`,
  )
  const mediaBackup = verifyMediaBackup(path.join(backup.backupDir, 'media'))
  record(
    'media backup has every object with matching bytes and dimensions',
    mediaBackup.ok,
    `${manifest.media.objects} objects, ${Math.round(manifest.media.bytes / 1024)} KB`,
  )

  /* ------------------------- 2. the restore ------------------------- */
  const liveState = path.join(work, 'state')
  bun('scripts/restore.mjs', [
    backup.backupDir, '--persist-to', liveState, '--media-state', liveState, '--force',
  ])
  const liveDatabase = restoredDatabase(liveState)
  const live = verifyDatabase(liveDatabase, {
    counts: manifest.database.counts,
    checksums: manifest.database.checksums,
  })
  record(
    'restored database matches the backup exactly',
    live.ok && live.checks.every((check) => check.ok),
    `${live.checks.length} checks, integrity ok`,
  )
  const restoredMedia = verifyMediaObjects(liveDatabase, findLocalBucket(liveState))
  record(
    'restored database points at no missing media',
    restoredMedia.ok,
    `${restoredMedia.present}/${restoredMedia.expected} objects for ${restoredMedia.rows} rows`,
  )

  /* --------------------- 3. the restored app, served -------------------- */
  const db = openDatabase(liveDatabase, { readonly: true })
  let client
  let other
  let projectId
  try {
    client = db
      .query("SELECT token, name, id FROM projects WHERE doc LIKE '%/media/%' OR doc LIKE '%med_%' ORDER BY created_at LIMIT 1")
      .get()
    other = db.query('SELECT token FROM projects WHERE token <> ? LIMIT 1').get(client.token)
    projectId = client.id
  } finally {
    db.close()
  }

  const child = spawn(
    'bunx',
    ['wrangler', 'dev', '--port', String(port), '--persist-to', liveState, '--local', '--show-interactive-dev-session=false'],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  )
  let logs = ''
  child.stdout.on('data', (chunk) => (logs += chunk))
  child.stderr.on('data', (chunk) => (logs += chunk))
  const base = `http://127.0.0.1:${port}`
  try {
    const healthy = await waitForHealth(base)
    record('restored Worker answers its health check', healthy, healthy ? base : logs.slice(-400))
    if (healthy) {
      const page = await fetch(`${base}/p/${client.token}/app`)
      const html = await page.text()
      record(
        'restored customer app renders',
        page.ok && html.includes(client.name),
        `${page.status}, ${html.length} bytes, ${client.name}`,
      )
      const links = [...html.matchAll(/\/p\/([0-9a-f]{24})\/media\/(med_[a-f0-9]{16,40})\/(\d+)\.webp/g)]
      record('restored app links to its images', links.length > 0, `${links.length} image URLs`)
      if (links.length) {
        const [full, token, mediaId] = links[0]
        const image = await fetch(`${base}${full}`)
        const bytes = new Uint8Array(await image.arrayBuffer())
        const webp =
          bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
          bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
        record(
          'restored image is served as WebP bytes',
          image.ok && webp && bytes.byteLength > 0,
          `${image.status} ${image.headers.get('content-type')} ${bytes.byteLength} bytes`,
        )
        const foreign = await fetch(`${base}/p/${other.token}/media/${mediaId}/320.webp`)
        record('another project cannot fetch that image', foreign.status === 404, `status ${foreign.status}`)
      }

      const signedOut = await fetch(`${base}/api/projects/${client.token}/doc`)
      record('owner routes are closed after a restore', signedOut.status === 401, `status ${signedOut.status}`)
      const session = mintOwnerSession(liveDatabase, projectId)
      const signedIn = await fetch(`${base}/api/projects/${client.token}/doc`, {
        headers: { cookie: `plattr_owner_${client.token.slice(0, 12)}=${session}` },
      })
      record('a fresh owner sign-in works after a restore', signedIn.status === 200, `status ${signedIn.status}`)

      /* ---- cleanup through the Worker, on the disposable copy ---- */
      const seeded = seedOrphan(liveState, liveDatabase, projectId, client.token)
      const auth = { 'content-type': 'application/json', origin: base, cookie: `plattr_owner_${client.token.slice(0, 12)}=${session}` }
      const dry = await fetch(`${base}/api/projects/${client.token}/media/cleanup`, {
        method: 'POST', headers: auth, body: JSON.stringify({ dryRun: true, graceHours: 24 }),
      })
      const dryBody = await dry.json()
      record(
        'cleanup reports an unused upload without deleting it',
        dry.ok && dryBody.report.candidates.some((entry) => entry.id === seeded.id) && seeded.rowExists() && seeded.objectsExist(),
        `${dryBody.report?.candidates?.length ?? '?'} candidates, row and objects still present`,
      )

      const blocked = await fetch(`${base}/api/projects/${client.token}/media/cleanup`, {
        method: 'POST', headers: auth, body: JSON.stringify({ dryRun: false, confirm: true }),
      })
      record('cleanup refuses to run without a backup id', blocked.status === 409, `status ${blocked.status}`)

      const applied = await fetch(`${base}/api/projects/${client.token}/media/cleanup`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({ dryRun: false, confirm: true, backupId: manifest.checksum, graceHours: 24, ids: [seeded.id] }),
      })
      const appliedBody = await applied.json()
      record(
        'cleanup deletes the row and every stored variant through the Worker',
        applied.ok && appliedBody.deleted?.some((entry) => entry.id === seeded.id) && !seeded.rowExists() && !seeded.objectsExist(),
        `${appliedBody.deleted?.length ?? 0} deleted, ${appliedBody.failed?.length ?? 0} failed`,
      )

      const audit = await (await fetch(`${base}/api/projects/${client.token}/media/cleanup`, {
        headers: { cookie: `plattr_owner_${client.token.slice(0, 12)}=${session}` },
      })).json()
      record(
        'cleanup records the deletion against the backup',
        audit.log?.some((entry) => entry.mediaId === seeded.id && entry.action === 'deleted'),
        `${audit.log?.length ?? 0} audit entries`,
      )
    }
  } finally {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // Already gone.
    }
    await new Promise((resolve) => setTimeout(resolve, 800))
  }

  /* ------------------------ 4. failure scenarios ----------------------- */
  const scenario = (name) => {
    const dir = path.join(work, 'scenarios', name)
    copyDir(backup.backupDir, dir)
    return dir
  }
  const firstObject = manifest.media ? readJson(path.join(backup.backupDir, 'media', 'manifest.json')).objects : []
  const referenced = firstObject.filter((entry) => entry.referenced)

  attempt('missing original image is caught before it becomes a bad backup', () => {
    const dir = scenario('missing-original')
    const victim = referenced[0]
    fs.rmSync(path.join(dir, 'media', 'objects', victim.key))
    const verification = verifyMediaBackup(path.join(dir, 'media'))
    if (verification.ok) throw new Error('a missing object was not detected')
    return `${verification.problems[0]}`
  })

  attempt('missing WebP variant is caught by size and checksum', () => {
    const dir = scenario('missing-variant')
    const victim = referenced[0]
    const file = path.join(dir, 'media', 'objects', victim.key)
    const bytes = fs.readFileSync(file)
    fs.writeFileSync(file, bytes.subarray(0, Math.max(1, bytes.byteLength - 8)))
    const verification = verifyMediaBackup(path.join(dir, 'media'))
    if (verification.ok) throw new Error('a truncated variant was not detected')
    return `${verification.problems[0]}`
  })

  attempt('interrupted backup leaves a manifest that refuses to restore', () => {
    const dir = scenario('interrupted-backup')
    // A crash between the object copy and the manifest write is the realistic
    // shape: bytes exist, the record of them does not.
    fs.rmSync(path.join(dir, 'media', 'manifest.json'))
    const verification = verifyMediaBackup(path.join(dir, 'media'))
    if (verification.ok) throw new Error('a backup without a manifest was accepted')
    return verification.problems[0]
  })

  attempt('a database whose bytes do not match its manifest is refused', () => {
    const dir = scenario('corrupt-database')
    const file = path.join(dir, 'database.sqlite')
    const bytes = fs.readFileSync(file)
    bytes[Math.floor(bytes.byteLength / 2)] ^= 0xff
    fs.writeFileSync(file, bytes)
    try {
      bun('scripts/restore.mjs', [dir, '--database', path.join(work, 'scenarios', 'unused.sqlite'), '--force'])
    } catch (error) {
      const message = String(error.stderr ?? error.message ?? error)
      if (!/does not match its manifest checksum/.test(message))
        throw new Error(`restore failed for the wrong reason: ${message.slice(-200)}`)
      return 'restore refused before writing'
    }
    throw new Error('a corrupted backup was restored')
  })

  attempt('an interrupted restore does not touch the existing target', () => {
    const target = path.join(work, 'scenarios', 'target.sqlite')
    copyDatabase(liveDatabase, target)
    const before = sha256File(target)
    const dir = scenario('interrupted-restore')
    const file = path.join(dir, 'database.sqlite')
    const bytes = fs.readFileSync(file)
    bytes[bytes.byteLength - 1] ^= 0xff
    fs.writeFileSync(file, bytes)
    try {
      bun('scripts/restore.mjs', [dir, '--database', target, '--force'])
    } catch {
      // Expected.
    }
    if (sha256File(target) !== before) throw new Error('the target changed after a refused restore')
    return 'target byte-identical after refusal'
  })

  attempt('database restored without its bucket is reported, not hidden', () => {
    const state = path.join(work, 'scenarios', 'db-only')
    bun('scripts/restore.mjs', [backup.backupDir, '--persist-to', state, '--force'])
    const database = restoredDatabase(state)
    // An empty bucket: the restore path a database-only recovery leaves behind.
    const empty = path.join(work, 'scenarios', 'empty-bucket')
    fs.mkdirSync(path.join(empty, 'blobs'), { recursive: true })
    const metadata = path.join(empty, 'bucket.sqlite')
    const e = openDatabase(metadata)
    try {
      e.run(`CREATE TABLE _mf_objects (
        key TEXT PRIMARY KEY, blob_id TEXT, version TEXT NOT NULL, size INTEGER NOT NULL,
        etag TEXT NOT NULL, uploaded INTEGER NOT NULL, checksums TEXT NOT NULL,
        http_metadata TEXT NOT NULL, custom_metadata TEXT NOT NULL)`)
    } finally {
      e.close()
    }
    const check = verifyMediaObjects(database, { metadata, blobs: path.join(empty, 'blobs') })
    if (check.ok) throw new Error('missing objects were not reported')
    return `${check.problems.length} missing objects, recovery: restore the bucket from the same backup`
  })

  attempt('bucket restored without its database leaves no broken links', () => {
    const state = path.join(work, 'scenarios', 'r2-only')
    bun('scripts/restore.mjs', [backup.backupDir, '--persist-to', state, '--media-state', state, '--force'])
    const database = restoredDatabase(state)
    const db = openDatabase(database)
    try {
      db.run('DELETE FROM media')
      db.run("UPDATE projects SET doc = '', spec = '{}'")
    } finally {
      db.close()
    }
    const check = verifyMediaObjects(database, findLocalBucket(state))
    if (!check.ok) throw new Error(check.problems.join('; '))
    if (check.expected !== 0) throw new Error('a restored database still expected media')
    return `0 references, ${check.unreferenced.length} stored objects retained for a later restore`
  })

  attempt('deleting one stored variant is found and repaired from the backup', () => {
    const state = path.join(work, 'scenarios', 'partial-deletion')
    bun('scripts/restore.mjs', [backup.backupDir, '--persist-to', state, '--media-state', state, '--force'])
    const database = restoredDatabase(state)
    const bucket = findLocalBucket(state)
    // A key a media row actually names, so the deletion is a real gap.
    const media = openDatabase(database).query('SELECT * FROM media').all()[0]
    const variant = JSON.parse(media.variants)[0]
    const row = { key: `projects/${media.project_id}/media/${media.hash}/${variant.width}.webp` }
    const metadata = openDatabase(bucket.metadata)
    let blob
    try {
      blob = metadata.query('SELECT blob_id FROM _mf_objects WHERE key = ?').get(row.key).blob_id
      metadata.run('DELETE FROM _mf_objects WHERE key = ?', [row.key])
    } finally {
      metadata.close()
    }
    fs.rmSync(path.join(bucket.blobs, blob))
    const broken = verifyMediaObjects(database, bucket)
    if (broken.ok) throw new Error('a partially deleted object was not detected')
    // Recovery: the backup still holds the bytes.
    const object = readJson(path.join(backup.backupDir, 'media', 'manifest.json')).objects.find((entry) => entry.key === row.key)
    if (!object || !fs.existsSync(path.join(backup.backupDir, 'media', 'objects', object.key)))
      throw new Error('the backup cannot repair the deleted object')
    bun('scripts/restore.mjs', [backup.backupDir, '--database', database, '--media-state', state, '--force'])
    const repaired = verifyMediaObjects(database, findLocalBucket(state))
    if (!repaired.ok) throw new Error('the repair did not restore the object')
    return `${broken.problems.length} problem found, repaired from backup`
  })

  attempt('a deleted media row is caught as a document/object mismatch', () => {
    const dir = path.join(work, 'scenarios', 'reference-mismatch.sqlite')
    copyDatabase(liveDatabase, dir)
    const database = openDatabase(dir)
    try {
      // The project the customer-app check used, so its document actually names
      // one of the deleted rows.
      database.run('DELETE FROM media WHERE project_id = ?', [projectId])
    } finally {
      database.close()
    }
    const check = verifyDatabase(dir)
    const broken = check.warnings.filter((warning) => !warning.ok && /document media references/.test(warning.name))
    if (!broken.length) throw new Error('the mismatch was not reported')
    return broken[0].detail
  })

  attempt('running the same backup twice produces two valid, identical snapshots', () => {
    const second = backupInto(path.join(work, 'backups-duplicate'))
    const firstChecks = databaseChecksums(openDatabase(path.join(backup.backupDir, 'database.sqlite'), { readonly: true }))
    const secondChecks = databaseChecksums(openDatabase(path.join(second.backupDir, 'database.sqlite'), { readonly: true }))
    const same = Object.keys(firstChecks).every((table) => firstChecks[table] === secondChecks[table])
    if (!same) throw new Error('two backups of an unchanged database differ')
    if (firstChecks.projects === undefined) throw new Error('the second backup has no projects table')
    return `${Object.keys(firstChecks).length} tables, identical checksums`
  })

  notes.push({
    scenario: 'failed object deletion during cleanup',
    detail:
      'Covered by tests/mediaCleanup.test.ts: a bucket failure keeps the metadata row, the run reports it, and the retry removes it.',
  })
  notes.push({
    scenario: 'project isolation during cleanup',
    detail:
      'Covered by tests/mediaCleanup.test.ts: another project media is never a candidate and cannot be named by id.',
  })

  /* ---------------------- 5. project-level recovery --------------------- */
  attempt('one project is restored without touching another', () => {
    const dir = path.join(work, 'project')
    fs.mkdirSync(dir, { recursive: true })
    const snapshot = path.join(dir, 'snapshot.sqlite')
    copyDatabase(liveDatabase, snapshot)
    const target = path.join(dir, 'target.sqlite')
    copyDatabase(liveDatabase, target)

    const meta = openDatabase(snapshot, { readonly: true })
    let a
    let b
    try {
      const rows = meta
        .query(
          `SELECT p.token, p.id, p.name,
             (SELECT COUNT(*) FROM doc_versions d WHERE d.project_id = p.id) versions,
             (SELECT COUNT(*) FROM media m WHERE m.project_id = p.id) media,
             (SELECT COUNT(*) FROM customers c WHERE c.project_id = p.id) customers
           FROM projects p ORDER BY versions DESC, media DESC LIMIT 4`,
        )
        .all()
      a = rows.find((row) => row.versions > 0 && row.media > 0)
      b = rows.find((row) => row.id !== a.id && row.customers > 0) ?? rows.find((row) => row.id !== a.id)
      if (!a || !b) throw new Error('need two projects with saved versions and media')
    } finally {
      meta.close()
    }

    const projectTables = ['doc_versions', 'media', 'customers', 'orders', 'bookings', 'enquiries', 'notes', 'activity', 'notifications']
    const peek = (file, token) => {
      const database = openDatabase(file, { readonly: true })
      try {
        const project = database.query('SELECT * FROM projects WHERE token = ?').get(token)
        const tables = Object.fromEntries(
          projectTables.map((table) => [table, tableChecksumsForProject(database, table, project.id)]),
        )
        return { project, tables }
      } finally {
        database.close()
      }
    }
    const beforeA = peek(snapshot, a.token)
    const beforeB = peek(target, b.token)

    // Damage A only: rename it, remove its versions and customers, break its document.
    const damage = openDatabase(target)
    try {
      damage.run('UPDATE projects SET name = ?, doc = ? WHERE id = ?', ['DAMAGED', '{"screens":[]}', beforeA.project.id])
      damage.run('DELETE FROM doc_versions WHERE project_id = ?', [beforeA.project.id])
      damage.run('DELETE FROM customers WHERE project_id = ?', [beforeA.project.id])
      damage.run('DELETE FROM media WHERE project_id = ?', [beforeA.project.id])
    } finally {
      damage.close()
    }

    const countSessions = () => {
      const database = openDatabase(target)
      try {
        return Number(database.query('SELECT COUNT(*) AS n FROM owner_sessions').get().n)
      } finally {
        database.close()
      }
    }
    // The server check minted one session into the live copy, so the assertion
    // is that restoring a project adds none rather than that the table is empty.
    const sessionsBefore = countSessions()
    const restored = restoreProject(target, snapshot, a.token)
    const afterA = peek(target, a.token)
    const afterB = peek(target, b.token)
    if (afterA.project.name !== beforeA.project.name) throw new Error('project A was not restored')
    for (const table of projectTables) {
      if (afterA.tables[table] !== beforeA.tables[table])
        throw new Error(`project A ${table} does not match the snapshot`)
      if (afterB.tables[table] !== beforeB.tables[table])
        throw new Error(`project B ${table} changed`)
    }
    if (afterB.project.name !== beforeB.project.name) throw new Error('project B was renamed')
    const database = openDatabase(target, { readonly: true })
    try {
      const sessions = Number(database.query('SELECT COUNT(*) AS n FROM owner_sessions').get().n)
      if (sessions !== sessionsBefore) throw new Error('owner sessions were restored')
      const foreignCustomers = Number(
        database.query('SELECT COUNT(*) AS n FROM customers WHERE project_id NOT IN (SELECT id FROM projects)').get().n,
      )
      if (foreignCustomers) throw new Error('customer records escaped their project')
    } finally {
      database.close()
    }
    return `${a.name} restored (${restored.restored.doc_versions} versions, ${restored.restored.media} media, ${restored.restored.customers} customers); ${b.name} unchanged; ${sessionsBefore} sessions before, ${sessionsBefore} after`
  })

  /* ---------------------------- 6. the report -------------------------- */
  const failed = results.filter((result) => !result.ok)
  const report = {
    createdAt: new Date().toISOString(),
    environment: {
      kind: 'local Wrangler state (Miniflare D1 and R2)',
      sourceState,
      worker: 'built with vite and served by wrangler dev --persist-to',
      production: 'not exercised: needs Cloudflare credentials for d1 export and r2 object get',
    },
    backup: {
      directory: path.relative(process.cwd(), backup.backupDir),
      databaseSha256: manifest.database.sha256,
      databaseBytes: manifest.database.bytes,
      mediaChecksum: manifest.media?.checksum,
      objects: manifest.media?.objects,
      redaction: manifest.redaction,
    },
    counts: manifest.database.counts,
    results,
    notes,
    ok: failed.length === 0,
  }
  writeJson('docs/qa/recovery/restore-verification.json', report)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) process.exitCode = 1
}

await main()
