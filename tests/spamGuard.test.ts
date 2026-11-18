import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import app, { visitorBucket } from '../src/worker/index'
import { spendProjectBudget } from '../src/worker/db'

/** The real SQL against an in-memory SQLite, as the db suite does. */
class MemoryD1 {
  private db = new Database(':memory:')

  prepare(sql: string) {
    const run = (params: unknown[]) => {
      this.db.prepare(sql).run(...(params as never[]))
      return { success: true, meta: {} }
    }
    const first = (params: unknown[]) => this.db.prepare(sql).get(...(params as never[])) ?? null
    const all = (params: unknown[]) => ({ results: this.db.prepare(sql).all(...(params as never[])) })
    const bound = (params: unknown[]) => ({
      run: async () => run(params),
      first: async () => first(params),
      all: async () => all(params),
    })
    return {
      bind: (...params: unknown[]) => bound(params),
      run: async () => run([]),
      first: async () => first([]),
      all: async () => all([]),
    }
  }
}

/** A database whose counters are already spent. */
function spentDb() {
  const statement = {
    bind: () => statement,
    run: async () => ({ success: true, meta: {} }),
    first: async () => null,
    all: async () => ({ results: [] }),
  }
  return { prepare: () => statement } as unknown as D1Database
}

function post(body: unknown, db: D1Database) {
  return app.request(
    'https://plattr.example/api/projects',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB: db, ASSETS: {} as Fetcher },
  )
}

const brief = {
  name: 'Guard Probe',
  vertical: 'shop',
  accent: '#2a5a8f',
  logo: 'GP',
  features: ['catalog'],
  platforms: ['pwa'],
  plan: 'onetime',
}

describe('the build endpoints are metered', () => {
  test('a bucket allows its limit, then refuses, and the next day is fresh', async () => {
    const db = new MemoryD1() as unknown as D1Database
    for (let index = 0; index < 3; index++) {
      expect(await spendProjectBudget(db, 'visitor:abc', 3, '2026-11-18')).toBe(true)
    }
    expect(await spendProjectBudget(db, 'visitor:abc', 3, '2026-11-18')).toBe(false)
    expect(await spendProjectBudget(db, 'visitor:abc', 3, '2026-11-19')).toBe(true)
    // Another visitor counts separately.
    expect(await spendProjectBudget(db, 'visitor:def', 3, '2026-11-18')).toBe(true)
  })

  test('a visitor over the line is refused before anything is written', async () => {
    const response = await post(brief, spentDb())
    expect(response.status).toBe(429)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('rate_limited')
    // Sends the caller to the actual reset, not an arbitrary hour from now.
    const retry = Number(response.headers.get('retry-after'))
    expect(retry).toBeGreaterThan(0)
    expect(retry).toBeLessThanOrEqual(86_400)
  })

  test('changing X-Forwarded-For does not buy a new allowance', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const call = (spoof: string) =>
      app.request(
        'https://plattr.example/api/projects',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': spoof },
          body: JSON.stringify(brief),
        },
        { DB: db, ASSETS: {} as Fetcher },
      )
    for (let index = 0; index < 3; index++) expect((await call(`10.0.0.${index}`)).status).toBe(201)
    // A brand new forwarded address, same caller: still metered.
    expect((await call('192.0.2.99')).status).toBe(429)
  })

  test('the bucket is a stable hash, and an absent header has its own', async () => {
    const first = await visitorBucket('203.0.113.7')
    expect(await visitorBucket('203.0.113.7')).toBe(first)
    expect(await visitorBucket('198.51.100.9')).not.toBe(first)
    expect(await visitorBucket(undefined)).not.toBe(first)
  })

  test('an allowed build still creates a project', async () => {
    const response = await post(brief, new MemoryD1() as unknown as D1Database)
    expect(response.status).toBe(201)
    const body = (await response.json()) as { token: string; quote: { oneTime: number } }
    expect(body.token).toMatch(/^[0-9a-f]{24}$/)
    expect(body.quote.oneTime).toBeGreaterThan(0)
  })
})

describe('the published pages a stranger meets', () => {
  test('privacy and terms are one page, linked from the site footer', async () => {
    const env = { DB: new MemoryD1() as unknown as D1Database, ASSETS: {} as Fetcher }
    const legal = await app.request('https://plattr.example/privacy', {}, env)
    expect(legal.status).toBe(200)
    const html = await legal.text()
    expect(html).toContain('Privacy')
    expect(html).toContain('Terms')
    expect(html).toContain('Last updated')
    expect(html).toContain('delet')

    const home = await app.request('https://plattr.example/', {}, env)
    expect(await home.text()).toContain('href="/privacy"')

    const terms = await app.request('https://plattr.example/terms', {}, env)
    expect(terms.status).toBe(301)
    expect(terms.headers.get('location')).toBe('/privacy')
  })

  test('deletion requests fall back to the operator until an inbox is set', async () => {
    const env = { DB: new MemoryD1() as unknown as D1Database, ASSETS: {} as Fetcher }
    const fallback = await (await app.request('https://plattr.example/privacy', {}, env)).text()
    expect(fallback).toContain('ask the person who sent you the build link')
    expect(fallback).not.toContain('mailto:')

    const configured = await (
      await app.request(
        'https://plattr.example/privacy',
        {},
        { ...env, CONTACT_EMAIL: 'privacy@example.com' },
      )
    ).text()
    expect(configured).toContain('mailto:privacy@example.com')
    expect(configured).toContain('>privacy@example.com<')

    // A malformed secret never becomes a broken link on a public page.
    const broken = await (
      await app.request('https://plattr.example/privacy', {}, { ...env, CONTACT_EMAIL: 'not an email' })
    ).text()
    expect(broken).not.toContain('mailto:')
    expect(broken).toContain('ask the person who sent you the build link')
  })
})
