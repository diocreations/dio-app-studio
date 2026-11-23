/**
 * A JSON-file quota store for local CLI runs.
 *
 * Kept out of `quotas.ts` on purpose: this module imports `node:fs`, and the
 * Worker bundle must never pull that in. The Worker uses `d1QuotaStore`.
 *
 * The lock matters: two CLI processes sharing one file must not both take the
 * last slot, so the whole read-modify-write happens while holding
 * `<path>.lock`, created exclusively.
 */

import { closeSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  createQuotaLedger,
  emptyQuotaState,
  quotaDeltaFits,
  type QuotaLedger,
  type QuotaState,
  type QuotaStore,
} from './quotas'

export function fileQuotaStore(path: string): QuotaStore {
  const read = (): Record<string, QuotaState> => {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, QuotaState>
      const out: Record<string, QuotaState> = {}
      for (const [key, value] of Object.entries(parsed)) {
        out[key] = { ...emptyQuotaState(), ...value }
      }
      return out
    } catch {
      return {}
    }
  }

  const withLock = async <T>(work: (rows: Record<string, QuotaState>) => T): Promise<T> => {
    await mkdir(dirname(path), { recursive: true })
    const lockPath = `${path}.lock`
    const deadline = Date.now() + 5_000
    let handle: number | null = null
    while (handle === null) {
      try {
        handle = openSync(lockPath, 'wx')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        if (Date.now() > deadline) {
          // A crashed process can leave a lock behind. This is a quota counter,
          // not user data, so refusing to proceed is safer than guessing.
          throw new Error(`Quota lock ${lockPath} was held for more than 5s; refusing to guess a quota.`)
        }
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    }
    try {
      const rows = read()
      const result = work(rows)
      const temp = `${path}.${process.pid}.tmp`
      writeFileSync(temp, JSON.stringify(rows, null, 2))
      renameSync(temp, path)
      return result
    } finally {
      closeSync(handle)
      try {
        unlinkSync(lockPath)
      } catch {
        // Already removed; nothing to do.
      }
    }
  }

  return {
    async tryConsume(key, delta, limits, at) {
      if (!quotaDeltaFits(delta, limits)) return false
      return withLock((rows) => {
        const current = rows[key] ?? emptyQuotaState()
        const now = at.toISOString()
        if (current.blockedUntil && current.blockedUntil > now) {
          rows[key] = current
          return false
        }
        if (
          current.requests + delta.requests > limits.requests ||
          current.tokens + delta.tokens > limits.tokens ||
          current.neurons + delta.neurons > limits.neurons
        ) {
          rows[key] = current
          return false
        }
        rows[key] = {
          ...current,
          requests: current.requests + delta.requests,
          tokens: current.tokens + delta.tokens,
          neurons: current.neurons + delta.neurons,
        }
        return true
      })
    },
    async adjust(key, delta) {
      await withLock((rows) => {
        const current = rows[key] ?? emptyQuotaState()
        rows[key] = {
          ...current,
          requests: Math.max(0, current.requests + delta.requests),
          tokens: Math.max(0, current.tokens + delta.tokens),
          neurons: Math.max(0, current.neurons + delta.neurons),
        }
      })
    },
    async read(key) {
      return { ...(read()[key] ?? emptyQuotaState()) }
    },
    async noteRateLimit(key, retryAt) {
      await withLock((rows) => {
        const current = rows[key] ?? emptyQuotaState()
        rows[key] = { ...current, rateLimits: current.rateLimits + 1, blockedUntil: retryAt.toISOString() }
      })
    },
  }
}

/** A ledger for a one-off process that has no D1 binding. Local only: it is a
 *  file with a lock, not an in-memory counter. */
export function localQuotaLedger(path = '.wrangler/ai-quota.json'): QuotaLedger {
  return createQuotaLedger(fileQuotaStore(path))
}
