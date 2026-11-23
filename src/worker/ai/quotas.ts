/**
 * Free-tier quota accounting, safe under concurrent requests and shared by
 * every Plattr user.
 *
 * The withdrawn paid trial used an in-process dollar ledger. That is not good
 * enough here: the free allowance is one pool per provider *organisation*, and
 * two requests handled by two Workers isolates (or by the CLI and the Worker at
 * once) must not each believe they have the whole day left. So the counter
 * lives in a store, and every reservation is a single atomic statement whose
 * `WHERE` clause enforces the ceiling — the decision is made by the database,
 * not by JavaScript reading a stale number.
 *
 * Stores:
 *  - `memoryQuotaStore` for tests and pure unit work;
 *  - `d1QuotaStore` for Plattr on Cloudflare (the counter every user shares).
 * The local CLI's file store lives in `quotasFile.ts`, which imports `node:fs`
 * and therefore must never be in the Worker bundle.
 *
 * Money is not tracked here. Every call is `$0`, and that is written literally
 * in the evidence rather than derived from a price table.
 */

import type { FreeModel } from './zeroCost'
import { neuronsFor, poolKeyFor } from './zeroCost'

export type QuotaDelta = { requests: number; tokens: number; neurons: number }
export type QuotaLimits = { requests: number; tokens: number; neurons: number }

export type QuotaState = QuotaDelta & {
  rateLimits: number
  /** ISO time before which the provider told us not to call. Shared state. */
  blockedUntil: string | null
}

const ZERO: QuotaDelta = { requests: 0, tokens: 0, neurons: 0 }

export function emptyQuotaState(): QuotaState {
  return { ...ZERO, rateLimits: 0, blockedUntil: null }
}

/**
 * One table, one row per window key. A window key is
 * `<provider>:<model>:day:<YYYY-MM-DD>` or `...:minute:<YYYY-MM-DDTHH:MM>`,
 * plus one shared `<provider>:neurons:day:<YYYY-MM-DD>` pool for Cloudflare.
 */
export const QUOTA_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ai_quota (
  key TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  neurons INTEGER NOT NULL DEFAULT 0,
  rate_limits INTEGER NOT NULL DEFAULT 0,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);`

/** The one index the migration also creates, kept here so the runtime schema and
 *  `migrations/0001_ai_quota.sql` cannot drift apart. */
export const QUOTA_INDEX_SQL = `CREATE INDEX IF NOT EXISTS ai_quota_by_updated ON ai_quota (updated_at);`

/**
 * The reservation. The row is only written when the delta still fits every
 * ceiling, so two concurrent callers cannot both take the last slot: SQLite (and
 * D1, which is SQLite) serialises the two statements and the second one's
 * `WHERE` fails. `blocked_until` keeps a 429 visible to every caller too.
 */
export const QUOTA_CONSUME_SQL = `
INSERT INTO ai_quota (key, requests, tokens, neurons, rate_limits, blocked_until, updated_at)
VALUES (?, ?, ?, ?, 0, NULL, ?)
ON CONFLICT(key) DO UPDATE SET
  requests = ai_quota.requests + excluded.requests,
  tokens = ai_quota.tokens + excluded.tokens,
  neurons = ai_quota.neurons + excluded.neurons,
  updated_at = excluded.updated_at
WHERE ai_quota.requests + excluded.requests <= ?
  AND ai_quota.tokens + excluded.tokens <= ?
  AND ai_quota.neurons + excluded.neurons <= ?
  AND (ai_quota.blocked_until IS NULL OR ai_quota.blocked_until <= ?)
RETURNING key;`

/** Settlement and release: replace a reservation with actual usage, never
 *  letting a counter fall below zero. */
export const QUOTA_ADJUST_SQL = `
UPDATE ai_quota
SET requests = MAX(0, requests + ?),
    tokens = MAX(0, tokens + ?),
    neurons = MAX(0, neurons + ?),
    updated_at = ?
WHERE key = ?;`

export const QUOTA_READ_SQL = `
SELECT requests, tokens, neurons, rate_limits, blocked_until
FROM ai_quota WHERE key = ?;`

export const QUOTA_RATE_LIMIT_SQL = `
INSERT INTO ai_quota (key, requests, tokens, neurons, rate_limits, blocked_until, updated_at)
VALUES (?, 0, 0, 0, 1, ?, ?)
ON CONFLICT(key) DO UPDATE SET
  rate_limits = ai_quota.rate_limits + 1,
  blocked_until = excluded.blocked_until,
  updated_at = excluded.updated_at;`

export type QuotaStore = {
  /** Atomically add `delta` when it still fits `limits`; false means refuse. */
  tryConsume(key: string, delta: QuotaDelta, limits: QuotaLimits, at: Date): Promise<boolean>
  /** Add a (possibly negative) delta, clamped at zero. */
  adjust(key: string, delta: QuotaDelta, at: Date): Promise<void>
  read(key: string): Promise<QuotaState>
  /** Record a 429 and the time before which nobody should call again. */
  noteRateLimit(key: string, retryAt: Date, at: Date): Promise<void>
}

export function quotaDeltaFits(delta: QuotaDelta, limits: QuotaLimits): boolean {
  return (
    Number.isFinite(delta.requests) &&
    Number.isFinite(delta.tokens) &&
    Number.isFinite(delta.neurons) &&
    delta.requests >= 0 &&
    delta.tokens >= 0 &&
    delta.neurons >= 0 &&
    delta.requests <= limits.requests &&
    delta.tokens <= limits.tokens &&
    delta.neurons <= limits.neurons
  )
}

export function memoryQuotaStore(initial: Record<string, QuotaState> = {}): QuotaStore {
  const rows = new Map<string, QuotaState>(Object.entries(initial))
  const row = (key: string) => {
    const existing = rows.get(key)
    if (existing) return existing
    const created = emptyQuotaState()
    rows.set(key, created)
    return created
  }
  return {
    async tryConsume(key, delta, limits, at) {
      if (!quotaDeltaFits(delta, limits)) return false
      const current = row(key)
      if (current.blockedUntil && current.blockedUntil > at.toISOString()) return false
      if (
        current.requests + delta.requests > limits.requests ||
        current.tokens + delta.tokens > limits.tokens ||
        current.neurons + delta.neurons > limits.neurons
      ) {
        return false
      }
      current.requests += delta.requests
      current.tokens += delta.tokens
      current.neurons += delta.neurons
      return true
    },
    async adjust(key, delta) {
      const current = row(key)
      current.requests = Math.max(0, current.requests + delta.requests)
      current.tokens = Math.max(0, current.tokens + delta.tokens)
      current.neurons = Math.max(0, current.neurons + delta.neurons)
    },
    async read(key) {
      return { ...row(key) }
    },
    async noteRateLimit(key, retryAt) {
      const current = row(key)
      current.rateLimits += 1
      current.blockedUntil = retryAt.toISOString()
    },
  }
}

/** The structural slice of D1 this module needs, so tests can pass a shim. */
export type D1PreparedLike = {
  bind(...values: unknown[]): D1PreparedLike
  first<T = unknown>(): Promise<T | null>
  run(): Promise<unknown>
}

export type D1Like = { prepare(sql: string): D1PreparedLike }

/**
 * D1 owns the decision. `tryConsume` is one `INSERT … ON CONFLICT … WHERE …
 * RETURNING` statement: D1 serialises writers, so of N concurrent callers
 * exactly the ones that still fit the ceiling get a row back.
 */
export function d1QuotaStore(db: D1Like): QuotaStore {
  return {
    async tryConsume(key, delta, limits, at) {
      if (!quotaDeltaFits(delta, limits)) return false
      const now = at.toISOString()
      const rowResult = await db
        .prepare(QUOTA_CONSUME_SQL)
        .bind(
          key,
          delta.requests,
          delta.tokens,
          delta.neurons,
          now,
          limits.requests,
          limits.tokens,
          limits.neurons,
          now,
        )
        .first<{ key: string }>()
      return Boolean(rowResult?.key)
    },
    async adjust(key, delta, at) {
      await db
        .prepare(QUOTA_ADJUST_SQL)
        .bind(delta.requests, delta.tokens, delta.neurons, at.toISOString(), key)
        .run()
    },
    async read(key) {
      const rowResult = await db
        .prepare(QUOTA_READ_SQL)
        .bind(key)
        .first<{
          requests: number
          tokens: number
          neurons: number
          rate_limits: number
          blocked_until: string | null
        }>()
      if (!rowResult) return emptyQuotaState()
      return {
        requests: Number(rowResult.requests ?? 0),
        tokens: Number(rowResult.tokens ?? 0),
        neurons: Number(rowResult.neurons ?? 0),
        rateLimits: Number(rowResult.rate_limits ?? 0),
        blockedUntil: rowResult.blocked_until ?? null,
      }
    },
    async noteRateLimit(key, retryAt, at) {
      await db
        .prepare(QUOTA_RATE_LIMIT_SQL)
        .bind(key, retryAt.toISOString(), at.toISOString())
        .run()
    },
  }
}

export class QuotaExhaustedError extends Error {
  code = 'quota_exhausted' as const
  scope: 'day' | 'minute' | 'pool'
  key: string
  resetsAt: Date
  detail: string

  constructor(scope: 'day' | 'minute' | 'pool', key: string, resetsAt: Date, detail: string) {
    super(detail)
    this.name = 'QuotaExhaustedError'
    this.scope = scope
    this.key = key
    this.resetsAt = resetsAt
    this.detail = detail
  }
}

/** A reservation names both halves of the estimate, because Cloudflare charges
 *  input and output at different Neuron rates. Reserving one total at the input
 *  rate under-states an output-heavy answer by more than half. */
export type QuotaReserveRequest = { inputTokens: number; outputTokens: number }

export type QuotaReservation = {
  model: string
  provider: string
  /** One leg per counter that was consumed, released in reverse on failure. */
  legs: { key: string; delta: QuotaDelta; limits: QuotaLimits; scope: 'day' | 'minute' | 'pool' }[]
  resetsAt: Date
}

export type QuotaUsage = {
  day: QuotaState
  minute: QuotaState
  pool: QuotaState | null
  remaining: { requests: number; tokens: number; neurons: number }
  resetsAt: Date
}

function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10)
}

function utcMinute(at: Date): string {
  return at.toISOString().slice(0, 16)
}

export function nextUtcMidnight(at: Date): Date {
  const next = new Date(at)
  next.setUTCHours(24, 0, 0, 0)
  return next
}

function nextMinute(at: Date): Date {
  return new Date(Math.floor(at.getTime() / 60_000) * 60_000 + 60_000)
}

export function quotaKeys(spec: FreeModel, at: Date) {
  const day = utcDay(at)
  const minute = utcMinute(at)
  return {
    day,
    minute,
    dayKey: `${spec.provider}:${spec.model}:day:${day}`,
    minuteKey: `${spec.provider}:${spec.model}:minute:${minute}`,
    poolKey: poolKeyFor(spec, day),
  }
}

export type QuotaLedger = {
  /** Reserve an input+output token estimate. Throws QuotaExhaustedError. */
  reserve(spec: FreeModel, tokens: QuotaReserveRequest, at?: Date): Promise<QuotaReservation>
  /** Replace the reservation with what the provider reported. */
  settle(reservation: QuotaReservation, actual: { tokens: number; neurons: number }, at?: Date): Promise<void>
  /** Give the reservation back: the call never happened. */
  release(reservation: QuotaReservation, at?: Date): Promise<void>
  /** A 429: nothing may call this model before `retryAt`. */
  noteRateLimit(spec: FreeModel, retryAt: Date, at?: Date): Promise<void>
  usage(spec: FreeModel, at?: Date): Promise<QuotaUsage>
}

/**
 * The ledger the adapters use. Every method fails closed: if the store throws,
 * the error propagates and the request is not made. There is no optimistic
 * "probably still allowed" path.
 */
export function createQuotaLedger(store: QuotaStore, clock: () => Date = () => new Date()): QuotaLedger {
  return {
    async reserve(spec, request, at = clock()) {
      const inputTokens = Math.max(0, Math.ceil(request.inputTokens))
      const outputTokens = Math.max(0, Math.ceil(request.outputTokens))
      const estimate = inputTokens + outputTokens
      const keys = quotaKeys(spec, at)
      if (estimate > spec.contextTokens) {
        throw new QuotaExhaustedError(
          'day',
          keys.dayKey,
          nextUtcMidnight(at),
          `A ${estimate}-token request cannot fit ${spec.model}'s ${spec.contextTokens}-token context.`,
        )
      }
      // The Neuron pool is shared by every Cloudflare model on the account, so
      // it is reserved separately from the per-model counters, and at both
      // published rates: input at 31,818/M and output at 68,182/M.
      const neurons = neuronsFor(spec, inputTokens, outputTokens)
      const legs: QuotaReservation['legs'] = []
      const planned: QuotaReservation['legs'] = [
        ...(keys.poolKey
          ? [
              {
                key: keys.poolKey,
                delta: { requests: 0, tokens: 0, neurons },
                limits: {
                  requests: Number.MAX_SAFE_INTEGER,
                  tokens: Number.MAX_SAFE_INTEGER,
                  neurons: spec.limits.neuronsPerDay,
                },
                scope: 'pool' as const,
              },
            ]
          : []),
        {
          key: keys.dayKey,
          delta: { requests: 1, tokens: estimate, neurons: 0 },
          limits: {
            requests: spec.limits.requestsPerDay,
            tokens: spec.limits.tokensPerDay,
            neurons: Number.MAX_SAFE_INTEGER,
          },
          scope: 'day' as const,
        },
        {
          key: keys.minuteKey,
          delta: { requests: 1, tokens: estimate, neurons: 0 },
          limits: {
            requests: spec.limits.requestsPerMinute,
            tokens: spec.limits.tokensPerMinute,
            neurons: Number.MAX_SAFE_INTEGER,
          },
          scope: 'minute' as const,
        },
      ]
      for (const leg of planned) {
        const ok = await store.tryConsume(leg.key, leg.delta, leg.limits, at)
        if (!ok) {
          // Give back everything already taken, in reverse, so a refusal leaves
          // no phantom spend in any counter.
          for (const taken of [...legs].reverse()) {
            await store.adjust(taken.key, negate(taken.delta), at)
          }
          const resetsAt = leg.scope === 'minute' ? nextMinute(at) : nextUtcMidnight(at)
          throw new QuotaExhaustedError(
            leg.scope,
            leg.key,
            resetsAt,
            leg.scope === 'minute'
              ? `${spec.model} is at its ${leg.limits.tokens.toLocaleString()} tokens/minute free limit. Waiting until ${resetsAt.toISOString()}.`
              : `${spec.model} is at its free ${leg.scope === 'pool' ? 'Neuron pool' : 'daily'} allowance. Waiting until ${resetsAt.toISOString()}.`,
          )
        }
        legs.push(leg)
      }
      return { model: spec.model, provider: spec.provider, legs, resetsAt: nextUtcMidnight(at) }
    },

    async settle(reservation, actual, at = clock()) {
      const reportedTokens = Math.max(0, Math.ceil(actual.tokens))
      const reportedNeurons = Math.max(0, Math.ceil(actual.neurons))
      for (const leg of reservation.legs) {
        if (leg.scope === 'pool') {
          await store.adjust(leg.key, { requests: 0, tokens: 0, neurons: reportedNeurons - leg.delta.neurons }, at)
        } else {
          await store.adjust(leg.key, { requests: 0, tokens: reportedTokens - leg.delta.tokens, neurons: 0 }, at)
        }
      }
    },

    async release(reservation, at = clock()) {
      for (const leg of reservation.legs) {
        await store.adjust(leg.key, negate(leg.delta), at)
      }
    },

    async noteRateLimit(spec, retryAt, at = clock()) {
      const keys = quotaKeys(spec, at)
      await store.noteRateLimit(keys.dayKey, retryAt, at)
    },

    async usage(spec, at = clock()) {
      const keys = quotaKeys(spec, at)
      const day = await store.read(keys.dayKey)
      const minute = await store.read(keys.minuteKey)
      const pool = keys.poolKey ? await store.read(keys.poolKey) : null
      return {
        day,
        minute,
        pool,
        remaining: {
          requests: Math.max(0, spec.limits.requestsPerDay - day.requests),
          tokens: Math.max(0, spec.limits.tokensPerDay - day.tokens),
          neurons: pool && spec.limits.neuronsPerDay ? Math.max(0, spec.limits.neuronsPerDay - pool.neurons) : 0,
        },
        resetsAt: nextUtcMidnight(at),
      }
    },
  }
}

function negate(delta: QuotaDelta): QuotaDelta {
  return { requests: -delta.requests, tokens: -delta.tokens, neurons: -delta.neurons }
}
