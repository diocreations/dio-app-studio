#!/usr/bin/env bun
/**
 * Production backup into a separate R2 bucket.
 *
 *   bun scripts/offsite-backup.mjs --remote --backup-bucket plattr-backups
 *   bun scripts/offsite-backup.mjs --local --persist-to .wrangler/state \
 *        --backup-bucket plattr-backups-drill        # rehearsal
 *
 * What it does, in order:
 *
 *   1. export D1 with `wrangler d1 export` (read-only on the source)
 *   2. import the SQL into a temporary SQLite file and scrub credentials
 *   3. copy every media variant named by a media row through `r2 object get`,
 *      checking size, WebP dimensions and sha256
 *   4. upload the database, manifest and objects to the backup bucket
 *   5. read every uploaded object back and compare its sha256
 *   6. only then mark the run `verified` in the backup index
 *
 * A run is written to the index as `pending` before anything is uploaded, so a
 * crash is visible as an unfinished run rather than a missing one. The index is
 * the audit log and the retention source. A failure posts to
 * `BACKUP_ALERT_WEBHOOK` and exits non-zero.
 *
 * The `--local` mode uses the same code path against Wrangler's local state, so
 * the orchestration can be rehearsed without production credentials. Only the
 * `--remote` flag itself is then unexercised.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  databaseChecksums,
  findLocalBucket,
  mediaManifest,
  openDatabase,
  readBucketObject,
  sha256,
  sha256File,
  tableCounts,
  writeMediaManifest,
  writeScrubbedDatabase,
} from './backup/lib.mjs'
import { createR2, runWrangler, wranglerMode } from './backup/r2.mjs'
import { imageInfo } from '../src/worker/media.ts'

const args = process.argv.slice(2)
const flag = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback
}
const remote = args.includes('--remote')
const dryRun = args.includes('--dry-run')
if (remote && args.includes('--local')) {
  console.error('choose one of --remote or --local')
  process.exit(2)
}
const config = {
  database: flag('database', 'plattr-studio'),
  bucket: flag('bucket', 'plattr-media'),
  backupBucket: flag('backup-bucket', process.env.BACKUP_BUCKET ?? 'plattr-backups'),
  keep: (() => {
    const value = Math.floor(Number(flag('keep', process.env.BACKUP_KEEP ?? '7')))
    return Number.isFinite(value) && value > 0 ? value : 7
  })(),
  stateDir: path.resolve(flag('persist-to', '.wrangler/state')),
  work: path.resolve(flag('work', path.join(os.tmpdir(), `plattr-offsite-${process.pid}`))),
  webhook: process.env.BACKUP_ALERT_WEBHOOK ?? '',
  heartbeat: process.env.BACKUP_HEARTBEAT_URL ?? '',
}
if (config.backupBucket === config.bucket) {
  console.error('the backup bucket must not be the media bucket')
  process.exit(2)
}
// `wrangler d1 export` has no --persist-to: local export always reads
// <cwd>/.wrangler/state. R2 commands do accept it.
const d1Mode = remote ? ['--remote'] : ['--local']
const mode = wranglerMode(remote, config.stateDir)
const r2 = createR2({ bucket: config.backupBucket, mode })
const sourceR2 = createR2({ bucket: config.bucket, mode })
const PREFIX = 'plattr'
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
let stage = 'start'
let runId = ''

let bucketState = null
function readBack(key) {
  if (remote) return fs.readFileSync(r2.get(key, path.join(config.work, 'verify', key)))
  bucketState ??= findLocalBucket(config.stateDir, config.backupBucket)
  return readBucketObject(bucketState, key)?.bytes ?? null
}

/**
 * The index is the only record of which runs exist. Treating an unreadable
 * index as empty would start a fresh history and orphan every existing run, so
 * only a genuinely absent object counts as "first run"; anything else stops
 * the job before it writes.
 */
function readIndex() {
  const file = path.join(config.work, 'index.json')
  try {
    r2.get(`${PREFIX}/index.json`, file)
  } catch (error) {
    if (r2.missing(error)) {
      console.warn(`no ${PREFIX}/index.json in ${config.backupBucket} yet; this run starts the history`)
      return { version: 1, runs: [] }
    }
    throw new Error(
      `could not read ${PREFIX}/index.json from ${config.backupBucket}, so this run would replace the backup history; stopping instead. ${error instanceof Error ? error.message : error}`,
    )
  }
  let index
  try {
    index = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    throw new Error('the backup index exists but is not readable JSON; refusing to overwrite it')
  }
  if (!index || !Array.isArray(index.runs))
    throw new Error('the backup index has no runs array; refusing to overwrite it')
  return index
}

function writeIndex(index) {
  if (!Array.isArray(index.runs)) throw new Error('refusing to write a backup index without a runs array')
  const file = path.join(config.work, 'index.json')
  fs.writeFileSync(file, JSON.stringify(index, null, 2) + '\n')
  r2.put(`${PREFIX}/index.json`, file)
  const back = readBack(`${PREFIX}/index.json`)
  if (!back || sha256(back) !== sha256File(file)) throw new Error('the backup index did not survive the round trip')
}

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

async function alert(error) {
  const text = `Plattr backup failed\nstage: ${stage}\nrun: ${runId || '(not assigned)'}\nmode: ${remote ? 'remote' : 'local'}\n${error instanceof Error ? error.message : String(error)}`
  console.error(text)
  if (!config.webhook) return
  try {
    await fetch(config.webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, stage, runId, mode: remote ? 'remote' : 'local' }),
    })
  } catch (webhookError) {
    console.error(`alert webhook also failed: ${webhookError instanceof Error ? webhookError.message : webhookError}`)
  }
}

async function main() {
  fs.rmSync(config.work, { recursive: true, force: true })
  fs.mkdirSync(config.work, { recursive: true })
  console.log(`mode: ${remote ? 'remote' : 'local'}  database: ${config.database}  media: ${config.bucket}`)
  console.log(`backup bucket: ${config.backupBucket}  prefix: ${PREFIX}/  keep: ${config.keep}`)
  if (remote && !dryRun) {
    // Fail before an export rather than after one: both buckets must exist.
    // A mistyped name otherwise reads as an empty bucket and starts a new
    // history somewhere nobody will look.
    const buckets = runWrangler(['r2', 'bucket', 'list'])
    for (const name of [config.bucket, config.backupBucket]) {
      if (!new RegExp(`(^|\\s)${name}(\\s|$)`).test(buckets))
        throw new Error(`bucket ${name} does not exist in this account; create it before running a backup`)
    }
  }

  /* 1. D1 export */
  stage = 'export'
  const dump = path.join(config.work, 'dump.sql')
  runWrangler(['d1', 'export', config.database, ...d1Mode, '--output', dump])
  const dumpBytes = fs.statSync(dump).size
  console.log(`exported ${(dumpBytes / 1024 / 1024).toFixed(2)} MB of SQL`)

  /* 2. import and scrub */
  stage = 'import'
  const raw = path.join(config.work, 'raw.sqlite')
  const imported = spawnSync('sqlite3', [raw], { input: fs.readFileSync(dump), encoding: 'buffer' })
  if (imported.status !== 0) throw new Error(`sqlite3 import failed: ${imported.stderr?.toString().slice(0, 300)}`)
  fs.rmSync(dump, { force: true })

  stage = 'scrub'
  const runDir = path.join(config.work, 'run')
  const databaseFile = path.join(runDir, 'database.sqlite')
  const redaction = writeScrubbedDatabase(raw, databaseFile)
  fs.rmSync(raw, { force: true })
  const db = openDatabase(databaseFile)
  let counts
  let checksums
  try {
    counts = tableCounts(db)
    checksums = databaseChecksums(db)
  } finally {
    db.close()
  }
  const databaseSha = sha256File(databaseFile)
  runId = `${stamp}-${databaseSha.slice(0, 8)}`
  console.log(`run ${runId}  tables ${Object.keys(counts).length}  rows ${Object.values(counts).reduce((a, b) => a + b, 0)}`)

  /* 3. media */
  stage = 'media'
  const mediaRows = (() => {
    const database = openDatabase(databaseFile)
    try {
      return database.query('SELECT * FROM media').all()
    } finally {
      database.close()
    }
  })()
  const projects = (() => {
    const database = openDatabase(databaseFile)
    try {
      return database.query('SELECT id, token, name FROM projects').all()
    } finally {
      database.close()
    }
  })()
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const objects = []
  const problems = []
  for (const row of mediaRows) {
    let variants
    try {
      variants = JSON.parse(row.variants)
    } catch {
      problems.push({ mediaId: row.id, problem: 'variants metadata is not readable' })
      continue
    }
    for (const variant of variants) {
      const key = `projects/${row.project_id}/media/${row.hash}/${Number(variant.width)}.webp`
      const file = path.join(runDir, 'media', 'objects', key)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      try {
        sourceR2.get(key, file)
      } catch (error) {
        problems.push({ key, problem: `object could not be read: ${error instanceof Error ? error.message : error}` })
        continue
      }
      const bytes = fs.readFileSync(file)
      if (bytes.byteLength !== Number(variant.bytes)) problems.push({ key, problem: 'stored size does not match the media row' })
      const info = imageInfo(new Uint8Array(bytes))
      if (!info || info.format !== 'webp' || info.width !== Number(variant.width) || info.height !== Number(variant.height))
        problems.push({ key, problem: `image is ${info ? `${info.format} ${info.width}x${info.height}` : 'unreadable'}` })
      objects.push({
        key,
        mediaId: row.id,
        projectId: row.project_id,
        projectToken: projectById.get(row.project_id)?.token ?? '',
        projectName: projectById.get(row.project_id)?.name ?? '',
        width: Number(variant.width),
        height: Number(variant.height),
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
        contentType: 'image/webp',
        httpMetadata: { contentType: 'image/webp', cacheControl: 'private, max-age=31536000, immutable' },
        customMetadata: { project: row.project_id, hash: row.hash },
        referenced: true,
      })
    }
  }
  if (problems.length) {
    fs.writeFileSync(path.join(runDir, 'media-problems.json'), JSON.stringify(problems, null, 2))
    throw new Error(`${problems.length} media object(s) are missing or wrong; nothing was uploaded`)
  }
  const media = mediaManifest({
    database: { file: 'database.sqlite', sha256: databaseSha },
    bucket: config.bucket,
    mediaRows: mediaRows.length,
    objects,
    note: 'Remote media backup is driven by media rows. Objects with no row are covered by bucket replication, not by this run.',
  })
  writeMediaManifest(path.join(runDir, 'media'), media)
  console.log(`media: ${objects.length} objects, ${(media.totals.bytes / 1024).toFixed(0)} KB`)

  const summary = {
    id: runId,
    createdAt: new Date().toISOString(),
    mode: remote ? 'remote' : 'local',
    bucket: config.bucket,
    database: {
      sha256: databaseSha,
      bytes: fs.statSync(databaseFile).size,
      counts,
      checksums,
      checksum: sha256(JSON.stringify(checksums)),
    },
    media: { checksum: media.checksum, objects: objects.length, bytes: media.totals.bytes },
    redaction,
    status: 'pending',
  }
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(summary, null, 2) + '\n')

  if (dryRun) {
    console.log(`\ndry run: ${runDir}`)
    console.log(`would upload ${walk(runDir).length} files to ${config.backupBucket}/${PREFIX}/runs/${runId}/`)
    return
  }

  /* 4. mark pending, then upload */
  stage = 'pending'
  const index = readIndex()
  if (index.runs.some((entry) => entry.id === runId))
    throw new Error(`run ${runId} already exists in the index; refusing to overwrite a backup`)
  index.runs.unshift({ ...summary, files: [] })
  writeIndex(index)

  stage = 'upload'
  const files = walk(runDir).map((file) => ({
    file,
    key: `${PREFIX}/runs/${runId}/${path.relative(runDir, file).split(path.sep).join('/')}`,
  }))
  for (const entry of files) r2.put(entry.key, entry.file)
  console.log(`uploaded ${files.length} files`)

  /* 5. verify the round trip */
  stage = 'verify'
  for (const entry of files) {
    const back = readBack(entry.key)
    if (!back) throw new Error(`uploaded object is not readable: ${entry.key}`)
    if (sha256(back) !== sha256File(entry.file)) throw new Error(`uploaded bytes differ from the source: ${entry.key}`)
  }
  console.log(`verified ${files.length} files by reading them back`)

  /* 6. only now is the run a backup */
  stage = 'commit'
  // The run document travels with the backup, so it has to say verified too:
  // a run restored years later must be self-describing without the index.
  summary.status = 'verified'
  summary.verifiedAt = new Date().toISOString()
  summary.files = files.map((entry) => entry.key)
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(summary, null, 2) + '\n')
  r2.put(`${PREFIX}/runs/${runId}/run.json`, path.join(runDir, 'run.json'))
  const runBack = readBack(`${PREFIX}/runs/${runId}/run.json`)
  if (!runBack || sha256(runBack) !== sha256File(path.join(runDir, 'run.json')))
    throw new Error('the verified run document did not survive the round trip')

  const current = readIndex()
  const run = current.runs.find((entry) => entry.id === runId)
  if (!run) throw new Error('the pending run disappeared from the index')
  run.status = 'verified'
  run.verifiedAt = summary.verifiedAt
  run.files = summary.files
  writeIndex(current)

  /* 7. retention, only for verified runs */
  stage = 'retention'
  const next = readIndex()
  const verified = next.runs
    .filter((entry) => entry.status === 'verified')
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
  const expired = verified.slice(config.keep)
  for (const old of expired) {
    for (const key of old.files ?? []) r2.remove(key)
    next.runs = next.runs.filter((entry) => entry.id !== old.id)
    console.log(`pruned ${old.id}`)
  }
  if (expired.length) writeIndex(next)

  // A dead-man switch: a service watching this URL alerts when it stops being
  // pinged, which catches the job never starting at all. It is not part of the
  // backup, so a failed ping warns without failing a verified run.
  if (config.heartbeat) {
    try {
      const response = await fetch(config.heartbeat, { method: 'GET' })
      if (!response.ok) console.warn(`heartbeat returned ${response.status}`)
    } catch (error) {
      console.warn(`heartbeat could not be reached: ${error instanceof Error ? error.message : error}`)
    }
  }

  console.log(
    JSON.stringify(
      {
        run: runId,
        status: 'verified',
        database: summary.database,
        media: summary.media,
        uploaded: files.length,
        kept: Math.min(verified.length, config.keep),
        pruned: expired.length,
      },
      null,
      2,
    ),
  )
}

try {
  await main()
} catch (error) {
  await alert(error)
  process.exitCode = 1
}
