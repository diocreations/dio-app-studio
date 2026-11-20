import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * One place that knows how to talk to Wrangler about R2, and what a missing
 * object looks like. Both the backup and the fetch need that distinction: a
 * missing backup index is a first run, while an unreadable one is a reason to
 * stop before overwriting history.
 */
export function wranglerMode(remote, stateDir) {
  return remote ? ['--remote'] : ['--local', '--persist-to', stateDir]
}

export function runWrangler(argv) {
  const result = spawnSync('bunx', ['wrangler', ...argv], { encoding: 'utf8' })
  if (result.status !== 0) {
    const detail = `${result.stderr || result.stdout || ''}`
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-3)
      .join(' ')
    throw new Error(`wrangler ${argv.slice(0, 3).join(' ')} failed: ${detail.slice(0, 400)}`)
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

/** Wrangler reports an absent key as "The specified key does not exist." */
export function isMissingObject(error) {
  return /specified key does not exist|NoSuchKey|object was not found|404 not found/i.test(
    String(error?.message ?? error),
  )
}

export function createR2({ bucket, mode }) {
  const label = (key) => `${bucket}/${key}`
  return {
    get(key, file) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      runWrangler(['r2', 'object', 'get', label(key), ...mode, '--file', file])
      return file
    },
    put(key, file) {
      runWrangler(['r2', 'object', 'put', label(key), ...mode, '--file', file])
    },
    remove(key) {
      runWrangler(['r2', 'object', 'delete', label(key), ...mode])
    },
    missing: isMissingObject,
  }
}
