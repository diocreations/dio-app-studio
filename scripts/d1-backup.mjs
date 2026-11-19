#!/usr/bin/env node
/**
 * Local D1 backup rehearsal.
 *
 * Usage: node scripts/d1-backup.mjs <source.sqlite> <backup-dir> [retention]
 *
 * For a deployed D1 database use `wrangler d1 export <name> --remote --output
 * backup.sql` and upload the result to the offsite bucket instead. This script
 * exists so the backup/restore procedure can be rehearsed without production
 * credentials, and so a local QA database has a repeatable snapshot.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const [sourceArg, outArg, retentionArg] = process.argv.slice(2)
if (!sourceArg || !outArg) {
  console.error('usage: node scripts/d1-backup.mjs <source.sqlite> <backup-dir> [retention]')
  process.exit(2)
}
const source = resolve(sourceArg)
const outDir = resolve(outArg)
const retention = Math.max(1, Number(retentionArg || 7))
mkdirSync(outDir, { recursive: true })

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const target = join(outDir, `plattr-${stamp}.sqlite`)
execFileSync('sqlite3', [source, `.backup '${target}'`], { stdio: 'inherit' })

const integrity = execFileSync('sqlite3', [target, 'PRAGMA integrity_check;'], { encoding: 'utf8' }).trim()
if (integrity !== 'ok') throw new Error(`backup failed integrity check: ${integrity}`)
const count = (table) =>
  Number(execFileSync('sqlite3', [target, `SELECT COUNT(*) FROM ${table};`], { encoding: 'utf8' }).trim())
const counts = Object.fromEntries(
  ['projects', 'orders', 'bookings', 'enquiries', 'media', 'doc_versions', 'owner_sessions'].map((table) => [table, count(table)]),
)
const sha256 = createHash('sha256').update(readFileSync(target)).digest('hex')
const manifest = {
  createdAt: new Date().toISOString(),
  source: basename(source),
  file: basename(target),
  bytes: statSync(target).size,
  integrity,
  sha256,
  counts,
}
writeFileSync(join(outDir, `plattr-${stamp}.json`), JSON.stringify(manifest, null, 2) + '\n')

const backups = readdirSync(outDir)
  .filter((name) => /^plattr-.*\.sqlite$/.test(name))
  .sort()
for (const old of backups.slice(0, Math.max(0, backups.length - retention))) {
  rmSync(join(outDir, old))
  const meta = join(outDir, old.replace(/\.sqlite$/, '.json'))
  try { rmSync(meta) } catch { /* no manifest */ }
}
console.log(JSON.stringify(manifest, null, 2))
