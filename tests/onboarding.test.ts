import { describe, expect, test } from 'bun:test'
import { approveProject, createProject, ensureSchema } from '../src/worker/db'
import app from '../src/worker/index'
import { STUDIO_COOKIE, studioSession } from '../src/worker/studioAuth'
import { MemoryD1 } from './memoryD1'
import { ownerCookieFor } from './ownerCookie'

async function reviewBuild() {
  const db = new MemoryD1() as unknown as D1Database
  const project = await createProject(db, {
    name: 'Pilot Bakery',
    contact: '',
    email: '',
    vertical: 'cafe',
    accent: '#a8642c',
    logo: 'PB',
    features: ['catalog'],
    platforms: ['pwa'],
    plan: 'onetime',
    site: {
      website: 'https://pilot-bakery.example',
      category: 'Bakery',
      menu: [{ name: 'Bread', items: [{ name: 'Sourdough', desc: '', price: 600 }] }],
    },
    sourceReview: {
      source: 'https://pilot-bakery.example',
      host: 'pilot-bakery.example',
      status: 'partial',
      pages: { read: ['/'], failed: [], usedSitemap: false },
      found: ['1 product in 1 section, read from 1 page'],
      missing: ['phone number', 'opening hours'],
      rejected: [],
      questions: [
        {
          field: 'Contact details',
          why: 'No phone or email was published. Add the details customers should use.',
          kind: 'confirm',
        },
      ],
      conflicts: [],
    },
  })
  return { db, project, cookie: await ownerCookieFor(db, project) }
}

describe('the owner review onboarding', () => {
  test('the workspace starts with a plain-language checklist and direct links', async () => {
    const { db, project, cookie } = await reviewBuild()
    const response = await app.request(
      `https://plattr.example/p/${project.token}`,
      { headers: { cookie } },
      { DB: db, ASSETS: {} as Fetcher },
    )
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('Before you approve')
    expect(html).toContain('What we found')
    expect(html).toContain('Review what we read')
    expect(html).toContain(`/p/${project.token}/edit?panel=catalog`)
    expect(html).toContain('Business name')
    expect(html).not.toContain('Restaurant name')
    expect(html).toContain('id="edit-email"')
    expect(html).toContain('id="edit-hours"')
  })

  test('the review page distinguishes found, missing and unconfirmed information', async () => {
    const { db, project, cookie } = await reviewBuild()
    const response = await app.request(
      `https://plattr.example/p/${project.token}/review`,
      { headers: { cookie } },
      { DB: db, ASSETS: {} as Fetcher },
    )
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('What we found')
    expect(html).toContain('1 product in 1 section, read from 1 page')
    expect(html).toContain('What is missing or unconfirmed')
    expect(html).toContain('Phone number')
    expect(html).toContain('Contact details')
    expect(html).toContain('Not provided')
    expect(html).toContain('#edit-phone')
    expect(html).toContain('/edit?panel=catalog')
    expect(html).toContain('id="missing"')
    expect(html).toContain('Start here, in this order')
  })

  test('the catalogue link opens the editor with its catalogue panel requested', async () => {
    const { db, project, cookie } = await reviewBuild()
    const response = await app.request(
      `https://plattr.example/p/${project.token}/edit`,
      { headers: { cookie } },
      { DB: db, ASSETS: {} as Fetcher },
    )
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain("new URLSearchParams(location.search).get('panel') === 'catalog'")
    expect(html).toContain('openCatalog()')
  })

  test('a customer link still cannot read the owner review', async () => {
    const { db, project } = await reviewBuild()
    const response = await app.request(
      `https://plattr.example/p/${project.token}/review`,
      {},
      { DB: db, ASSETS: {} as Fetcher },
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`/p/${project.token}/dashboard/login`)
  })

  test('the customer app stays private until an approved build is published', async () => {
    const { db, project, cookie } = await reviewBuild()
    await db.prepare("UPDATE projects SET published_at = '' WHERE id = ?").bind(project.id).run()
    const env = { DB: db, ASSETS: {} as Fetcher }
    const appUrl = `https://plattr.example/p/${project.token}/app`
    expect((await app.request(appUrl, {}, env)).status).toBe(404)
    await approveProject(db, project)
    expect((await app.request(appUrl, {}, env)).status).toBe(404)
    expect((await app.request(appUrl, { headers: { cookie } }, env)).status).toBe(200)

    const publish = await app.request(
      `https://plattr.example/api/projects/${project.token}/publish`,
      { method: 'POST', headers: { cookie } },
      env,
    )
    expect(publish.status).toBe(200)
    expect((await app.request(appUrl, {}, env)).status).toBe(200)

    const unpublish = await app.request(
      `https://plattr.example/api/projects/${project.token}/unpublish`,
      { method: 'POST', headers: { cookie } },
      env,
    )
    expect(unpublish.status).toBe(200)
    expect((await app.request(appUrl, {}, env)).status).toBe(404)
  })

  test('the public launch does not create hotel apps', async () => {
    const db = new MemoryD1() as unknown as D1Database
    await ensureSchema(db)
    const response = await app.request(
      'https://plattr.example/api/projects',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Seaside Hotel', vertical: 'hotel' }),
      },
      { DB: db, ASSETS: {} as Fetcher },
    )
    expect(response.status).toBe(422)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('trade_unavailable')
    const row = await db.prepare('SELECT COUNT(*) AS n FROM projects').first<{ n: number }>()
    expect(Number(row?.n ?? 0)).toBe(0)
  })

  test('operator deletion removes stored media before the project rows', async () => {
    const { db, project } = await reviewBuild()
    const now = new Date().toISOString()
    await db
      .prepare(
        'INSERT INTO media (id, project_id, hash, width, height, bytes, alt, created_at, variants) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        'med_test',
        project.id,
        'a'.repeat(64),
        800,
        600,
        1200,
        'Test image',
        now,
        JSON.stringify([{ width: 320, height: 240, bytes: 1200, key: `projects/${project.id}/test-320.webp` }]),
      )
      .run()
    const deleted: string[] = []
    const response = await app.request(
      `https://plattr.example/studio/projects/${project.id}/delete`,
      { method: 'POST', headers: { cookie: `${STUDIO_COOKIE}=${await studioSession('pilot-studio-key')}` } },
      {
        DB: db,
        MEDIA: { delete: async (keys: string[]) => deleted.push(...keys) } as never,
        STUDIO_KEY: 'pilot-studio-key',
        ASSETS: {} as Fetcher,
      },
    )
    expect(response.status).toBe(303)
    expect(deleted).toHaveLength(1)
    expect(deleted[0]).toContain(`projects/${project.id}/media/`)
    expect(deleted[0]).toEndWith('/320.webp')
    const row = await db.prepare('SELECT COUNT(*) AS n FROM projects WHERE id = ?').bind(project.id).first<{ n: number }>()
    expect(row?.n).toBe(0)
  })
})
