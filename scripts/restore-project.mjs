#!/usr/bin/env bun
/**
 * Restore one project from a database snapshot, leaving every other project
 * untouched.
 *
 *   bun scripts/restore-project.mjs <snapshot.sqlite> <target.sqlite> --token <token>
 *     [--media-backup <backup/media> --media-state <wrangler-state-dir>]
 *
 * The project row and every table carrying its project_id are replaced in one
 * transaction. Owner sessions are not restored, and neither are platform
 * ownership claims (they carry verification tokens). With `--media-backup` and
 * `--media-state`, that project's stored variants are restored from the same
 * backup as well.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  findLocalBucket,
  restoreMedia,
  restoreProject,
  verifyDatabase,
  MEDIA_BUCKET,
} from './backup/lib.mjs'

const args = process.argv.slice(2)
const positional = args.filter((value, index) => !value.startsWith('--') && !(args[index - 1] ?? '').startsWith('--'))
const [snapshotArg, targetArg] = positional
const flag = (name) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : ''
}
const token = flag('token')
if (!snapshotArg || !targetArg || !/^[0-9a-f]{24}$/.test(token)) {
  console.error('usage: bun scripts/restore-project.mjs <snapshot.sqlite> <target.sqlite> --token <token> [--media-backup <dir> --media-state <dir>]')
  process.exit(2)
}
const snapshot = path.resolve(snapshotArg)
const target = path.resolve(targetArg)
if (!fs.existsSync(snapshot)) throw new Error(`snapshot not found: ${snapshot}`)
if (!fs.existsSync(target)) throw new Error(`target not found: ${target}`)

const result = restoreProject(target, snapshot, token)

let media = null
const mediaBackup = flag('media-backup')
const mediaState = flag('media-state')
if (mediaBackup && mediaState) {
  const bucket = findLocalBucket(path.resolve(mediaState), MEDIA_BUCKET)
  media = restoreMedia(path.resolve(mediaBackup), bucket, { projectId: result.projectId })
}

const check = verifyDatabase(target)
console.log(
  JSON.stringify(
    {
      project: result,
      media,
      verification: {
        ok: check.ok,
        failed: check.checks.filter((entry) => !entry.ok),
        warnings: check.warnings.filter((entry) => !entry.ok),
      },
    },
    null,
    2,
  ),
)
if (!check.ok) process.exitCode = 1
