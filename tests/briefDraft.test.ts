import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { applyPriceDecisions, sanitizeImported, type ImportedSite } from '../src/worker/importer'
import { MemoryD1 } from './memoryD1'

/**
 * Unfinished briefs and the owner's answers to conflicting prices.
 *
 * The draft is addressed only by an unguessable id in its own httpOnly cookie,
 * so these tests cover the two things that matter: a visitor gets their own
 * brief back after a refresh, and nobody else can read it.
 */

const ORIGIN = 'https://plattr.example'

function newEnv() {
  return { DB: new MemoryD1() as unknown as D1Database, ASSETS: {} as Fetcher }
}

function draftCookie(response: Response): string {
  const header = response.headers.get('set-cookie') ?? ''
  return header.match(/plattr_draft=[^;]+/)?.[0] ?? ''
}

function save(env: ReturnType<typeof newEnv>, cookie: string, data: unknown) {
  return app.request(
    `${ORIGIN}/api/brief/draft`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        origin: ORIGIN,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ data }),
    },
    env as never,
  )
}

function load(env: ReturnType<typeof newEnv>, cookie = '') {
  return app.request(
    `${ORIGIN}/api/brief/draft`,
    { headers: cookie ? { cookie } : {} },
    env as never,
  )
}

const CONCEPTS = [
  { id: 'editorial', name: 'Editorial', note: 'A', axes: { buttons: 'soft' }, preview: '/demo/app?biz=shop' },
  { id: 'modern', name: 'Modern', note: 'B', axes: { buttons: 'square' }, preview: '/demo/app?biz=shop' },
  { id: 'luxe', name: 'Luxe', note: 'C', axes: { buttons: 'pill' }, preview: '/demo/app?biz=shop' },
]

const DRAFT = {
  v: 1,
  step: 2,
  import: { host: 'fernandflint.example', source: 'https://fernandflint.example', pagesRead: ['/'], quality: {} },
  site: {
    name: 'Fern & Flint',
    currency: 'GBP',
    vertical: 'restaurant',
    menu: [{ name: 'Coffee', items: [{ name: 'Flat white', desc: '', price: 340 }] }],
  },
  fields: {
    name: 'Fern & Flint',
    tagline: 'Coffee, slowly',
    category: 'Coffee bar',
    custom: '',
    accent: '#c8452b',
    logo: 'FF',
    contact: 'Marta',
    email: 'marta@example.com',
    vertical: 'restaurant',
  },
  features: ['catalog', 'ordering'],
  concept: CONCEPTS[1],
  concepts: CONCEPTS,
  label: 'Coffee bar',
  decisions: [
    {
      name: 'Flat white',
      choice: 'page',
      value: 340,
      decidedAt: '2026-11-20T10:00:00.000Z',
      page: 340,
      feed: 365,
      pageSource: 'https://fernandflint.example/menu',
      feedSource: 'https://fernandflint.example/products.json',
    },
  ],
}

describe('unfinished brief drafts', () => {
  test('a saved brief comes back whole after a refresh', async () => {
    const env = newEnv()
    const put = await save(env, '', DRAFT)
    expect(put.status).toBe(200)
    const cookie = draftCookie(put)
    expect(cookie).toStartWith('plattr_draft=drf_')

    const restored = await load(env, cookie)
    const body = (await restored.json()) as { draft: { data: typeof DRAFT; updatedAt: string } }
    expect(body.draft.data.step).toBe(2)
    expect(body.draft.data.fields.name).toBe('Fern & Flint')
    expect(body.draft.data.site.menu[0].items[0].price).toBe(340)
    expect(body.draft.data.features).toEqual(['catalog', 'ordering'])
    expect(body.draft.data.concept?.id).toBe('modern')
    // All three concepts, not just the chosen one: the picker still needs them.
    expect(body.draft.data.concepts.map((concept) => concept.id)).toEqual(['editorial', 'modern', 'luxe'])
    expect(body.draft.data.decisions[0].decidedAt).toBe('2026-11-20T10:00:00.000Z')
  })

  test('two visitors cannot read each other drafts', async () => {
    const env = newEnv()
    const first = draftCookie(await save(env, '', { ...DRAFT, fields: { ...DRAFT.fields, email: 'a@example.com' } }))
    const second = draftCookie(await save(env, '', { ...DRAFT, fields: { ...DRAFT.fields, email: 'b@example.com' } }))
    expect(first).not.toBe(second)

    const a = (await (await load(env, first)).json()) as { draft: { data: { fields: { email: string } } } }
    const b = (await (await load(env, second)).json()) as { draft: { data: { fields: { email: string } } } }
    expect(a.draft.data.fields.email).toBe('a@example.com')
    expect(b.draft.data.fields.email).toBe('b@example.com')

    // No cookie, a well-formed but unknown id, and a forged one all read empty.
    const anonymous = (await (await load(env)).json()) as { draft: unknown }
    expect(anonymous.draft).toBeNull()
    const guessed = (await (await load(env, 'plattr_draft=drf_00000000000000000000000000000000')).json()) as { draft: unknown }
    expect(guessed.draft).toBeNull()
    const forged = (await (await load(env, 'plattr_draft=../../projects')).json()) as { draft: unknown }
    expect(forged.draft).toBeNull()
  })

  test('saving again updates the same draft instead of piling up rows', async () => {
    const env = newEnv()
    const cookie = draftCookie(await save(env, '', DRAFT))
    const again = await save(env, cookie, { ...DRAFT, step: 3 })
    expect(draftCookie(again)).toBe(cookie)
    const body = (await (await load(env, cookie)).json()) as { draft: { data: { step: number } } }
    expect(body.draft.data.step).toBe(3)
  })

  test('discarding removes the draft and its cookie', async () => {
    const env = newEnv()
    const cookie = draftCookie(await save(env, '', DRAFT))
    const gone = await app.request(
      `${ORIGIN}/api/brief/draft`,
      { method: 'DELETE', headers: { origin: ORIGIN, cookie } },
      env as never,
    )
    expect(gone.status).toBe(200)
    expect(gone.headers.get('set-cookie') ?? '').toContain('plattr_draft=;')
    const body = (await (await load(env, cookie)).json()) as { draft: unknown }
    expect(body.draft).toBeNull()
  })

  test('another origin cannot write or delete a draft', async () => {
    const env = newEnv()
    const written = await app.request(
      `${ORIGIN}/api/brief/draft`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: 'https://elsewhere.example' },
        body: JSON.stringify({ data: DRAFT }),
      },
      env as never,
    )
    expect(written.status).toBe(403)
    const deleted = await app.request(
      `${ORIGIN}/api/brief/draft`,
      { method: 'DELETE', headers: { origin: 'https://elsewhere.example' } },
      env as never,
    )
    expect(deleted.status).toBe(403)
  })

  test('an oversized draft is refused rather than stored', async () => {
    const env = newEnv()
    const response = await save(env, '', { ...DRAFT, note: 'x'.repeat(260_000) })
    expect(response.status).toBe(413)
    expect(draftCookie(response)).toBe('')
  })
})

describe('conflicting prices', () => {
  const site: Pick<ImportedSite, 'currency' | 'menu'> = {
    currency: 'GBP',
    menu: [
      {
        name: 'Coffee',
        items: [
          { name: 'Flat white', desc: '', price: 0 },
          { name: 'Filter', desc: '', price: 300 },
        ],
      },
    ],
  }

  test('a confirmed page price becomes an owner decision with its timestamp', () => {
    const decided = applyPriceDecisions({
      ...site,
      priceDecisions: [
        {
          name: 'Flat white',
          choice: 'page',
          value: 340,
          decidedAt: '2026-11-20T10:00:00.000Z',
          page: 340,
          feed: 365,
          pageSource: 'https://fernandflint.example/menu',
          feedSource: 'https://fernandflint.example/products.json',
        },
      ],
    })
    const item = decided.menu![0].items[0]
    expect(item.price).toBe(340)
    expect(item.priceEvidence?.method).toBe('owner')
    expect(item.priceEvidence?.validated).toBe(true)
    // Both original readings and both sources stay with the price.
    expect(item.priceEvidence?.source).toContain('page 3.40 from https://fernandflint.example/menu')
    expect(item.priceEvidence?.source).toContain('feed 3.65 from https://fernandflint.example/products.json')
    expect(item.priceEvidence?.source).toContain('2026-11-20T10:00:00.000Z')
  })

  test('a correction replaces both readings and the evidence says so', () => {
    const decided = applyPriceDecisions({
      ...site,
      priceDecisions: [{ name: 'flat WHITE', choice: 'custom', value: 355, decidedAt: '2026-11-20T11:00:00.000Z' }],
    })
    expect(decided.menu![0].items[0].price).toBe(355)
    expect(decided.menu![0].items[0].priceEvidence?.raw).toBe('3.55')
  })

  test('a deferred conflict publishes no price at all', () => {
    const decided = applyPriceDecisions({
      ...site,
      priceDecisions: [{ name: 'Flat white', choice: 'defer', value: 0, decidedAt: '' }],
    })
    expect(decided.menu![0].items[0].price).toBe(0)
    expect(decided.menu![0].items[0].priceEvidence).toBeUndefined()
    // An untouched item keeps the price that already had evidence.
    expect(decided.menu![0].items[1].price).toBe(300)
  })

  test('the build publishes the confirmed price and never the other reading', async () => {
    const env = newEnv()
    const build = (decisions: unknown[]) =>
      app.request(
        `${ORIGIN}/api/projects`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: ORIGIN },
          body: JSON.stringify({
            name: 'Fern & Flint',
            vertical: 'restaurant',
            accent: '#c8452b',
            logo: 'FF',
            features: ['catalog'],
            site: {
              ...site,
              name: 'Fern & Flint',
              // The page reading and the feed reading disagree, so the brief
              // holds no verified figure for this item until the owner answers.
              menu: [{ name: 'Coffee', items: [{ name: 'Flat white', desc: '', price: 0 }] }],
              priceDecisions: decisions,
            },
          }),
        },
        env as never,
      )

    const confirmed = await build([
      { name: 'Flat white', choice: 'page', value: 340, decidedAt: '2026-11-20T10:00:00.000Z' },
    ])
    expect(confirmed.status).toBe(201)
    const token = ((await confirmed.json()) as { token: string }).token
    const html = await (await app.request(`${ORIGIN}/p/${token}/app`, {}, env as never)).text()
    expect(html).toContain('3.40')
    expect(html).not.toContain('3.65')

    const deferred = await build([{ name: 'Flat white', choice: 'defer', value: 0, decidedAt: '' }])
    expect(deferred.status).toBe(201)
    const deferredToken = ((await deferred.json()) as { token: string }).token
    const deferredHtml = await (
      await app.request(`${ORIGIN}/p/${deferredToken}/app`, {}, env as never)
    ).text()
    expect(deferredHtml).not.toContain('3.40')
    expect(deferredHtml).not.toContain('3.65')
  })

  test('untrusted decisions from the browser are clamped or dropped', () => {
    const cleaned = sanitizeImported({
      ...site,
      priceDecisions: [
        { name: 'Flat white', choice: 'page', value: 340 },
        { name: 'Filter', choice: 'steal', value: 1 },
        { name: 'Filter', choice: 'custom', value: -9 },
        { name: '', choice: 'page', value: 100 },
      ],
    })
    expect(cleaned?.priceDecisions).toEqual([
      { name: 'Flat white', choice: 'page', value: 340, decidedAt: '' },
      { name: 'Filter', choice: 'custom', value: 0, decidedAt: '' },
    ])
  })
})
