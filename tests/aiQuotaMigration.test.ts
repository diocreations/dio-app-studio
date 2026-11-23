import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { createProject } from '../src/worker/db'
import {
  QUOTA_INDEX_SQL,
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

function sqliteD1(db: Database): D1Like {
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
        async all<T = unknown>(): Promise<{ results: T[] }> {
          return { results: db.prepare(sql).all(...(values as never[])) as T[] }
        },
        async run(): Promise<unknown> {
          const result = db.prepare(sql).run(...(values as never[]))
          return { success: true, meta: { changes: Number(result.changes) } }
        },
      }
      return api
    },
  }
}

function indexesOf(db: Database): [string, string][] {
  return (
    db
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'ai_quota' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as { name: string; sql: string }[]
  ).map((row) => [row.name, row.sql])
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
    runtime.exec(QUOTA_INDEX_SQL)
    expect(columnsOf(migrated)).toEqual(columnsOf(runtime))
    expect(indexesOf(migrated)).toEqual(indexesOf(runtime))
    expect(indexesOf(migrated).map(([name]) => name)).toEqual(['ai_quota_by_updated'])
  })

  test('a database already at schema version 2 gains the quota table on its next open', async () => {
    const db = new Database(':memory:')
    const d1 = () => sqliteD1(db)
    // Bring the database up the way the shipped version-2 Worker did, then put
    // it back into exactly that state: every table present, `schema_meta`
    // already claiming the schema is complete, and no `ai_quota`.
    await createProject(d1() as never, {
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
    db.exec('DROP TABLE ai_quota')
    db.prepare("UPDATE schema_meta SET value = '2' WHERE key = 'schema_version'").run()
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_quota'").get(),
    ).toBeNull()

    // A new Worker process opens the same database. A cached version-2 marker
    // must not let it skip the additive schema.
    const project = await createProject(d1() as never, {
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
    expect(project.token).toBeTruthy()
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_quota'").get(),
    ).toEqual({ name: 'ai_quota' })
    expect(indexesOf(db).map(([name]) => name)).toEqual(['ai_quota_by_updated'])
    const version = db
      .prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'")
      .get() as { value: string }
    expect(version.value).toBe('4')
    // Version 4 adds the trial's spend pool on the same open.
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_trial_spend'").get(),
    ).toEqual({ name: 'ai_trial_spend' })

    // Usable, not merely present.
    const ledger = createQuotaLedger(d1QuotaStore(d1()))
    const reservation = await ledger.reserve(GROQ, { inputTokens: 1_000, outputTokens: 0 }, AT)
    expect(reservation.legs.length).toBeGreaterThan(0)
    expect((await ledger.usage(GROQ, AT)).day.requests).toBe(1)
  })

  test('concurrent callers cannot both take the last unit of allowance', async () => {
    const db = new Database(':memory:')
    db.exec(MIGRATION)
    const ledger = createQuotaLedger(d1QuotaStore(sqliteD1(db)))
    // The minute window is the tight one on the free plan: two requests of
    // half its allowance fit, and SQL must refuse every other concurrent one.
    const tokens = Math.floor(GROQ.limits.tokensPerMinute / 2)
    const outcomes = await Promise.all(
      Array.from({ length: 12 }, () =>
        ledger.reserve(GROQ, { inputTokens: tokens, outputTokens: 0 }, AT).then(
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
    const ledger = createQuotaLedger(d1QuotaStore(sqliteD1(db)))
    const reservation = await ledger.reserve(CF, { inputTokens: 9_500, outputTokens: 0 }, AT)
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
    const reservation = await ledger.reserve(GROQ, { inputTokens: 1_000, outputTokens: 0 }, AT)
    expect(reservation.legs.length).toBeGreaterThan(0)
    expect((await ledger.usage(GROQ, AT)).day.tokens).toBe(1_000)
  })
})
