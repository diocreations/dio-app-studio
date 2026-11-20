#!/usr/bin/env bun
/**
 * Remove the objects an abandoned backup run left behind.
 *
 *   bun scripts/backup-sweep.mjs --backup-bucket plattr-backups --remote
 *   bun scripts/backup-sweep.mjs --backup-bucket plattr-backups --remote --execute
 *   bun scripts/backup-sweep.mjs --backup-bucket plattr-backups --remote --run <id> --execute
 *
 * A run that fails after it starts uploading stays `pending` in the index and
 * its objects stay in the bucket. Retention only prunes `verified` runs, so
 * without a sweep those bytes accumulate forever.
 *
 * The rules, in the order they matter:
 *
 *   - dry run unless `--execute` is passed; every probe and delete is logged
 *   - only `pending` runs are candidates. A `verified` run is never touched,
 *     and neither is one already marked `abandoned`
 *   - a run must be older than `--older-than` minutes (default 360, minimum
 *     31) before it counts as inactive. The floor is the job's own 30-minute
 *     timeout plus a minute: no run can still be uploading after it
 *   - a run with no readable `createdAt` is skipped, not guessed at
 *   - every key must live under `plattr/runs/<that run>/`; the prefix itself
 *     and any path containing `..` are refused. Because a key carries the run
 *     id, deleting is structurally unable to reach another run's objects
 *   - a key is deleted only after a read proves it exists, and a probe that
 *     cannot tell stops that run without deleting anything
 *   - the index entry is kept and marked `abandoned`, so the attempt stays in
 *     the audit log
 *   - running it twice is safe: the second run finds nothing to do
 *
 * Where the key list comes from: the run's own index entry and the run document
 * in the bucket both record every key the run intended to upload (`expected`),
 * written before the first byte. A run that recorded neither is swept by the
 * fixed names only. Nothing borrows a layout from another run: a key this run
 * never claimed is left in place, because deleting it would be a guess. The
 * only runs without a record are ones started before `expected` existed, and
 * every bucket that had those has been swept.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readJson, sha256 } from './backup/lib.mjs'
import { BACKUP_PREFIX, readBackupIndex, writeBackupIndex } from './backup/index.mjs'
import { createReadBack, createR2, runWrangler, wranglerMode } from './backup/r2.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback
}
const remote = args.includes('--remote')
const execute = args.includes('--execute')
const only = flag('run')
if (remote && args.includes('--local')) {
  console.error('choose one of --remote or --local')
  process.exit(2)
}
const bucket = flag('backup-bucket', process.env.BACKUP_BUCKET ?? 'plattr-backups')
const olderThan = Math.floor(Number(flag('older-than', process.env.SWEEP_OLDER_THAN_MINUTES || '360')))
const stateDir = path.resolve(flag('persist-to', '.wrangler/state'))
const work = path.resolve(flag('work', path.join(os.tmpdir(), `plattr-sweep-${process.pid}`)))
const logFile = flag('log')
const r2 = createR2({ bucket, mode: wranglerMode(remote, stateDir) })
const readBack = createReadBack({ remote, r2, work, stateDir, bucket })
const startedAt = Date.now()
const HOUR = 60 * 60 * 1000

if (!Number.isFinite(olderThan) || olderThan < 31) {
  console.error(
    '--older-than must be at least 31 minutes: a shorter window cannot tell an abandoned run from one still uploading (the workflow times out at 30)',
  )
  process.exit(2)
}

function log(entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry })
  if (logFile) {
    fs.mkdirSync(path.dirname(path.resolve(logFile)), { recursive: true })
    fs.appendFileSync(logFile, line + '\n')
  }
  console.log(line)
}

function runPrefix(id) {
  return `${BACKUP_PREFIX}/runs/${id}`
}

/** A key is only ever deletable inside the run that claims it. */
function ownedKey(key, id) {
  const prefix = `${runPrefix(id)}/`
  if (typeof key !== 'string' || !key.startsWith(prefix)) return false
  if (key === prefix || key.includes('..') || key.includes('\\')) return false
  return true
}

function exists(key) {
  try {
    r2.get(key, path.join(work, 'probe', sha256(key)))
    return true
  } catch (error) {
    if (r2.missing(error)) return false
    throw error
  }
}

/**
 * Every key this run recorded for itself, plus the fixed names every run
 * writes. Nothing is derived from another run's layout.
 */
function candidatesFor(run) {
  const keys = new Set()
  const add = (key) => {
    if (ownedKey(key, run.id)) keys.add(key)
  }
  for (const key of run.expected ?? []) add(key)

  // The run document travels with the run; when it was uploaded it names the
  // files too, which covers runs whose index entry predates `expected`.
  const documentKey = `${runPrefix(run.id)}/run.json`
  try {
    const document = readJson(r2.get(documentKey, path.join(work, 'probe', `${run.id}-run.json`)))
    for (const key of document.expected ?? []) add(key)
    for (const key of document.files ?? []) add(key)
    add(documentKey)
  } catch (error) {
    if (!r2.missing(error)) throw error
  }

  for (const suffix of ['run.json', 'database.sqlite', 'media/manifest.json']) add(`${runPrefix(run.id)}/${suffix}`)
  return [...keys].sort()
}

async function main() {
  fs.rmSync(work, { recursive: true, force: true })
  fs.mkdirSync(work, { recursive: true })
  console.log(
    `mode: ${remote ? 'remote' : 'local'}  bucket: ${bucket}  older than: ${olderThan} min  ${execute ? 'EXECUTE' : 'dry run'}`,
  )

  if (remote && execute) {
    // A mistyped bucket reads as an empty history, which would make this sweep
    // silently do nothing. Name it before touching anything.
    const buckets = runWrangler(['r2', 'bucket', 'list'])
    if (!new RegExp(`(^|\\s)${bucket}(\\s|$)`).test(buckets))
      throw new Error(`bucket ${bucket} does not exist in this account; nothing was swept`)
  }

  const index = readBackupIndex({ r2, work, readBack, bucket })
  const pending = index.runs.filter((run) => run.status === 'pending')

  const summary = { bucket, olderThanMinutes: olderThan, dryRun: !execute, runs: [], deleted: 0, wouldDelete: 0 }

  for (const run of pending) {
    if (only && run.id !== only) continue
    const createdAt = Date.parse(run.createdAt ?? '')
    if (!Number.isFinite(createdAt)) {
      log({ action: 'skip', run: run.id, reason: 'the index entry has no readable createdAt, so its age is unknown' })
      continue
    }
    const age = startedAt - createdAt
    if (age < olderThan * 60 * 1000) {
      log({
        action: 'skip',
        run: run.id,
        reason: `pending but only ${Math.max(0, Math.round(age / 60000))} min old; it may still be uploading`,
      })
      continue
    }
    if (age > 30 * 24 * HOUR) log({ action: 'note', run: run.id, reason: 'pending for more than 30 days' })

    let keys
    try {
      keys = candidatesFor(run)
    } catch (error) {
      log({
        action: 'skip',
        run: run.id,
        reason: `its prefix could not be inspected: ${error instanceof Error ? error.message : error}`,
      })
      continue
    }

    const present = []
    const absent = []
    let undecided = false
    for (const key of keys) {
      try {
        if (exists(key)) present.push(key)
        else absent.push(key)
      } catch (error) {
        // Never delete on doubt: an unreadable probe stops this run entire.
        log({
          action: 'skip',
          run: run.id,
          key,
          reason: `could not tell whether this object exists: ${error instanceof Error ? error.message : error}`,
        })
        undecided = true
        break
      }
    }
    if (undecided) continue

    for (const key of present) log({ action: execute ? 'delete' : 'would-delete', run: run.id, key })
    if (execute) {
      for (const key of present) r2.remove(key)
      run.status = 'abandoned'
      run.abandonedAt = new Date().toISOString()
      run.swept = { at: run.abandonedAt, deleted: present.length, missing: absent.length }
      summary.deleted += present.length
      log({ action: 'abandoned', run: run.id, deleted: present.length })
    } else {
      summary.wouldDelete += present.length
    }
    summary.runs.push({ run: run.id, prefix: runPrefix(run.id), present: present.length, absent: absent.length })
  }

  if (execute && summary.runs.length) {
    // Marked after the deletes: a crash in between leaves the run pending, and
    // the next sweep re-probes it rather than trusting a half-done record.
    writeBackupIndex({ r2, work, readBack }, index)
  }

  if (only && !summary.runs.length) console.log(`run ${only} is not an abandoned pending run; nothing to sweep`)
  if (!pending.length) console.log('no pending runs: nothing to sweep')
  console.log(JSON.stringify(summary, null, 2))
}

try {
  await main()
} catch (error) {
  console.error(`sweep failed: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
}
