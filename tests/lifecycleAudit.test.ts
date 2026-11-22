import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { createProject, getProject, type Project } from '../src/worker/db'
import { ownerAccessKey } from '../src/worker/ownerAuth'
import type { MenuSection } from '../src/worker/types'
import { MemoryD1 } from './memoryD1'

/**
 * Route-level lifecycle coverage.
 *
 * These tests intentionally do not insert owner_sessions rows: every owner
 * session here comes from the real login form and the real HMAC owner key. The
 * only test-only seam is a global fetch fixture for the crawl, so /import/check
 * and /import/apply run against deterministic saved-evidence-shaped HTML rather
 * than a live site.
 */

const SECRET = 'lifecycle-owner-secret'
const ORIGIN = 'https://plattr.example'
const originalFetch = globalThis.fetch
let ip = 40

beforeAll(() => {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const price =
      url.hostname === 'empty.example' || url.pathname.includes('/empty') || url.searchParams.get('none') === '1'
        ? null
        : Number(url.searchParams.get('price') ?? '12')
    return new Response(fixtureHtml(price), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }) as typeof fetch
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

function fixtureHtml(price: number | null): string {
  const item =
    price === null
      ? ''
      : `{"@type":"MenuItem","name":"Cacio e Pepe","description":"Pecorino and black pepper","offers":{"@type":"Offer","price":"${(price / 100).toFixed(2)}","priceCurrency":"GBP"}}`
  return `<!doctype html><html><head><title>Lifecycle Kitchen</title>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Restaurant","name":"Lifecycle Kitchen","hasMenu":{"@type":"Menu","name":"Menu","hasMenuSection":[{"@type":"MenuSection","name":"Pasta","hasMenuItem":[${item}]}]}}</script>
    </head><body><h1>Lifecycle Kitchen</h1></body></html>`
}

function baseMenu(price = 1200): MenuSection[] {
  return [
    {
      name: 'Pasta',
      items: [
        {
          name: 'Cacio e Pepe',
          desc: 'Pecorino and black pepper',
          price,
          sourceUrl: 'https://fixture.example/menu',
          sourceMethod: 'structured-data',
          priceEvidence: {
            method: 'json-ld',
            source: 'https://fixture.example/menu',
            raw: (price / 100).toFixed(2),
            currency: 'GBP',
            validated: true,
          },
        },
      ],
    },
  ]
}

async function setup(options: { price?: number; projects?: unknown; vertical?: 'restaurant' | 'professional' } = {}) {
  const db = new MemoryD1() as unknown as D1Database
  const vertical = options.vertical ?? 'restaurant'
  const project = await createProject(db, {
    name: vertical === 'professional' ? 'Lifecycle Practice' : 'Lifecycle Kitchen',
    contact: 'Owner',
    email: 'owner@example.com',
    vertical,
    accent: '#8b3a2b',
    logo: 'LK',
    features: vertical === 'professional' ? ['catalog', 'quote'] : ['catalog', 'booking'],
    platforms: ['pwa'],
    plan: 'onetime',
    site: { website: 'https://fixture.example/', menu: baseMenu(options.price) },
    projects: options.projects,
  })
  const env = { DB: db, ASSETS: {} as Fetcher, OWNER_SECRET: SECRET }
  return { db, project, env }
}

function key(project: Project): Promise<string> {
  return ownerAccessKey(project.token, SECRET)
}

async function login(project: Project, env: unknown, options: { wrong?: boolean } = {}) {
  ip += 1
  const response = await app.request(
    `${ORIGIN}/p/${project.token}/dashboard/login`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'cf-connecting-ip': `203.0.113.${ip}`,
      },
      body: new URLSearchParams({ key: options.wrong ? 'not-the-key' : await key(project) }).toString(),
    },
    env as never,
  )
  return { response, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' }
}

function request(path: string, env: unknown, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers)
  if (init.cookie) headers.set('cookie', init.cookie)
  return app.request(`${ORIGIN}${path}`, { ...init, headers }, env as never)
}

async function json(response: Response) {
  return (await response.json()) as Record<string, any>
}

async function check(project: Project, env: unknown, cookie: string, url: string) {
  const response = await request(
    `/api/projects/${project.token}/import/check`,
    env,
    {
      method: 'POST',
      cookie,
      headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': `198.51.100.${++ip}` },
      body: JSON.stringify({ url }),
    },
  )
  return { response, body: await json(response) }
}

async function apply(
  project: Project,
  env: unknown,
  cookie: string,
  url: string,
  approval: Record<string, unknown>,
  version?: number,
  updatedAt?: string,
) {
  const copy = version === undefined || updatedAt === undefined ? await current(project, env) : null
  const response = await request(`/api/projects/${project.token}/import/apply`, env, {
    method: 'POST',
    cookie,
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': `198.51.100.${++ip}` },
    body: JSON.stringify({ url, approval, version: version ?? copy!.version, updatedAt: updatedAt ?? copy!.updatedAt }),
  })
  return { response, body: await json(response) }
}

function uniqueUrl(label: string, price?: number | null): string {
  const query = new URLSearchParams({ case: `${label}-${Date.now()}-${Math.random()}` })
  if (price !== undefined && price !== null) query.set('price', String(price))
  return `https://${price === null ? 'empty.example/entry' : 'fixture.example/menu'}?${query.toString()}`
}

async function current(project: Project, env: unknown): Promise<Project> {
  return (await getProject((env as { DB: D1Database }).DB, project.token))!
}

function cloneMenu(project: Project): MenuSection[] {
  return structuredClone(project.spec.menu)
}

describe('real owner authentication lifecycle', () => {
  test('login, correction, logout, fresh login and provenance survive', async () => {
    const { project, env } = await setup()
    const loginPage = await request(`/p/${project.token}/dashboard/login`, env)
    expect(loginPage.status).toBe(200)
    expect(await loginPage.text()).toContain('name="key"')

    const bad = await login(project, env, { wrong: true })
    expect(bad.response.status).toBe(401)
    expect(bad.cookie).toBe('')

    const first = await login(project, env)
    expect(first.response.status).toBe(303)
    expect(first.cookie).toMatch(/^plattr_owner_/)

    const dashboard = await request(`/p/${project.token}/dashboard`, env, { cookie: first.cookie })
    expect(dashboard.status).toBe(200)
    expect(await dashboard.text()).toContain('let VERSION')

    const before = await current(project, env)
    const menu = cloneMenu(before)
    menu[0].items[0].price = 1500
    const saved = await request(`/api/projects/${project.token}`, env, {
      method: 'PATCH',
      cookie: first.cookie,
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ spec: { menu }, version: before.version }),
    })
    expect(saved.status).toBe(200)
    let after = await current(project, env)
    expect(after.spec.menu[0].items[0].price).toBe(1500)
    expect(after.spec.menu[0].items[0].ownerFields).toContain('price')
    expect(after.spec.menu[0].items[0].fieldProvenance?.price).toMatchObject({
      source: 'owner',
      validated: true,
    })
    expect(after.spec.menu[0].items[0].sourceTrail?.original?.price).toBe('12.00')

    const logout = await request(`/p/${project.token}/dashboard/logout`, env, {
      method: 'POST',
      cookie: first.cookie,
      headers: { origin: ORIGIN },
    })
    expect(logout.status).toBe(303)
    expect(
      (await request(`/p/${project.token}/dashboard`, env, { cookie: first.cookie })).status,
    ).toBe(303)
    expect(
      (await request(`/api/projects/${project.token}/dashboard`, env, { cookie: first.cookie })).status,
    ).toBe(401)

    const second = await login(project, env)
    expect(second.response.status).toBe(303)
    const reopened = await request(`/p/${project.token}/dashboard`, env, { cookie: second.cookie })
    expect(reopened.status).toBe(200)
    const review = await request(`/p/${project.token}/review`, env, { cookie: second.cookie })
    expect(review.status).toBe(200)
    const reviewHtml = await review.text()
    expect(reviewHtml).toContain('price: yours')
    expect(reviewHtml).toContain('you corrected this on')

    after = await current(project, env)
    expect(after.spec.menu[0].items[0].price).toBe(1500)
    expect(after.spec.menu[0].items[0].ownerFields).toContain('price')
    expect(after.spec.menu[0].items[0].sourceTrail?.original?.price).toBe('12.00')
    expect(after.spec.menu[0].items[0].priceEvidence?.method).toBe('owner')
  })

  test('an expired session and a revoked-everywhere session are refused', async () => {
    const { db, project, env } = await setup()
    const first = await login(project, env)
    expect(first.response.status).toBe(303)
    const sessionId = first.cookie.replace('plattr_owner_' + project.token.slice(0, 12) + '=', '')
    const past = new Date(Date.now() - 60_000).toISOString()
    await db.prepare('UPDATE owner_sessions SET expires_at = ? WHERE id = ?').bind(past, sessionId).run()
    expect(
      (await request(`/p/${project.token}/dashboard`, env, { cookie: first.cookie })).status,
    ).toBe(303)
    expect(
      (await request(`/api/projects/${project.token}/dashboard`, env, { cookie: first.cookie })).status,
    ).toBe(401)

    const second = await login(project, env)
    const third = await login(project, env)
    expect(second.response.status).toBe(303)
    expect(third.response.status).toBe(303)
    const revoked = await request(`/p/${project.token}/dashboard/logout-all`, env, {
      method: 'POST',
      cookie: second.cookie,
      headers: { origin: ORIGIN },
    })
    expect(revoked.status).toBe(303)
    expect(
      (await request(`/api/projects/${project.token}/dashboard`, env, { cookie: second.cookie })).status,
    ).toBe(401)
    expect(
      (await request(`/api/projects/${project.token}/dashboard`, env, { cookie: third.cookie })).status,
    ).toBe(401)
  })

  test('a session and a key from one owner cannot open another owner project', async () => {
    const one = await setup()
    const two = await setup()
    const session = await login(one.project, one.env)
    const otherSession = await login(two.project, two.env)
    expect(session.response.status).toBe(303)
    expect(otherSession.response.status).toBe(303)

    expect(
      (await request(`/api/projects/${two.project.token}/dashboard`, two.env, { cookie: session.cookie })).status,
    ).toBe(401)
    expect(
      (await request(`/api/projects/${one.project.token}/dashboard`, one.env, { cookie: otherSession.cookie })).status,
    ).toBe(401)

    // The other owner's key is not accepted on this project at all.
    ip += 1
    const crossKey = await app.request(
      `${ORIGIN}/p/${one.project.token}/dashboard/login`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': `203.0.113.${ip}` },
        body: new URLSearchParams({ key: await key(two.project) }).toString(),
      },
      one.env as never,
    )
    expect(crossKey.status).toBe(401)
  })
})

describe('real /import/check and /import/apply lifecycle', () => {
  test('a conflict is shown, kept as the owner value, then explicitly source-resolved', async () => {
    const { project, env } = await setup()
    const session = await login(project, env)
    const before = await current(project, env)
    const menu = cloneMenu(before)
    menu[0].items[0].price = 1500
    const saved = await request(`/api/projects/${project.token}`, env, {
      method: 'PATCH',
      cookie: session.cookie,
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ spec: { menu }, version: before.version }),
    })
    expect(saved.status).toBe(200)

    const url = uniqueUrl('conflict', 1700)
    const firstCheck = await check(project, env, session.cookie, url)
    expect(firstCheck.response.status).toBe(200)
    expect(firstCheck.body.plan).toMatchObject({ requiresApproval: true })
    expect(firstCheck.body.plan.conflicts).toHaveLength(1)
    expect(firstCheck.body.plan.conflicts[0]).toMatchObject({
      name: 'Cacio e Pepe',
      field: 'price',
      original: '12.00',
      owner: '15.00',
      latest: '17.00',
      originalKnown: true,
    })
    expect(typeof firstCheck.body.version).toBe('number')
    expect(typeof firstCheck.body.updatedAt).toBe('string')

    const kept = await apply(
      project,
      env,
      session.cookie,
      url,
      { resolutions: [{ name: 'Cacio e Pepe', field: 'price', choice: 'owner' }] },
      firstCheck.body.version,
      firstCheck.body.updatedAt,
    )
    expect(kept.response.status).toBe(200)
    let after = await current(project, env)
    expect(after.spec.menu[0].items[0].price).toBe(1500)
    expect(after.spec.menu[0].items[0].sourceTrail?.latest?.price).toBe('17.00')
    expect(after.spec.menu[0].items[0].sourceTrail?.decisions?.at(-1)).toMatchObject({
      field: 'price',
      choice: 'owner',
      ownerValue: '15.00',
      sourceValue: '17.00',
    })

    // The same reading is not asked again after the owner answered it.
    const again = await check(project, env, session.cookie, url)
    expect(again.body.plan.conflicts).toHaveLength(0)
    expect(again.body.plan.unchanged).toBe(1)

    const tookSource = await apply(
      project,
      env,
      session.cookie,
      url,
      { resolutions: [{ name: 'Cacio e Pepe', field: 'price', choice: 'source' }] },
      again.body.version,
      again.body.updatedAt,
    )
    expect(tookSource.response.status).toBe(200)
    after = await current(project, env)
    expect(after.spec.menu[0].items[0].price).toBe(1700)
    expect(after.spec.menu[0].items[0].ownerFields ?? []).not.toContain('price')
    expect(after.spec.menu[0].items[0].fieldProvenance?.price).toMatchObject({
      source: 'website',
      validated: true,
    })
    expect(after.spec.menu[0].items[0].sourceTrail?.decisions?.at(-1)?.choice).toBe('source')
  })

  test('no change, an ordinary new value, removal, restoration and duplicate adds', async () => {
    const { project, env } = await setup()
    const session = await login(project, env)

    const unchangedUrl = uniqueUrl('unchanged', 1200)
    const unchanged = await check(project, env, session.cookie, unchangedUrl)
    expect(unchanged.body.plan).toMatchObject({ added: [], removed: [], changed: [], conflicts: [], unchanged: 1 })

    const changedUrl = uniqueUrl('ordinary-change', 1300)
    const changed = await check(project, env, session.cookie, changedUrl)
    expect(changed.body.plan.changed).toHaveLength(1)
    expect(changed.body.plan.changed[0].changes[0]).toMatchObject({ field: 'price', to: '1300' })
    const notApproved = await apply(
      project,
      env,
      session.cookie,
      changedUrl,
      { changed: [] },
      changed.body.version,
      changed.body.updatedAt,
    )
    expect(notApproved.response.status).toBe(200)
    expect((await current(project, env)).spec.menu[0].items[0].price).toBe(1200)

    const approved = await apply(
      project,
      env,
      session.cookie,
      changedUrl,
      { changed: ['Cacio e Pepe|price'] },
      (await current(project, env)).version,
      (await current(project, env)).updatedAt,
    )
    expect(approved.response.status).toBe(200)
    expect((await current(project, env)).spec.menu[0].items[0].price).toBe(1300)

    const goneUrl = uniqueUrl('gone', null)
    const gone = await check(project, env, session.cookie, goneUrl)
    expect(gone.body.plan.removed).toHaveLength(1)
    const keptRow = await apply(
      project,
      env,
      session.cookie,
      goneUrl,
      { removed: [] },
      gone.body.version,
      gone.body.updatedAt,
    )
    expect(keptRow.response.status).toBe(200)
    expect((await current(project, env)).spec.menu).toHaveLength(1)

    const removed = await apply(
      project,
      env,
      session.cookie,
      goneUrl,
      { removed: ['Cacio e Pepe'] },
      (await current(project, env)).version,
      (await current(project, env)).updatedAt,
    )
    expect(removed.response.status).toBe(200)
    expect((await current(project, env)).spec.menu).toHaveLength(0)

    const restoreUrl = uniqueUrl('restore', 1300)
    const restored = await check(project, env, session.cookie, restoreUrl)
    expect(restored.body.plan.added).toHaveLength(1)
    const firstAdd = await apply(
      project,
      env,
      session.cookie,
      restoreUrl,
      { added: true },
      restored.body.version,
      restored.body.updatedAt,
    )
    expect(firstAdd.response.status).toBe(200)
    expect((await current(project, env)).spec.menu[0].items).toHaveLength(1)

    // A repeated apply is idempotent: the row is matched, not duplicated.
    const duplicateUrl = uniqueUrl('duplicate', 1300)
    const duplicate = await apply(
      project,
      env,
      session.cookie,
      duplicateUrl,
      { added: true },
      (await current(project, env)).version,
      (await current(project, env)).updatedAt,
    )
    expect(duplicate.response.status).toBe(200)
    expect((await current(project, env)).spec.menu[0].items).toHaveLength(1)

    // The same sequence read through a new real login: one row, the approved
    // price, nothing resurrected by the earlier deletion.
    const fresh = await login(project, env)
    const finalPage = await request(`/p/${project.token}/dashboard`, env, { cookie: fresh.cookie })
    expect(finalPage.status).toBe(200)
    expect(await finalPage.text()).toContain('Cacio e Pepe')
    const final = await current(project, env)
    expect(final.spec.menu[0].items).toHaveLength(1)
    expect(final.spec.menu[0].items[0].price).toBe(1300)
  })

  test('a second owner correction keeps the first source reading', async () => {
    const { project, env } = await setup()
    const session = await login(project, env)
    const first = await current(project, env)
    const one = cloneMenu(first)
    one[0].items[0].price = 1400
    expect(
      (
        await request(`/api/projects/${project.token}`, env, {
          method: 'PATCH',
          cookie: session.cookie,
          headers: { 'content-type': 'application/json', origin: ORIGIN },
          body: JSON.stringify({ spec: { menu: one }, version: first.version }),
        })
      ).status,
    ).toBe(200)
    const second = await current(project, env)
    const two = cloneMenu(second)
    two[0].items[0].price = 1600
    expect(
      (
        await request(`/api/projects/${project.token}`, env, {
          method: 'PATCH',
          cookie: session.cookie,
          headers: { 'content-type': 'application/json', origin: ORIGIN },
          body: JSON.stringify({ spec: { menu: two }, version: second.version }),
        })
      ).status,
    ).toBe(200)
    const after = await current(project, env)
    expect(after.spec.menu[0].items[0].price).toBe(1600)
    expect(after.spec.menu[0].items[0].sourceTrail?.original?.price).toBe('12.00')
    expect(typeof after.spec.menu[0].items[0].sourceTrail?.ownerAt).toBe('string')
    expect(after.spec.menu[0].items[0].fieldProvenance?.price?.source).toBe('owner')
  })
})

describe('concurrency and bulk safeguards', () => {
  test('a stale owner save is refused and the newer value survives', async () => {
    const { project, env } = await setup()
    const one = await login(project, env)
    const two = await login(project, env)
    const before = await current(project, env)
    const menuOne = cloneMenu(before)
    menuOne[0].items[0].price = 1400
    const first = await request(`/api/projects/${project.token}`, env, {
      method: 'PATCH',
      cookie: one.cookie,
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ spec: { menu: menuOne }, version: before.version }),
    })
    expect(first.status).toBe(200)

    const menuTwo = cloneMenu(before)
    menuTwo[0].items[0].price = 1550
    const stale = await request(`/api/projects/${project.token}`, env, {
      method: 'PATCH',
      cookie: two.cookie,
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ spec: { menu: menuTwo }, version: before.version }),
    })
    expect(stale.status).toBe(409)
    expect((await json(stale)).error.code).toBe('version_conflict')
    expect((await current(project, env)).spec.menu[0].items[0].price).toBe(1400)

    const currentCopy = await current(project, env)
    const retried = await request(`/api/projects/${project.token}`, env, {
      method: 'PATCH',
      cookie: two.cookie,
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ spec: { menu: menuTwo }, version: currentCopy.version }),
    })
    expect(retried.status).toBe(200)
    expect((await current(project, env)).spec.menu[0].items[0].price).toBe(1550)
  })

  test('catalogue saves and import applies use the copy the owner inspected', async () => {
    const { project, env } = await setup()
    const one = await login(project, env)
    const two = await login(project, env)
    const before = await current(project, env)
    const menu = cloneMenu(before)
    menu[0].items[0].desc = 'Owner description'
    const catalog = await request(`/api/projects/${project.token}/dashboard/catalog`, env, {
      method: 'PUT',
      cookie: one.cookie,
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ menu, offers: [], version: before.version, updatedAt: before.updatedAt }),
    })
    expect(catalog.status).toBe(200)

    const staleMenu = cloneMenu(before)
    staleMenu[0].items[0].desc = 'Stale description'
    const staleCatalog = await request(`/api/projects/${project.token}/dashboard/catalog`, env, {
      method: 'PUT',
      cookie: two.cookie,
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ menu: staleMenu, offers: [], version: before.version, updatedAt: before.updatedAt }),
    })
    expect(staleCatalog.status).toBe(409)
    expect((await current(project, env)).spec.menu[0].items[0].desc).toBe('Owner description')

    const url = uniqueUrl('stale-import', 1800)
    const plan = await check(project, env, one.cookie, url)
    expect(plan.response.status).toBe(200)
    const newer = await current(project, env)
    const corrected = cloneMenu(newer)
    corrected[0].items[0].price = 1450
    expect(
      (
        await request(`/api/projects/${project.token}`, env, {
          method: 'PATCH',
          cookie: two.cookie,
          headers: { 'content-type': 'application/json', origin: ORIGIN },
          body: JSON.stringify({ spec: { menu: corrected }, version: newer.version }),
        })
      ).status,
    ).toBe(200)

    const staleApply = await apply(
      project,
      env,
      one.cookie,
      url,
      { changed: ['Cacio e Pepe|price'] },
      plan.body.version,
      plan.body.updatedAt,
    )
    expect(staleApply.response.status).toBe(409)
    expect((await current(project, env)).spec.menu[0].items[0].price).toBe(1450)
  })

  test('bulk portfolio publishing needs confirmation and cannot leak suggestions', async () => {
    const { project, env } = await setup({
      vertical: 'professional',
      projects: [{ title: 'Suggested Mews', source: 'website' }],
    })
    const session = await login(project, env)
    const before = await current(project, env)
    expect(before.spec.projects?.[0]?.accepted).toBe(false)
    const publicBefore = await request(`/p/${project.token}/app`, env)
    expect(await publicBefore.text()).not.toContain('Suggested Mews')
    const review = await request(`/p/${project.token}/review`, env, { cookie: session.cookie })
    const reviewHtml = await review.text()
    expect(review.status).toBe(200)
    expect(reviewHtml).toContain('Suggested Mews')
    expect(reviewHtml).toContain('name="confirm"')

    const noConfirm = await request(`/p/${project.token}/review/portfolio`, env, {
      method: 'POST',
      cookie: session.cookie,
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN },
      body: new URLSearchParams({ action: 'acceptAll' }).toString(),
    })
    expect(noConfirm.status).toBe(422)
    expect((await current(project, env)).spec.projects?.[0]?.accepted).toBe(false)

    const confirmed = await request(`/p/${project.token}/review/portfolio`, env, {
      method: 'POST',
      cookie: session.cookie,
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN },
      body: new URLSearchParams({ action: 'acceptAll', confirm: 'yes' }).toString(),
    })
    expect(confirmed.status).toBe(303)
    expect((await current(project, env)).spec.projects?.[0]?.accepted).toBe(true)
    const publicAfter = await request(`/p/${project.token}/app`, env)
    expect(await publicAfter.text()).toContain('Suggested Mews')
  })
})
