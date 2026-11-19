#!/usr/bin/env node
/**
 * Restore a local D1 backup into a target sqlite file.
 *
 * Usage: node scripts/d1-restore.mjs <backup.sqlite> <target.sqlite> [--force]
 *
 * The target is replaced atomically from a verified copy. For a deployed D1,
 * restore with `wrangler d1 execute <name> --remote --file backup.sql` against
 * a freshly created database, verify it, then switch the binding. This script
 * is the rehearsal path and deliberately refuses to overwrite a target without
 * --force.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const [backupArg, targetArg, ...flags] = process.argv.slice(2)
if (!backupArg || !targetArg) {
  console.error('usage: node scripts/d1-restore.mjs <backup.sqlite> <target.sqlite> [--force]')
  process.exit(2)
}
const backup = resolve(backupArg)
const target = resolve(targetArg)
if (!existsSync(backup)) throw new Error(`backup not found: ${backup}`)
const integrity = execFileSync('sqlite3', [backup, 'PRAGMA integrity_check;'], { encoding: 'utf8' }).trim()
if (integrity !== 'ok') throw new Error(`backup failed integrity check: ${integrity}`)
if (existsSync(target) && !flags.includes('--force')) {
  throw new Error(`target exists; pass --force to replace ${target}`)
}
mkdirSync(dirname(target), { recursive: true })
const staging = `${target}.restore-${process.pid}`
copyFileSync(backup, staging)
const counts = Object.fromEntries(
  ['projects', 'orders', 'bookings', 'enquiries', 'media', 'doc_versions', 'owner_sessions'].map((table) => [
    table,
    Number(execFileSync('sqlite3', [staging, `SELECT COUNT(*) FROM ${table};`], { encoding: 'utf8' }).trim()),
  ]),
)
rmSync(target, { force: true })
renameSync(staging, target)
console.log(JSON.stringify({ restored: target, integrity, counts }, null, 2))
