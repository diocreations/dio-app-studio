#!/usr/bin/env bun
/**
 * Restore a verified backup into a separate database and bucket.
 *
 * Usage:
 *   bun scripts/restore.mjs <backup-dir> --database <target.sqlite> [--force]
 *   bun scripts/restore.mjs <backup-dir> --persist-to <wrangler-state-dir> [--force]
 *   bun scripts/restore.mjs <backup-dir> --media-state <wrangler-state-dir>
 *
 * A `--persist-to` target is next to what `wrangler dev --persist-to` uses, so
 * the restored copy can be opened as a disposable environment. The backup is
 * verified before anything is written, the database is staged and renamed, and
 * no target is overwritten without --force.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  findLocalBucket,
  openDatabase,
  readJson,
  restoreMedia,
  sha256File,
  verifyDatabase,
  verifyMediaBackup,
  MEDIA_BUCKET,
} from './backup/lib.mjs'

const args = process.argv.slice(2)
const positional = args.filter((value, index) => !value.startsWith('--') && !(args[index - 1] ?? '').startsWith('--'))
const [backupDirArg] = positional
if (!backupDirArg) {
  console.error('usage: bun scripts/restore.mjs <backup-dir> --database <file> | --persist-to <dir> [--force]')
  process.exit(2)
}
const flag = (name) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : ''
}
const force = args.includes('--force')
const backupDir = path.resolve(backupDirArg)
const manifestPath = path.join(backupDir, 'manifest.json')
if (!fs.existsSync(manifestPath)) throw new Error(`no manifest in ${backupDir}; this is not a backup`)
const manifest = readJson(manifestPath)

const backupDatabase = path.join(backupDir, manifest.database.file)
if (!fs.existsSync(backupDatabase)) throw new Error(`backup database is missing: ${backupDatabase}`)
if (sha256File(backupDatabase) !== manifest.database.sha256)
  throw new Error('the backup database does not match its manifest checksum; refusing to restore')

const preflight = verifyDatabase(backupDatabase, {
  counts: manifest.database.counts,
  checksums: manifest.database.checksums,
})
if (!preflight.ok) {
  console.error(JSON.stringify(preflight.checks.filter((check) => !check.ok), null, 2))
  throw new Error('the backup database failed its pre-restore checks')
}

const persistTo = flag('persist-to')
let targetDatabase = flag('database')
if (persistTo) {
  fs.mkdirSync(persistTo, { recursive: true })
  // Let Wrangler create (or find) the D1 file for this project so the restored
  // copy lands exactly where a dev server will look for it.
  execFileSync(
    'bunx',
    ['wrangler', 'd1', 'execute', 'plattr-studio', '--local', '--persist-to', persistTo, '--command', 'select 1'],
    { stdio: 'ignore' },
  )
  targetDatabase = d1FileInState(persistTo)
}
if (!targetDatabase) throw new Error('pass --database <file> or --persist-to <dir>')
targetDatabase = path.resolve(targetDatabase)
if (fs.existsSync(targetDatabase) && !force)
  throw new Error(`target exists; pass --force to replace ${targetDatabase}`)
fs.mkdirSync(path.dirname(targetDatabase), { recursive: true })

const staging = `${targetDatabase}.restore-${process.pid}`
fs.copyFileSync(backupDatabase, staging)
const staged = verifyDatabase(staging, { counts: manifest.database.counts, checksums: manifest.database.checksums })
if (!staged.ok) {
  fs.rmSync(staging, { force: true })
  throw new Error('the staged restore failed verification; the target was not touched')
}
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${targetDatabase}${suffix}`, { force: true })
fs.renameSync(staging, targetDatabase)

let media = null
const mediaState = flag('media-state')
if (mediaState) {
  if (!manifest.media) throw new Error('this backup has no media to restore')
  const verification = verifyMediaBackup(path.join(backupDir, 'media'))
  if (!verification.ok) throw new Error(`media backup failed verification: ${verification.problems.join('; ')}`)
  const bucketState = ensureBucketState(mediaState)
  media = restoreMedia(path.join(backupDir, 'media'), bucketState)
}

console.log(
  JSON.stringify(
    {
      database: {
        restored: targetDatabase,
        checksum: manifest.database.sha256,
        integrity: 'ok',
        counts: staged.counts,
      },
      media,
      ownerSessions: 'not restored; owners sign in again',
    },
    null,
    2,
  ),
)

function d1FileInState(stateDir) {
  const dir = path.join(stateDir, 'v3/d1/miniflare-D1DatabaseObject')
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sqlite') && file !== 'metadata.sqlite')
    .map((file) => path.join(dir, file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  if (!files.length) throw new Error(`no D1 file under ${dir}`)
  return files[0]
}

function ensureBucketState(stateDir) {
  try {
    return findLocalBucket(stateDir, MEDIA_BUCKET)
  } catch {
    const probe = path.join(os.tmpdir(), `plattr-restore-probe-${process.pid}.webp`)
    fs.writeFileSync(probe, 'probe')
    execFileSync(
      'bunx',
      [
        'wrangler', 'r2', 'object', 'put', `${MEDIA_BUCKET}/.plattr-restore-probe`,
        '--local', '--persist-to', stateDir, '--file', probe,
      ],
      { stdio: 'ignore' },
    )
    fs.rmSync(probe, { force: true })
    const bucket = findLocalBucket(stateDir, MEDIA_BUCKET)
    const db = openDatabase(bucket.metadata)
    try {
      const row = db.query('SELECT blob_id FROM _mf_objects WHERE key = ?').get('.plattr-restore-probe')
      if (row) fs.rmSync(path.join(bucket.blobs, row.blob_id), { force: true })
      db.run('DELETE FROM _mf_objects WHERE key = ?', ['.plattr-restore-probe'])
    } finally {
      db.close()
    }
    return bucket
  }
}
