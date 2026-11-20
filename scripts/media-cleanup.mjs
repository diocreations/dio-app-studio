#!/usr/bin/env bun
/**
 * Report and remove unused uploads through the running Worker.
 *
 *   bun scripts/media-cleanup.mjs --token <app token>                    # dry run
 *   bun scripts/media-cleanup.mjs --token <token> --apply \
 *        --backup .wrangler/backups/<stamp>/manifest.json
 *
 * The Worker owns the bucket, so deletion has to go through it: it re-reads
 * every document and saved version, refuses anything still referenced, removes
 * the stored variants and the metadata row, and writes an audit entry. This
 * command only decides which project and which backup to point at.
 *
 * The backup argument is mandatory for --apply. Its checksum is copied into the
 * audit log, so a deletion can be traced to the snapshot that made it
 * recoverable. Refusing without one is deliberate.
 */
import { Database } from 'bun:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { readJson } from './backup/lib.mjs'
import { localDatabase } from '../docs/qa/apps/scripts/sessions.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback
}
const token = flag('token')
if (!/^[0-9a-f]{24}$/.test(token)) {
  console.error('usage: bun scripts/media-cleanup.mjs --token <24-char token> [--apply --backup <manifest>] [--grace-hours 24] [--ids a,b]')
  process.exit(2)
}
const base = flag('base', 'http://127.0.0.1:8795').replace(/\/$/, '')
const graceHours = Number(flag('grace-hours', '24'))
const apply = args.includes('--apply')
const json = args.includes('--json')
const cookieFile = process.env.QA_COOKIES ?? path.join(process.env.TMPDIR ?? '/tmp', 'plattr-qa-owner-cookies.json')

/**
 * A local owner session, minted only when the cookie file does not already have
 * one. Nothing here reaches a deployed environment; the QA harness uses the same
 * table for its fixture sign-ins.
 */
function session() {
  const cookies = fs.existsSync(cookieFile) ? readJson(cookieFile) : {}
  let entry = cookies[token]
  if (!entry) {
    const db = new Database(localDatabase())
    try {
      const project = db.query('select id from projects where token = ?').get(token)
      if (!project) throw new Error(`no project with token ${token} in ${localDatabase()}`)
      const id = 'own_' + [...crypto.getRandomValues(new Uint8Array(24))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      const now = new Date().toISOString()
      db.query(
        'insert into owner_sessions (id, project_id, created_at, expires_at, last_seen_at) values (?, ?, ?, ?, ?)',
      ).run(id, project.id, now, new Date(Date.now() + 30 * 864e5).toISOString(), now)
      entry = { name: `plattr_owner_${token.slice(0, 12)}`, value: id }
      cookies[token] = entry
      fs.mkdirSync(path.dirname(cookieFile), { recursive: true })
      fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2) + '\n')
    } finally {
      db.close()
    }
  }
  return `${entry.name}=${entry.value}`
}

function backupId() {
  const given = flag('backup')
  if (!given) throw new Error('--apply needs --backup <manifest.json or backup directory>')
  const file = fs.statSync(given).isDirectory() ? path.join(given, 'manifest.json') : given
  const manifest = readJson(file)
  if (!manifest.database?.sha256 || !manifest.checksum)
    throw new Error(`${file} is not a verified Plattr backup manifest`)
  return { id: manifest.checksum, file, objects: manifest.media?.objects ?? 0 }
}

const ids = flag('ids') ? flag('ids').split(',').map((id) => id.trim()).filter(Boolean) : undefined

async function call(body) {
  const response = await fetch(`${base}/api/projects/${token}/media/cleanup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base, cookie: session() },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(`${response.status} ${payload?.error?.code ?? ''}: ${payload?.error?.message ?? 'request failed'}`)
  return payload
}

const backup = apply ? backupId() : null
const payload = await call(apply
  ? { dryRun: false, confirm: true, backupId: backup.id, graceHours, ids }
  : { dryRun: true, graceHours })

if (json) {
  console.log(JSON.stringify(payload, null, 2))
} else if (!apply) {
  const report = payload.report
  console.log(`${report.name} (${report.token})`)
  console.log(`checked ${report.checkedAt} · grace ${report.graceHours}h · ${report.uploads} uploads · ${report.protectedUploads} in use`)
  if (!report.candidates.length) {
    console.log('no unused uploads are old enough to remove')
  } else {
    console.log('')
    for (const candidate of report.candidates) {
      console.log(`  ${candidate.id}  ${candidate.createdAt.slice(0, 10)}  ${candidate.ageHours}h  ${candidate.objects.length} objects  ${Math.round(candidate.bytes / 1024)} KB`)
    }
    console.log(`\n${report.candidates.length} removable (${report.objects} objects, ${Math.round(report.bytes / 1024)} KB)`)
  }
  for (const entry of report.skipped) console.log(`  kept ${entry.id}: ${entry.reason}`)
  if (report.candidates.length) console.log('\nRun again with --apply --backup <verified manifest> to remove them.')
} else {
  console.log(`run ${payload.runId} · backup ${backup.id.slice(0, 16)}… (${backup.file})`)
  for (const entry of payload.deleted) console.log(`  deleted ${entry.id} (${entry.objects.length} objects, ${Math.round(entry.bytes / 1024)} KB)`)
  for (const entry of payload.skipped) console.log(`  skipped ${entry.id}: ${entry.reason}`)
  for (const entry of payload.failed) console.log(`  FAILED  ${entry.id}: ${entry.reason}`)
  console.log(`\n${payload.deleted.length} deleted, ${payload.skipped.length} skipped, ${payload.failed.length} failed`)
  if (payload.failed.length) process.exitCode = 1
}
