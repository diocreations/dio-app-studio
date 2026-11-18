import { describe, expect, test } from 'bun:test'
import { ImportError, importOnce, throttleImports, type ImportReport } from '../src/worker/importer'

const report = {} as ImportReport

describe('the importer spends outbound requests carefully', () => {
  test('a burst of three, then one more every twenty seconds', () => {
    const bucket = 'burst'
    const start = 1_000_000
    for (let index = 0; index < 3; index += 1) throttleImports(bucket, start)
    expect(() => throttleImports(bucket, start)).toThrow(ImportError)
    throttleImports(bucket, start + 20_000)
    expect(() => throttleImports(bucket, start + 20_000)).toThrow(ImportError)
    throttleImports(bucket, start + 40_000)
  })

  test('an idle bucket refills to its burst and no further', () => {
    const bucket = 'idle'
    const start = 2_000_000
    for (let index = 0; index < 3; index += 1) throttleImports(bucket, start)
    const later = start + 60 * 60_000
    for (let index = 0; index < 3; index += 1) throttleImports(bucket, later)
    expect(() => throttleImports(bucket, later)).toThrow(ImportError)
  })

  test('the refusal is a 429 that says to wait', () => {
    const bucket = 'refusal'
    const start = 3_000_000
    for (let index = 0; index < 3; index += 1) throttleImports(bucket, start)
    try {
      throttleImports(bucket, start)
      throw new Error('expected a refusal')
    } catch (error) {
      expect(error).toBeInstanceOf(ImportError)
      expect((error as ImportError).status).toBe(429)
      expect((error as ImportError).code).toBe('rate_limited')
    }
  })

  test('two visitors asking for the same URL share one crawl', async () => {
    let runs = 0
    let release: (value: ImportReport) => void = () => {}
    const gate = new Promise<ImportReport>((resolve) => {
      release = resolve
    })
    const run = async () => {
      runs += 1
      return gate
    }
    const first = importOnce('https://example.com/shop', run)
    const second = importOnce('HTTPS://Example.com/shop', run)
    release(report)
    expect(await first).toBe(report)
    expect(await second).toBe(report)
    expect(runs).toBe(1)
  })

  test('the shared key is the normalised URL, not the typed string', async () => {
    let runs = 0
    let release: (value: ImportReport) => void = () => {}
    const gate = new Promise<ImportReport>((resolve) => {
      release = resolve
    })
    const run = async () => {
      runs += 1
      return gate
    }
    const bare = importOnce('example.com/shop', run)
    const dressed = importOnce('HTTPS://Example.com/shop#reviews', run)
    expect(dressed).toBe(bare)
    release(report)
    await bare
    expect(runs).toBe(1)
  })

  test('the shared crawl is released once it settles', async () => {
    let runs = 0
    const run = async () => {
      runs += 1
      return report
    }
    await importOnce('https://example.com/once', run)
    await Promise.resolve()
    await importOnce('https://example.com/once', run)
    expect(runs).toBe(2)
  })

  test('a failed crawl is not shared with the next attempt', async () => {
    let runs = 0
    const failing = importOnce('https://example.com/broken', async () => {
      runs += 1
      throw new Error('site down')
    })
    await expect(failing).rejects.toThrow('site down')
    await Promise.resolve()
    await importOnce('https://example.com/broken', async () => {
      runs += 1
      return report
    })
    expect(runs).toBe(2)
  })
})
