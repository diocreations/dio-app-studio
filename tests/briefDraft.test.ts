import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { renderApp } from '../src/worker/app'
import { buildSpec } from '../src/worker/pricing'
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

  test('a draft older than 30 days is pruned on the next save', async () => {
    const env = newEnv()
    const staleCookie = draftCookie(await save(env, '', DRAFT))
    await (env.DB as unknown as { prepare: (sql: string) => { bind: (...values: unknown[]) => { run: () => Promise<unknown> } } })
      .prepare('UPDATE brief_drafts SET updated_at = ?')
      .bind(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString())
      .run()

    const fresh = await save(env, '', { ...DRAFT, step: 1 })
    expect(fresh.status).toBe(200)

    const stale = (await (await load(env, staleCookie)).json()) as { draft: unknown; unavailable?: boolean }
    expect(stale.draft).toBeNull()
    expect(stale.unavailable).toBe(true)
    // The new draft written alongside the prune is untouched.
    const kept = (await (await load(env, draftCookie(fresh))).json()) as { draft: { data: { step: number } } }
    expect(kept.draft.data.step).toBe(1)
  })

  test('a cookie whose row is gone says so instead of looking new', async () => {
    const env = newEnv()
    const cookie = draftCookie(await save(env, '', DRAFT))
    await app.request(
      `${ORIGIN}/api/brief/draft`,
      { method: 'DELETE', headers: { origin: ORIGIN, cookie } },
      env as never,
    )
    const after = (await (await load(env, cookie)).json()) as { draft: unknown; unavailable?: boolean }
    expect(after.draft).toBeNull()
    expect(after.unavailable).toBe(true)

    // A malformed id is never treated as a lookup at all.
    const forged = (await (await load(env, 'plattr_draft=drf_short')).json()) as { draft: unknown }
    expect(forged.draft).toBeNull()
  })

  test('an expired cookie leaves the row alone until it is pruned', async () => {
    const env = newEnv()
    const cookie = draftCookie(await save(env, '', DRAFT))
    // The browser dropped the cookie: the request carries none, and the page
    // starts empty. The orphan row is not readable by anyone else.
    const anonymous = (await (await load(env)).json()) as { draft: unknown; unavailable?: boolean }
    expect(anonymous.draft).toBeNull()
    expect(anonymous.unavailable).toBeUndefined()
    const stillThere = (await (await load(env, cookie)).json()) as { draft: { data: { step: number } } }
    expect(stillThere.draft.data.step).toBe(2)
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

describe('draft lifecycle and public data', () => {
  const SOURCES = {
    pageSource: 'https://fernandflint.example/menu',
    feedSource: 'https://fernandflint.example/products.json',
  }
  const DECISION = {
    name: 'Flat white',
    choice: 'page' as const,
    value: 340,
    decidedAt: '2026-11-20T10:00:00.000Z',
    page: 340,
    feed: 365,
    ...SOURCES,
  }
  const SITE = {
    name: 'Fern & Flint',
    currency: 'GBP',
    website: 'https://fernandflint.example',
    menu: [
      {
        name: 'Coffee',
        items: [
          { name: 'Flat white', desc: 'Double shot', price: 340 },
          { name: 'Filter', desc: 'Batch brew', price: 300 },
        ],
      },
    ],
    priceConflicts: [{ name: 'Flat white', page: 340, feed: 365, ...SOURCES }],
    priceDecisions: [DECISION],
  }

  function build(env: ReturnType<typeof newEnv>, cookie = '') {
    return app.request(
      `${ORIGIN}/api/projects`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: ORIGIN,
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({
          name: 'Fern & Flint',
          vertical: 'restaurant',
          accent: '#c8452b',
          logo: 'FF',
          features: ['catalog'],
          site: SITE,
        }),
      },
      env as never,
    )
  }

  test('a finished build consumes its draft and keeps the project', async () => {
    const env = newEnv()
    const cookie = draftCookie(await save(env, '', DRAFT))
    const built = await build(env, cookie)
    expect(built.status).toBe(201)
    const { token } = (await built.json()) as { token: string }
    expect(built.headers.get('set-cookie') ?? '').toContain('plattr_draft=;')

    // The old draft cannot be restored into a second build.
    const oldDraft = (await (await load(env, cookie)).json()) as { draft: unknown; unavailable?: boolean }
    expect(oldDraft.draft).toBeNull()
    expect(oldDraft.unavailable).toBe(true)

    const page = await app.request(`${ORIGIN}/p/${token}/app`, {}, env as never)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('3.40')
  })

  test('a public app exposes the approved price and nothing internal', async () => {
    const env = newEnv()
    const built = await build(env)
    const { token } = (await built.json()) as { token: string }
    const html = await (await app.request(`${ORIGIN}/p/${token}/app`, {}, env as never)).text()

    expect(html).toContain('3.40')
    expect(html).not.toContain('3.65')
    for (const secret of ['products.json', 'priceConflicts', 'priceDecisions', 'priceEvidence', 'owner decision', 'feedSource', 'pageSource'])
      expect(html).not.toContain(secret)
  })

  test('the review record is kept on the build but never rendered', () => {
    const spec = buildSpec({
      name: 'Fern & Flint',
      vertical: 'restaurant',
      accent: '#c8452b',
      logo: 'FF',
      features: ['catalog'],
      site: SITE,
    })
    expect(spec.review?.conflicts[0].feedSource).toContain('products.json')
    expect(spec.review?.decisions[0].decidedAt).toBe('2026-11-20T10:00:00.000Z')

    const html = renderApp(spec, { token: 't', version: 1 })
    for (const secret of ['products.json', DECISION.decidedAt, 'feedSource', 'priceDecisions'])
      expect(html).not.toContain(secret)
  })

  test('owner-only APIs refuse a build with no owner session', async () => {
    const env = newEnv()
    const built = await build(env)
    const { token } = (await built.json()) as { token: string }
    const read = await app.request(`${ORIGIN}/api/projects/${token}/doc`, {}, env as never)
    expect(read.status).toBe(401)
    const write = await app.request(
      `${ORIGIN}/api/projects/${token}/doc`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ doc: {} }),
      },
      env as never,
    )
    expect(write.status).toBe(401)
  })

  test('a draft id cannot address another visitor draft', async () => {
    const env = newEnv()
    const mine = draftCookie(await save(env, '', DRAFT))
    const theirs = draftCookie(await save(env, '', { ...DRAFT, step: 3, fields: { ...DRAFT.fields, name: 'Other' } }))
    expect(mine).not.toBe(theirs)
    const withMine = (await (await load(env, mine)).json()) as { draft: { data: { fields: { name: string } } } }
    expect(withMine.draft.data.fields.name).toBe('Fern & Flint')
    // A body-supplied id is ignored: the server only trusts the cookie.
    const attempted = await app.request(
      `${ORIGIN}/api/brief/draft`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: mine },
        body: JSON.stringify({ id: theirs.replace('plattr_draft=', ''), data: { fields: { name: 'Hijack' } } }),
      },
      env as never,
    )
    expect(attempted.status).toBe(200)
    const other = (await (await load(env, theirs)).json()) as { draft: { data: { fields: { name: string } } } }
    expect(other.draft.data.fields.name).toBe('Other')
  })
})
