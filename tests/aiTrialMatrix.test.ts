import { afterEach, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exitCodeFor, runMatrix } from '../scripts/ai-trial-matrix'

/**
 * The matrix must stop at the first generation that does not finish.
 *
 * These are offline tests: `runMatrix` is driven with stand-in generations, and
 * the end-to-end case runs the real harness in mocked mode, where the gateway
 * is a local stand-in and any other host throws.
 */

const BUSINESSES = [{ id: 'yarmouth' }, { id: 'padella' }, { id: 'afl' }]
const PROVIDERS = [{ id: 'groq' }, { id: 'openrouter' }, { id: 'openrouter-groq' }]

type FakeRecord = {
  generation: number
  status: string
  costUsd: number
  verification: { chargedUsd: number; retainedUsd: number; uncertainAttempts: number }
}

function ok(generation: number, costUsd = 0.0112): FakeRecord {
  return {
    generation,
    status: 'ai',
    costUsd,
    verification: { chargedUsd: costUsd, retainedUsd: 0, uncertainAttempts: 0 },
  }
}

function refused(generation: number, retainedUsd = 0.0016): FakeRecord {
  return {
    generation,
    status: 'failed',
    costUsd: retainedUsd,
    verification: { chargedUsd: 0, retainedUsd, uncertainAttempts: 1 },
  }
}

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('the nine-generation matrix is fail-fast', () => {
  test('a successful generation allows the next generation to run', async () => {
    const seen: string[] = []
    const result = await runMatrix({
      businesses: BUSINESSES,
      providers: PROVIDERS,
      runGeneration: async (business, provider, generation) => {
        seen.push(`${generation}:${business.id}/${provider.id}`)
        return ok(generation)
      },
    })

    expect(seen).toHaveLength(9)
    expect(new Set(seen).size).toBe(9)
    expect(result.complete).toBe(true)
    expect(result.failed).toBeNull()
    expect(result.skipped).toEqual([])
    expect(result.runs.map((run) => run.generation)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(exitCodeFor(result.complete)).toBe(0)
  })

  test('a failed first generation prevents every later generation', async () => {
    const seen: string[] = []
    const result = await runMatrix({
      businesses: BUSINESSES,
      providers: PROVIDERS,
      runGeneration: async (business, provider, generation) => {
        seen.push(`${generation}:${business.id}/${provider.id}`)
        return generation === 1 ? refused(generation) : ok(generation)
      },
    })

    // Only the failing cell was sent; the other eight were never attempted.
    expect(seen).toEqual(['1:yarmouth/groq'])
    expect(result.complete).toBe(false)
    expect(result.runs).toHaveLength(1)
    expect(result.failed?.generation).toBe(1)
    expect(result.failed?.status).toBe('failed')
    expect(result.skipped).toHaveLength(8)
    expect(result.skipped[0]).toEqual({
      generation: 2,
      business: 'yarmouth',
      provider: 'openrouter',
      reason: 'matrix_stopped_after_failure',
    })
    expect(result.skipped.map((cell) => cell.generation)).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
    expect(exitCodeFor(result.complete)).toBe(1)
  })

  test('a failed middle generation keeps earlier results and skips only the later cells', async () => {
    const seen: number[] = []
    const result = await runMatrix({
      businesses: BUSINESSES,
      providers: PROVIDERS,
      runGeneration: async (_business, _provider, generation) => {
        seen.push(generation)
        return generation === 5 ? refused(generation) : ok(generation)
      },
    })

    expect(seen).toEqual([1, 2, 3, 4, 5])
    expect(result.runs).toHaveLength(5)
    expect(result.runs.slice(0, 4).every((run) => run.status === 'ai')).toBe(true)
    expect(result.runs[4].status).toBe('failed')
    expect(result.failed?.generation).toBe(5)
    // The first four results are the same records the successful path returns.
    expect(result.runs[0]).toEqual(ok(1))
    expect(result.skipped.map((cell) => cell.generation)).toEqual([6, 7, 8, 9])
    expect(result.skipped[0]).toMatchObject({ business: 'padella', provider: 'openrouter-groq' })
  })

  test('the charges and retained reservations of every attempt survive a stop', async () => {
    const result = await runMatrix({
      businesses: BUSINESSES,
      providers: PROVIDERS,
      runGeneration: async (_business, _provider, generation) =>
        generation === 3 ? refused(generation, 0.0118) : ok(generation, 0.0042),
    })

    expect(result.runs[0].verification).toEqual({
      chargedUsd: 0.0042,
      retainedUsd: 0,
      uncertainAttempts: 0,
    })
    expect(result.failed?.verification).toEqual({
      chargedUsd: 0,
      retainedUsd: 0.0118,
      uncertainAttempts: 1,
    })
    expect(result.failed?.costUsd).toBe(0.0118)
    // The failed generation is part of the results, not a discarded cell.
    expect(result.failed).not.toBeNull()
    expect(result.runs.at(-1)).toBe(result.failed!)
    // Skipped cells have no record and therefore no charge of their own.
    expect(result.runs).toHaveLength(3)
    expect(result.skipped).toHaveLength(6)
  })

  test('the matrix itself makes no provider call', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      throw new Error('the matrix made a provider call')
    }) as unknown as typeof fetch

    const result = await runMatrix({
      businesses: BUSINESSES,
      providers: PROVIDERS,
      runGeneration: async (_business, _provider, generation) => ok(generation),
    })

    expect(calls).toBe(0)
    expect(result.complete).toBe(true)
  })
})

describe('a stopped matrix exits non-zero and keeps a readable report', () => {
  test('a mocked run stopped at generation one exits 1 and reports what it skipped', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plattr-trial-failfast-'))
    try {
      const script = join(import.meta.dir, '..', 'scripts', 'ai-trial.mjs')
      const proc = spawnSync(process.execPath, [script, '--no-shots'], {
        cwd: dir,
        env: { ...process.env, PLATTR_AI_TRIAL_MOCK_FAIL: 'yarmouth:groq' },
        encoding: 'utf8',
        timeout: 60_000,
      })

      expect(proc.status).toBe(1)
      const out = join(dir, 'docs/qa/ai-trial-2026-11-23/mocked')
      const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) as {
        mode: string
        comparable: boolean
        complete: boolean
        runStatus: string
        plan: { planned: number; completed: number; failed: number; skipped: number }
        runs: { generation: number; status: string; verification: { retainedUsd: number } }[]
        interrupted: { generation: number; business: string; provider: string; retainedUsd: number }
        skipped: { generation: number }[]
        mockedCalls: number
      }

      expect(report.mode).toBe('mocked')
      expect(report.comparable).toBe(false)
      expect(report.complete).toBe(false)
      expect(report.runStatus).toBe('interrupted')
      expect(report.plan).toMatchObject({ planned: 9, completed: 0, failed: 1, skipped: 8 })
      expect(report.runs).toHaveLength(1)
      expect(report.runs[0]).toMatchObject({ generation: 1, status: 'failed' })
      expect(report.interrupted).toMatchObject({
        generation: 1,
        business: 'yarmouth',
        provider: 'groq',
      })
      expect(report.runs[0].verification.retainedUsd).toBeGreaterThan(0)
      expect(report.interrupted.retainedUsd).toBeGreaterThan(0)
      expect(report.skipped.map((cell) => cell.generation)).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
      // Stand-in gateway only: one attempt, no live endpoint.
      expect(report.mockedCalls).toBe(1)

      const markdown = readFileSync(join(out, 'REPORT.md'), 'utf8')
      expect(markdown).toContain('Run: **interrupted**')
      expect(markdown).toContain('Skipped after the failure: 8')
      expect(markdown).toContain('## Interrupted run')
      expect(markdown).toContain('Generation 1 — **yarmouth / groq**')
      expect(markdown).toContain('skipped: generation 9 — afl / openrouter-groq')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
