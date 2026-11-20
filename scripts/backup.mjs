#!/usr/bin/env bun
/**
 * One reproducible backup: database plus media.
 *
 * Usage:
 *   bun scripts/backup.mjs [--state .wrangler/state] [--out .wrangler/backups]
 *                          [--retention 7] [--database <file>] [--no-media]
 *
 * Writes <out>/<stamp>/database.sqlite, <out>/<stamp>/media/, and a manifest
 * that ties them together. Credentials and session tokens are stripped from the
 * database copy; media objects are read through their stored variant metadata,
 * so a backup that finishes has no missing objects.
 *
 * Against production, export D1 with `wrangler d1 export --remote` and copy the
 * bucket with `wrangler r2 object get --remote`; the verification steps in
 * scripts/verify-restore.mjs apply unchanged.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  backupMedia,
  databaseChecksums,
  findLocalBucket,
  findLocalDatabase,
  sha256,
  sha256File,
  tableCounts,
  writeJson,
  writeScrubbedDatabase,
  openDatabase,
  EXCLUDED_ROWS,
  REDACTED_COLUMNS,
  MEDIA_BUCKET,
} from './backup/lib.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback
}
const stateDir = path.resolve(flag('state', '.wrangler/state'))
const outRoot = path.resolve(flag('out', '.wrangler/backups'))
const retention = Math.max(1, Number(flag('retention', '7')))
const skipMedia = args.includes('--no-media')

const source = path.resolve(flag('database', findLocalDatabase(stateDir)))
if (!fs.existsSync(source)) throw new Error(`database not found: ${source}`)

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outDir = path.join(outRoot, stamp)
fs.mkdirSync(outDir, { recursive: true })

console.log(`backing up ${source}`)
const databaseFile = path.join(outDir, 'database.sqlite')
const redaction = writeScrubbedDatabase(source, databaseFile)

const db = openDatabase(databaseFile)
let counts
let checksums
try {
  counts = tableCounts(db)
  checksums = databaseChecksums(db)
} finally {
  db.close()
}

let media = null
if (!skipMedia) {
  const bucketState = findLocalBucket(stateDir, MEDIA_BUCKET)
  media = backupMedia(databaseFile, bucketState, path.join(outDir, 'media'))
  if (media.problems.length) {
    console.error(JSON.stringify(media.problems, null, 2))
    throw new Error(
      `media backup is incomplete: ${media.problems.length} problem(s). Nothing was deleted; fix the source and run again.`,
    )
  }
}

const manifest = {
  createdAt: new Date().toISOString(),
  source: { database: source, bytes: fs.statSync(source).size, sha256: sha256File(source) },
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
  redaction: {
    rowSetsRemoved: redaction.removed,
    columnsCleared: redaction.cleared,
    policy: { excludedRows: EXCLUDED_ROWS, redactedColumns: REDACTED_COLUMNS },
  },
  restoreNotes: [
    'Owner and platform sessions are not in this backup; everybody signs in again.',
    'Payment provider secrets are blank; reconnect the provider after a restore.',
    'Invitations are not restored; send new invitations.',
  ],
}
manifest.checksum = sha256(
  JSON.stringify({ database: manifest.database.checksum, media: manifest.media?.checksum ?? '', counts }),
)
writeJson(path.join(outDir, 'manifest.json'), manifest)

// Keep the newest `retention` backups; only directories this script wrote.
const backups = fs
  .readdirSync(outRoot)
  .filter((name) => /^\d{4}-\d{2}-\d{2}T/.test(name) && fs.existsSync(path.join(outRoot, name, 'manifest.json')))
  .sort()
const removed = []
for (const name of backups.slice(0, Math.max(0, backups.length - retention))) {
  fs.rmSync(path.join(outRoot, name), { recursive: true, force: true })
  removed.push(name)
}

console.log(
  JSON.stringify(
    {
      backup: outDir,
      database: { bytes: manifest.database.bytes, sha256: manifest.database.sha256, counts },
      media: manifest.media,
      redaction: manifest.redaction,
      pruned: removed,
      checksum: manifest.checksum,
    },
    null,
    2,
  ),
)

