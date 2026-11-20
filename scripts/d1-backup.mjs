#!/usr/bin/env bun
/**
 * Database-only backup, scrubbed and verifiable.
 *
 *   bun scripts/d1-backup.mjs <source.sqlite> <backup-dir> [retention]
 *
 * `scripts/backup.mjs` is the full command (database plus media). This one stays
 * for a database-only snapshot, and it writes the same manifest: integrity,
 * per-table counts and checksums, and the redactions it made. Owner sessions and
 * platform tokens are removed; payment provider secrets are blanked.
 *
 * For a deployed D1 database export with
 * `wrangler d1 export <name> --remote --output backup.sql`, import it into a
 * fresh database, then run `scripts/verify-restore.mjs` against it.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  databaseChecksums,
  openDatabase,
  tableCounts,
  writeJson,
  writeScrubbedDatabase,
} from './backup/lib.mjs'

const [sourceArg, outArg, retentionArg] = process.argv.slice(2)
if (!sourceArg || !outArg) {
  console.error('usage: bun scripts/d1-backup.mjs <source.sqlite> <backup-dir> [retention]')
  process.exit(2)
}
const source = path.resolve(sourceArg)
const outDir = path.resolve(outArg)
const retention = Math.max(1, Number(retentionArg || 7))
if (!fs.existsSync(source)) throw new Error(`database not found: ${source}`)
fs.mkdirSync(outDir, { recursive: true })

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const target = path.join(outDir, `plattr-${stamp}.sqlite`)
const redaction = writeScrubbedDatabase(source, target)

const db = openDatabase(target)
let counts
let checksums
try {
  counts = tableCounts(db)
  checksums = databaseChecksums(db)
} finally {
  db.close()
}

const manifest = {
  createdAt: new Date().toISOString(),
  source: path.basename(source),
  file: path.basename(target),
  bytes: fs.statSync(target).size,
  integrity: 'ok',
  counts,
  checksums,
  redaction,
}
writeJson(path.join(outDir, `plattr-${stamp}.json`), manifest)

const backups = fs
  .readdirSync(outDir)
  .filter((name) => /^plattr-.*\.sqlite$/.test(name))
  .sort()
for (const old of backups.slice(0, Math.max(0, backups.length - retention))) {
  fs.rmSync(path.join(outDir, old), { force: true })
  fs.rmSync(path.join(outDir, old.replace(/\.sqlite$/, '.json')), { force: true })
}
console.log(JSON.stringify(manifest, null, 2))
