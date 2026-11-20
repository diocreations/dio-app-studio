#!/usr/bin/env bun
/**
 * Fetch a backup run from the backup bucket into a local directory.
 *
 *   bun scripts/offsite-fetch.mjs --run <id> --out .wrangler/offsite/<id> \
 *        --backup-bucket plattr-backups [--remote|--local]
 *
 * The downloaded directory has the same shape as `scripts/backup.mjs` output,
 * so `scripts/restore.mjs` and `scripts/verify-restore.mjs` work on it
 * unchanged. Every file is checked against the run manifest before it is kept.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  backupManifest,
  readJson,
  sha256File,
  verifyMediaBackup,
  writeBackupManifest,
} from './backup/lib.mjs'
import { createR2, wranglerMode } from './backup/r2.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback
}
const remote = args.includes('--remote')
const run = flag('run')
const bucket = flag('backup-bucket', process.env.BACKUP_BUCKET ?? 'plattr-backups')
const out = path.resolve(flag('out', path.join('.wrangler/offsite', run || 'unknown')))
const stateDir = path.resolve(flag('persist-to', '.wrangler/state'))
if (!run) {
  console.error('usage: bun scripts/offsite-fetch.mjs --run <id> --out <dir> [--remote|--local]')
  process.exit(2)
}
const r2 = createR2({ bucket, mode: wranglerMode(remote, stateDir) })
const get = (key, file) => r2.get(key, file)

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
const prefix = `plattr/runs/${run}`
get(`${prefix}/run.json`, path.join(out, 'run.json'))
const summary = readJson(path.join(out, 'run.json'))
if (summary.status !== 'verified') throw new Error(`run ${run} is ${summary.status}, not a verified backup`)

get(`${prefix}/database.sqlite`, path.join(out, 'database.sqlite'))
if (sha256File(path.join(out, 'database.sqlite')) !== summary.database.sha256)
  throw new Error('the downloaded database does not match the run manifest')

get(`${prefix}/media/manifest.json`, path.join(out, 'media', 'manifest.json'))
const media = readJson(path.join(out, 'media', 'manifest.json'))
for (const object of media.objects) {
  get(`${prefix}/media/objects/${object.key}`, path.join(out, 'media', 'objects', object.key))
  if (sha256File(path.join(out, 'media', 'objects', object.key)) !== object.sha256)
    throw new Error(`downloaded object does not match the manifest: ${object.key}`)
}
const mediaCheck = verifyMediaBackup(path.join(out, 'media'))
if (!mediaCheck.ok) throw new Error(`media verification failed: ${mediaCheck.problems.join('; ')}`)

// The same manifest the local backup writes, so restore and verification do not
// need to know where a backup came from.
const manifest = backupManifest({
  createdAt: summary.createdAt,
  source: { database: `${bucket}/${prefix}/database.sqlite` },
  databaseFile: path.join(out, 'database.sqlite'),
  counts: summary.database.counts,
  checksums: summary.database.checksums ?? {},
  media,
  redaction: summary.redaction,
  offsite: { run, bucket, mode: remote ? 'remote' : 'local' },
})
writeBackupManifest(out, manifest)

console.log(
  JSON.stringify(
    {
      run,
      directory: out,
      database: { sha256: summary.database.sha256, counts: summary.database.counts },
      media: { objects: media.objects.length, checksum: media.checksum },
      next: `bun scripts/restore.mjs ${out} --database <target.sqlite> --media-state <dir> --force`,
    },
    null,
    2,
  ),
)
