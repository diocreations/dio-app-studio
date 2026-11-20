/**
 * `plattr/index.json`: the audit log and the retention source.
 *
 * Three tools touch it — the backup appends, the sweeper marks abandoned runs,
 * and an operator reads it during an incident — so its rules live here rather
 * than in each caller.
 *
 * The important rule is that a read either returns the history or stops the job.
 * Treating an unreadable index as empty would start a fresh history and orphan
 * every existing run, so only a genuinely absent object counts as "first run".
 */
import fs from 'node:fs'
import path from 'node:path'
import { sha256, sha256File } from './lib.mjs'

export const BACKUP_PREFIX = 'plattr'
export const INDEX_KEY = `${BACKUP_PREFIX}/index.json`

function detail(error) {
  return error instanceof Error ? error.message : String(error)
}

function assertIndex(index, key) {
  if (!index || !Array.isArray(index.runs)) throw new Error(`the backup index ${key} has no runs array; refusing to write it`)
}

/**
 * @param {object} options
 * @param {object} options.r2        createR2() handle for the backup bucket
 * @param {string} options.work      scratch directory (created by the caller)
 * @param {(key: string) => Buffer | null} options.readBack  reads a key back
 * @param {string} [options.bucket]  name, for the message only
 */
export function readBackupIndex({ r2, work, readBack, bucket = '', key = INDEX_KEY }) {
  const file = path.join(work, 'index.json')
  try {
    r2.get(key, file)
  } catch (error) {
    if (r2.missing(error)) {
      console.warn(`no ${key} in ${bucket || 'the backup bucket'} yet; there is no history to continue`)
      return { version: 1, runs: [] }
    }
    throw new Error(
      `could not read ${key} from ${bucket || 'the backup bucket'}, so writing it would replace the backup history; stopping instead. ${detail(error)}`,
    )
  }
  let index
  try {
    index = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    throw new Error(`the backup index ${key} exists but is not readable JSON; refusing to overwrite it`)
  }
  assertIndex(index, key)
  return index
}

/** Writes the index and refuses to continue unless the round trip matches. */
export function writeBackupIndex({ r2, work, readBack, key = INDEX_KEY }, index) {
  assertIndex(index, key)
  const file = path.join(work, 'index.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(index, null, 2) + '\n')
  r2.put(key, file)
  const back = readBack(key)
  if (!back || sha256(back) !== sha256File(file)) throw new Error(`${key} did not survive the round trip`)
}
