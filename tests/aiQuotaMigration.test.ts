import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { createProject } from '../src/worker/db'
import {
  QUOTA_SCHEMA_SQL,
  createQuotaLedger,
  d1QuotaStore,
  type D1Like,
} from '../src/worker/ai/quotas'
import { freeModelFor } from '../src/worker/ai/zeroCost'
import { MemoryD1 } from './memoryD1'

/**
 * The `ai_quota` migration, applied to a real local SQLite database.
 *
 * `bun:sqlite` is the engine behind a local D1, so this exercises the shipping
 * DDL and the shipping reservation SQL without a deployment, a network call or
 * a production write.
 */

const MIGRATION = readFileSync(
  new URL('../migrations/0001_ai_quota.sql', import.meta.url).pathname,
  'utf8',
)

const AT = new Date('2026-11-23T10:15:30.000Z')

function specOf(model: string) {
  const spec = freeModelFor('groq', model) ?? freeModelFor('cloudflare', model)
  if (!spec) throw new Error(`no free spec for ${model}`)
  return spec
}

const GROQ = specOf('openai/gpt-oss-120b')
const CF = specOf('@cf/openai/gpt-oss-120b')

function localD1(db: Database): D1Like {
  return {
    prepare(sql: string) {
      let values: unknown[] = []
      const api = {
        bind(...args: unknown[]) {
          values = args
          return api
        },
        async first<T = unknown>(): Promise<T | null> {
          return (db.prepare(sql).get(...(values as never[])) as T | undefined) ?? null
        },
        async run(): Promise<unknown> {
          db.prepare(sql).run(...(values as never[]))
          return { success: true }
        },
      }
      return api
    },
  }
}

function columnsOf(db: Database): string[] {
  return (db.prepare('PRAGMA table_info(ai_quota)').all() as { name: string }[])
    .map((column) => column.name)
    .sort()
}

describe('ai_quota migration on a local database', () => {
  test('creates the shared ledger table and is safe to apply twice', () => {
    const db = new Database(':memory:')
    db.exec(MIGRATION)
    db.exec(MIGRATION)
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_quota'")
      .get() as { name: string } | undefined
    expect(table?.name).toBe('ai_quota')
    expect(columnsOf(db)).toEqual([
      'blocked_until',
      'key',
      'neurons',
      'rate_limits',
      'requests',
      'tokens',
      'updated_at',
    ])
  })

  test('the migration and the runtime schema cannot drift apart', () => {
    const migrated = new Database(':memory:')
    migrated.exec(MIGRATION)
    const runtime = new Database(':memory:')
    runtime.exec(QUOTA_SCHEMA_SQL)
    expect(columnsOf(migrated)).toEqual(columnsOf(runtime))
  })

  test('concurrent callers cannot both take the last unit of allowance', async () => {
    const db = new Database(':memory:')
    db.exec(MIGRATION)
    const ledger = createQuotaLedger(d1QuotaStore(localD1(db)))
    // The minute window is the tight one on the free plan: two requests of
    // half its allowance fit, and SQL must refuse every other concurrent one.
    const tokens = Math.floor(GROQ.limits.tokensPerMinute / 2)
    const outcomes = await Promise.all(
      Array.from({ length: 12 }, () =>
        ledger.reserve(GROQ, tokens, AT).then(
          () => 'reserved' as const,
          () => 'refused' as const,
        ),
      ),
    )
    expect(outcomes.filter((entry) => entry === 'reserved')).toHaveLength(2)
    expect(outcomes.filter((entry) => entry === 'refused')).toHaveLength(10)
    const usage = await ledger.usage(GROQ, AT)
    expect(usage.day.requests).toBe(2)
    expect(usage.day.tokens).toBe(tokens * 2)
    expect(usage.minute.tokens).toBe(tokens * 2)
  })

  test('settlement replaces the reservation and release never goes below zero', async () => {
    const db = new Database(':memory:')
    db.exec(MIGRATION)
    const ledger = createQuotaLedger(d1QuotaStore(localD1(db)))
    const reservation = await ledger.reserve(CF, 9_500, AT)
    expect((await ledger.usage(CF, AT)).pool?.neurons).toBeGreaterThan(0)

    await ledger.settle(reservation, { tokens: 1_020, neurons: 42 }, AT)
    expect((await ledger.usage(CF, AT)).day.tokens).toBe(1_020)

    await ledger.release(reservation, AT)
    await ledger.release(reservation, AT)
    const after = await ledger.usage(CF, AT)
    expect(after.day.tokens).toBe(0)
    expect(after.day.requests).toBe(0)
    expect(after.pool?.neurons).toBe(0)
  })

  test('the Worker creates the table at runtime, so no manual migration is required', async () => {
    const db = new MemoryD1()
    await createProject(db as never, {
      name: 'GeeStores',
      contact: '',
      email: '',
      vertical: 'shop',
      accent: '#b8863f',
      logo: 'GS',
      features: ['catalog'],
      platforms: ['pwa'],
      plan: 'onetime',
    })
    const ledger = createQuotaLedger(d1QuotaStore(db as never))
    const reservation = await ledger.reserve(GROQ, 1_000, AT)
    expect(reservation.legs.length).toBeGreaterThan(0)
    expect((await ledger.usage(GROQ, AT)).day.tokens).toBe(1_000)
  })
})
