import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'

type Env = {
  DB: D1Database
  ASSETS: Fetcher
  STUDIO_KEY?: string
  IMPORT_DAILY_CAP?: string
  IMPORT_VISITOR_CAP?: string
}

/** Just enough D1 for the import route: it only counts a unit and reads it back. */
function stubDb(used: number) {
  const state = { prepared: 0 }
  const statement = {
    bind: () => statement,
    run: async () => ({ success: true, meta: {} }),
    first: async () => ({ used }),
    all: async () => ({ results: [] }),
  }
  const db = {
    prepare: () => {
      state.prepared += 1
      return statement
    },
  } as unknown as D1Database
  return { db, state }
}

/** A D1 stub whose counter answers can differ per call, in route order. */
function sequenceDb(...rows: Array<null | { used: number }>) {
  let calls = 0
  const statement = {
    bind: () => statement,
    run: async () => ({ success: true, meta: {} }),
    first: async () => rows[Math.min(calls++, rows.length - 1)] ?? null,
    all: async () => ({ results: [] }),
  }
  const db = { prepare: () => statement } as unknown as D1Database
  return { db }
}

function post(headers: Record<string, string>, body: string, env: Partial<Env> = {}) {
  return app.request(
    'https://plattr.example/api/import',
    { method: 'POST', headers, body },
    { ASSETS: {} as Fetcher, ...env } as Env,
  )
}

const JSON_HEADERS = { 'content-type': 'application/json' }

async function code(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code
}

describe('the import endpoint refuses work it should not do', () => {
  test('another site cannot spend our outbound requests', async () => {
    const response = await post(
      { ...JSON_HEADERS, origin: 'https://elsewhere.example' },
      JSON.stringify({ url: 'https://example.com' }),
    )
    expect(response.status).toBe(403)
    expect(await code(response)).toBe('cross_origin')
  })

  test('a simple form post cannot reach the importer', async () => {
    const response = await post(
      { 'content-type': 'text/plain', origin: 'https://plattr.example' },
      JSON.stringify({ url: 'https://example.com' }),
    )
    expect(response.status).toBe(415)
  })

  test('our own page still gets past the guard', async () => {
    const response = await post(
      { 'content-type': 'application/json; charset=utf-8', origin: 'https://plattr.example' },
      'not json',
    )
    expect(response.status).toBe(400)
    expect(await code(response)).toBe('invalid_json')
  })

  test('a non-browser caller with no Origin is allowed to try', async () => {
    const response = await post(JSON_HEADERS, 'not json')
    expect(response.status).toBe(400)
  })

  test('a junk link costs no unit of the day', async () => {
    const { db, state } = stubDb(0)
    for (const url of ['http://127.0.0.1/', 'file:///etc/passwd', 'http://intranet/']) {
      const response = await post(JSON_HEADERS, JSON.stringify({ url }), { DB: db })
      expect(response.status).toBe(400)
    }
    expect(state.prepared).toBe(0)
  })

  test('the daily cap refuses with its own 429', async () => {
    // Visitor has room, then the shared counter comes back over its cap.
    const { db } = sequenceDb({ used: 1 }, { used: 4 })
    const response = await post(
      JSON_HEADERS,
      JSON.stringify({ url: 'https://example.com' }),
      { DB: db, IMPORT_DAILY_CAP: '3' },
    )
    expect(response.status).toBe(429)
    expect(await code(response)).toBe('daily_budget')
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  test('one visitor cannot spend the whole day\'s imports', async () => {
    // The visitor's own bucket is full; the shared counter is never touched.
    const { db } = sequenceDb(null)
    const response = await post(
      JSON_HEADERS,
      JSON.stringify({ url: 'https://example.com' }),
      { DB: db, IMPORT_VISITOR_CAP: '3' },
    )
    expect(response.status).toBe(429)
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0)
    const payload = (await response.json()) as { error: { code: string; message: string } }
    expect(payload.error.code).toBe('visitor_budget')
    expect(payload.error.message).toContain('Fill the brief in by hand')
  })
})
