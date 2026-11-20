#!/usr/bin/env bun
/**
 * Restore a database backup into a target file.
 *
 *   bun scripts/d1-restore.mjs <backup.sqlite> <target.sqlite> [--force]
 *
 * The backup is integrity-checked, the copy is staged and verified, and only
 * then renamed into place, so a failure leaves the target untouched. Use
 * `scripts/restore.mjs` when you also have media to restore; it compares record
 * counts and checksums against the manifest as well.
 */
import fs from 'node:fs'
import path from 'node:path'
import { openDatabase, tableCounts } from './backup/lib.mjs'

const [backupArg, targetArg, ...flags] = process.argv.slice(2)
if (!backupArg || !targetArg) {
  console.error('usage: bun scripts/d1-restore.mjs <backup.sqlite> <target.sqlite> [--force]')
  process.exit(2)
}
const backup = path.resolve(backupArg)
const target = path.resolve(targetArg)
if (!fs.existsSync(backup)) throw new Error(`backup not found: ${backup}`)
if (fs.existsSync(target) && !flags.includes('--force'))
  throw new Error(`target exists; pass --force to replace ${target}`)

const staging = `${target}.restore-${process.pid}`
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.copyFileSync(backup, staging)
const db = openDatabase(staging)
let integrity
let counts
try {
  integrity = String(db.query('PRAGMA integrity_check').get().integrity_check)
  counts = tableCounts(db)
} finally {
  db.close()
}
if (integrity !== 'ok') {
  fs.rmSync(staging, { force: true })
  throw new Error(`backup failed integrity check: ${integrity}`)
}
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${target}${suffix}`, { force: true })
fs.renameSync(staging, target)
console.log(JSON.stringify({ restored: target, integrity, counts }, null, 2))
