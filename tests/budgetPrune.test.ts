import { describe, expect, test } from 'bun:test'
import { spendDailyBudget, spendImportBudget } from '../src/worker/db'
import { MemoryD1 } from './memoryD1'

async function keys(db: D1Database, table: 'daily_budget' | 'import_budget'): Promise<string[]> {
  const column = table === 'daily_budget' ? 'key' : 'day'
  const { results } = await db.prepare(`SELECT ${column} AS value FROM ${table}`).all<{ value: string }>()
  return results.map((row) => row.value).sort()
}

describe('daily counters do not pile up', () => {
  test('the first import of a new day clears yesterday and keeps today', async () => {
    const db = new MemoryD1() as unknown as D1Database

    // Yesterday: a build bucket, its shared bucket, and an import.
    await spendDailyBudget(db, 'visitor:old', 3, '2026-11-17')
    await spendDailyBudget(db, 'all', 40, '2026-11-17')
    await spendImportBudget(db, '2026-11-17')
    expect(await keys(db, 'daily_budget')).toHaveLength(2)
    expect(await keys(db, 'import_budget')).toEqual(['2026-11-17'])

    // Today: one build bucket, then the first import triggers cleanup.
    await spendDailyBudget(db, 'visitor:today', 3, '2026-11-18')
    await spendImportBudget(db, '2026-11-18')

    expect(await keys(db, 'daily_budget')).toEqual(['2026-11-18:visitor:today'])
    expect(await keys(db, 'import_budget')).toEqual(['2026-11-18'])
  })

  test('the first build of a new day clears both tables too', async () => {
    const db = new MemoryD1() as unknown as D1Database
    await spendDailyBudget(db, 'visitor:old', 3, '2026-11-17')
    await spendImportBudget(db, '2026-11-17')

    // A fresh day with only builds: the shared bucket's first row prunes.
    await spendDailyBudget(db, 'all', 40, '2026-11-18')

    expect(await keys(db, 'daily_budget')).toEqual(['2026-11-18:all'])
    expect(await keys(db, 'import_budget')).toEqual([])
  })

  test('a visitor bucket alone does not trigger a sweep', async () => {
    const db = new MemoryD1() as unknown as D1Database
    await spendDailyBudget(db, 'visitor:old', 3, '2026-11-17')
    await spendDailyBudget(db, 'visitor:today', 3, '2026-11-18')
    // Nothing to prune on: both rows are still there until a shared bucket or
    // an import starts the day.
    expect(await keys(db, 'daily_budget')).toHaveLength(2)
  })
})
