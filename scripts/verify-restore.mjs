#!/usr/bin/env bun
/**
 * Verify a restored database, and optionally the bucket it points at.
 *
 * Usage:
 *   bun scripts/verify-restore.mjs <database.sqlite> [--media-state <dir>]
 *                                  [--manifest <backup/manifest.json>] [--json]
 *
 * With a manifest, record counts and table checksums are compared with the
 * backup. With a bucket, every media row is matched to a stored WebP of the
 * recorded size and dimensions. Exit code 1 means the restore is not usable.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  findLocalBucket,
  readJson,
  verifyDatabase,
  verifyMediaObjects,
  MEDIA_BUCKET,
} from './backup/lib.mjs'

const args = process.argv.slice(2)
const database = args.find((value, index) => !value.startsWith('--') && !(args[index - 1] ?? '').startsWith('--'))
if (!database) {
  console.error('usage: bun scripts/verify-restore.mjs <database.sqlite> [--media-state <dir>] [--manifest <file>]')
  process.exit(2)
}
const flag = (name) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : ''
}
const manifestPath = flag('manifest')
const manifest = manifestPath ? readJson(path.resolve(manifestPath)) : null
const databaseFile = path.resolve(database)
if (!fs.existsSync(databaseFile)) throw new Error(`database not found: ${databaseFile}`)

const report = {
  database: databaseFile,
  manifest: manifestPath ? path.resolve(manifestPath) : null,
  databaseChecks: verifyDatabase(databaseFile, {
    counts: manifest?.database?.counts,
    checksums: manifest?.database?.checksums,
    strict: args.includes('--strict'),
  }),
  mediaChecks: null,
}

const mediaState = flag('media-state')
if (mediaState) {
  const bucket = findLocalBucket(path.resolve(mediaState), MEDIA_BUCKET)
  report.mediaChecks = verifyMediaObjects(databaseFile, bucket)
}
report.ok = report.databaseChecks.ok && (report.mediaChecks ? report.mediaChecks.ok : true)

if (args.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  for (const check of report.databaseChecks.checks)
    console.log(`${check.ok ? 'ok  ' : 'FAIL'}  ${check.name}: ${check.detail}`)
  for (const warning of report.databaseChecks.warnings ?? [])
    console.log(`${warning.ok ? 'ok  ' : 'warn'}  ${warning.name}: ${warning.detail}`)
  if (report.mediaChecks) {
    console.log(
      `${report.mediaChecks.ok ? 'ok  ' : 'FAIL'}  media objects: ${report.mediaChecks.present}/${report.mediaChecks.expected} present for ${report.mediaChecks.rows} rows`,
    )
    for (const problem of report.mediaChecks.problems.slice(0, 20)) console.log(`      ${problem}`)
    if (report.mediaChecks.unreferenced.length)
      console.log(`      ${report.mediaChecks.unreferenced.length} stored object(s) no row refers to`)
  }
  console.log(report.ok ? '\nrestore verified' : '\nRESTORE NOT USABLE')
}
process.exit(report.ok ? 0 : 1)
