import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { createProject } from '../src/worker/db'
import { MemoryD1 } from './memoryD1'
import { ownerCookieFor } from './ownerCookie'

/**
 * Deleting an unused upload is the one media operation that cannot be undone
 * from the app, so the route is held to the rule in src/worker/mediaCleanup.ts:
 * report first, re-read every reference, delete objects then the row, and log
 * each removal against a verified backup. These tests exercise the real HTTP
 * route, the real SQL and a real (in-memory) bucket.
 */

class MemoryR2 {
  objects = new Map<string, Uint8Array>()
  failDelete = new Set<string>()
  async put(key: string, value: ArrayBuffer) {
    this.objects.set(key, new Uint8Array(value.slice(0)))
    return {}
  }
  async get(key: string) {
    const value = this.objects.get(key)
    if (!value) return null
    return {
      body: value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
      httpEtag: '"' + key + '"',
    }
  }
  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      if (this.failDelete.has(key)) throw new Error('bucket unavailable')
      this.objects.delete(key)
    }
    return {}
  }
}

function webp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0)
  bytes.set([22, 0, 0, 0], 4)
  bytes.set([0x57, 0x45, 0x42, 0x50], 8)
  bytes.set([0x56, 0x50, 0x38, 0x58], 12)
  bytes.set([10, 0, 0, 0], 16)
  const w = width - 1
  const h = height - 1
  bytes.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24)
  bytes.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27)
  return bytes
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(40)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8)
  bytes.set([(width >> 24) & 0xff, (width >> 16) & 0xff, (width >> 8) & 0xff, width & 0xff], 16)
  bytes.set([(height >> 24) & 0xff, (height >> 16) & 0xff, (height >> 8) & 0xff, height & 0xff], 20)
  return bytes
}

const OLD = '2024-01-01T00:00:00.000Z'

async function makeProject(db: D1Database, name: string) {
  const project = await createProject(db, {
    name,
    contact: '',
    email: '',
    vertical: 'shop',
    accent: '#2a5a8f',
    logo: 'AB',
    features: ['catalog', 'offers'],
    platforms: ['pwa'],
    plan: 'onetime',
  })
  return { project, cookie: await ownerCookieFor(db, project) }
}

async function upload(token: string, env: unknown, cookie: string, seed = 1): Promise<string> {
  const form = new FormData()
  // A different pixel seed per upload keeps the content hashes distinct.
  const original = png(640 + seed, 480 + seed)
  form.append('file', new File([original], 'shop.png', { type: 'image/png' }))
  form.append('variant', new File([webp(320, 240)], 'size.webp', { type: 'image/webp' }))
  form.append('variant', new File([webp(640, 480)], 'size.webp', { type: 'image/webp' }))
  const response = await app.request(
    `https://plattr.example/api/projects/${token}/media`,
    { method: 'POST', headers: { origin: 'https://plattr.example', cookie }, body: form },
    env as never,
  )
  expect(response.status).toBe(201)
  return ((await response.json()) as { media: { id: string } }).media.id
}

async function age(db: D1Database, id: string, when = OLD) {
  await db.prepare('UPDATE media SET created_at = ? WHERE id = ?').bind(when, id).run()
}

function docWithMedia(mediaId: string) {
  return {
    v: 2,
    screens: [
      {
        id: 'scr_home',
        kind: 'home',
        name: 'Home',
        icon: 'home',
        nav: true,
        hidden: false,
        sections: [
          { id: 'sec_image', kind: 'image', title: 'Our shop', media: { id: mediaId } },
          { id: 'sec_text', kind: 'text', text: 'Open every day.' },
        ],
      },
    ],
  }
}

async function putDoc(token: string, cookie: string, env: unknown, doc: unknown) {
  return app.request(
    `https://plattr.example/api/projects/${token}/doc`,
    {
      method: 'PUT',
      headers: { origin: 'https://plattr.example', 'content-type': 'application/json', cookie },
      body: JSON.stringify({ doc }),
    },
    env as never,
  )
}

function cleanup(
  token: string,
  cookie: string,
  env: unknown,
  body: Record<string, unknown>,
) {
  return app.request(
    `https://plattr.example/api/projects/${token}/media/cleanup`,
    {
      method: 'POST',
      headers: { origin: 'https://plattr.example', 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    },
    env as never,
  )
}

async function setup() {
  const db = new MemoryD1() as unknown as D1Database
  const r2 = new MemoryR2()
  const env = { DB: db, ASSETS: {} as Fetcher, MEDIA: r2 as unknown as R2Bucket }
  const a = await makeProject(db, 'Project A')
  const b = await makeProject(db, 'Project B')
  return { db, r2, env, a, b }
}

describe('media cleanup', () => {
  test('a dry run lists the unused upload and changes nothing', async () => {
    const { db, r2, env, a } = await setup()
    const used = await upload(a.project.token, env, a.cookie, 1)
    const unused = await upload(a.project.token, env, a.cookie, 9)
    expect((await putDoc(a.project.token, a.cookie, env, docWithMedia(used))).status).toBe(200)
    await age(db, unused)

    const response = await cleanup(a.project.token, a.cookie, env, { dryRun: true })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      report: { candidates: { id: string; objects: { key: string }[] }[]; objects: number }
    }
    expect(body.report.candidates.map((entry) => entry.id)).toEqual([unused])
    expect(body.report.objects).toBe(2)
    // Nothing moved: the row and both objects are still there.
    expect(r2.objects.size).toBe(4)
    const row = await db.prepare('SELECT id FROM media WHERE id = ?').bind(unused).first()
    expect(row).not.toBeNull()
  })

  test('a current document, a saved version, the catalogue and an offer all protect an upload', async () => {
    const { db, r2, env, a } = await setup()
    const inDoc = await upload(a.project.token, env, a.cookie, 1)
    const inVersion = await upload(a.project.token, env, a.cookie, 2)
    const inCatalog = await upload(a.project.token, env, a.cookie, 3)
    const inOffer = await upload(a.project.token, env, a.cookie, 4)
    await putDoc(a.project.token, a.cookie, env, docWithMedia(inDoc))

    const now = new Date().toISOString()
    await db
      .prepare('INSERT INTO doc_versions (id, project_id, doc, created_at) VALUES (?, ?, ?, ?)')
      .bind('dvr_probe', a.project.id, JSON.stringify(docWithMedia(inVersion)), now)
      .run()

    const catalog = await app.request(
      `https://plattr.example/api/projects/${a.project.token}/catalog`,
      {
        method: 'PUT',
        headers: { origin: 'https://plattr.example', 'content-type': 'application/json', cookie: a.cookie },
        body: JSON.stringify({
          menu: [{ name: 'Pieces', items: [{ name: 'Lamp', price: 4500, media: { id: inCatalog } }] }],
        }),
      },
      env as never,
    )
    expect(catalog.status).toBe(200)

    const spec = await db
      .prepare('SELECT spec FROM projects WHERE id = ?')
      .bind(a.project.id)
      .first<{ spec: string }>()
    const parsed = JSON.parse(spec!.spec)
    parsed.offers = [{ title: 'Two for one', media: { id: inOffer } }]
    await db.prepare('UPDATE projects SET spec = ? WHERE id = ?').bind(JSON.stringify(parsed), a.project.id).run()

    for (const id of [inDoc, inVersion, inCatalog, inOffer]) await age(db, id)
    const body = (await (await cleanup(a.project.token, a.cookie, env, { dryRun: true })).json()) as {
      report: { candidates: unknown[] }
    }
    expect(body.report.candidates).toEqual([])
    expect(r2.objects.size).toBe(8)
  })

  test('a recent upload waits out the grace period and a 24h floor is enforced', async () => {
    const { env, a } = await setup()
    const fresh = await upload(a.project.token, env, a.cookie, 1)

    const body = (await (await cleanup(a.project.token, a.cookie, env, { dryRun: true })).json()) as {
      report: { graceHours: number; candidates: unknown[]; skipped: { id: string; reason: string }[] }
    }
    expect(body.report.graceHours).toBe(24)
    expect(body.report.candidates).toEqual([])
    expect(body.report.skipped.some((entry) => entry.id === fresh)).toBe(true)

    // A caller cannot shorten the window below a day.
    const short = (await (await cleanup(a.project.token, a.cookie, env, { dryRun: true, graceHours: 0 })).json()) as {
      report: { graceHours: number; candidates: unknown[] }
    }
    expect(short.report.graceHours).toBe(24)
    expect(short.report.candidates).toEqual([])
  })

  test('execution needs explicit confirmation and a verified backup id', async () => {
    const { db, r2, env, a } = await setup()
    const unused = await upload(a.project.token, env, a.cookie, 1)
    await age(db, unused)

    const noConfirm = await cleanup(a.project.token, a.cookie, env, { dryRun: false, backupId: 'sha256:probe' })
    expect(noConfirm.status).toBe(400)
    expect(((await noConfirm.json()) as { error: { code: string } }).error.code).toBe('confirmation_required')

    const noBackup = await cleanup(a.project.token, a.cookie, env, { dryRun: false, confirm: true })
    expect(noBackup.status).toBe(409)
    expect(((await noBackup.json()) as { error: { code: string } }).error.code).toBe('backup_required')

    expect(r2.objects.size).toBe(2)
    const row = await db.prepare('SELECT id FROM media WHERE id = ?').bind(unused).first()
    expect(row).not.toBeNull()
  })

  test('execution removes every stored variant, the row and an audit entry', async () => {
    const { db, r2, env, a } = await setup()
    const unused = await upload(a.project.token, env, a.cookie, 1)
    await age(db, unused)
    const keys = [...r2.objects.keys()]

    const response = await cleanup(a.project.token, a.cookie, env, {
      dryRun: false,
      confirm: true,
      backupId: 'sha256:0123456789abcdef',
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      deleted: { id: string; objects: string[] }[]
      failed: unknown[]
      skipped: unknown[]
    }
    expect(body.deleted.map((entry) => entry.id)).toEqual([unused])
    expect(body.deleted[0].objects.sort()).toEqual(keys.sort())
    expect(body.failed).toEqual([])
    expect(r2.objects.size).toBe(0)

    const row = await db.prepare('SELECT id FROM media WHERE id = ?').bind(unused).first()
    expect(row).toBeNull()

    const log = (await (await app.request(
      `https://plattr.example/api/projects/${a.project.token}/media/cleanup`,
      { headers: { cookie: a.cookie } },
      env as never,
    )).json()) as { log: { mediaId: string; action: string; runId: string }[] }
    expect(log.log.length).toBe(1)
    expect(log.log[0].mediaId).toBe(unused)
    expect(log.log[0].action).toBe('deleted')
  })

  test('a second run is a no-op and reports the id as already removed', async () => {
    const { db, env, a } = await setup()
    const unused = await upload(a.project.token, env, a.cookie, 1)
    await age(db, unused)
    const first = await cleanup(a.project.token, a.cookie, env, {
      dryRun: false, confirm: true, backupId: 'sha256:probe',
    })
    expect(first.status).toBe(200)

    const second = (await (await cleanup(a.project.token, a.cookie, env, {
      dryRun: false, confirm: true, backupId: 'sha256:probe', ids: [unused],
    })).json()) as { deleted: unknown[]; skipped: { id: string; reason: string }[] }
    expect(second.deleted).toEqual([])
    expect(second.skipped).toEqual([{ id: unused, reason: 'already removed' }])
  })

  test('a failed object delete keeps the row so the cleanup can be retried', async () => {
    const { db, r2, env, a } = await setup()
    const unused = await upload(a.project.token, env, a.cookie, 1)
    await age(db, unused)
    const [firstKey] = [...r2.objects.keys()]
    r2.failDelete.add(firstKey)

    const body = (await (await cleanup(a.project.token, a.cookie, env, {
      dryRun: false, confirm: true, backupId: 'sha256:probe',
    })).json()) as { deleted: unknown[]; failed: { id: string }[] }
    expect(body.deleted).toEqual([])
    expect(body.failed.map((entry) => entry.id)).toEqual([unused])
    expect(await db.prepare('SELECT id FROM media WHERE id = ?').bind(unused).first()).not.toBeNull()

    // The retry succeeds once storage recovers.
    r2.failDelete.clear()
    const retry = (await (await cleanup(a.project.token, a.cookie, env, {
      dryRun: false, confirm: true, backupId: 'sha256:probe',
    })).json()) as { deleted: { id: string }[] }
    expect(retry.deleted.map((entry) => entry.id)).toEqual([unused])
  })

  test('another project media is never a candidate and cannot be named', async () => {
    const { db, r2, env, a, b } = await setup()
    const theirs = await upload(b.project.token, env, b.cookie, 7)
    await age(db, theirs)

    const report = (await (await cleanup(a.project.token, a.cookie, env, { dryRun: true })).json()) as {
      report: { candidates: unknown[] }
    }
    expect(report.report.candidates).toEqual([])

    const attempt = (await (await cleanup(a.project.token, a.cookie, env, {
      dryRun: false, confirm: true, backupId: 'sha256:probe', ids: [theirs],
    })).json()) as { deleted: unknown[]; skipped: { id: string }[] }
    expect(attempt.deleted).toEqual([])
    expect(attempt.skipped.map((entry) => entry.id)).toEqual([theirs])
    expect(r2.objects.size).toBe(2)
    expect(await db.prepare('SELECT id FROM media WHERE id = ?').bind(theirs).first()).not.toBeNull()
  })

  test('a saved version that cannot be read blocks every deletion', async () => {
    const { db, r2, env, a } = await setup()
    const unused = await upload(a.project.token, env, a.cookie, 1)
    await age(db, unused)
    await db
      .prepare('INSERT INTO doc_versions (id, project_id, doc, created_at) VALUES (?, ?, ?, ?)')
      .bind('dvr_broken', a.project.id, '{not json', new Date().toISOString())
      .run()

    const response = await cleanup(a.project.token, a.cookie, env, { dryRun: true })
    expect(response.status).toBe(409)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('reference_check_failed')
    expect(r2.objects.size).toBe(2)
  })

  test('only an owner session may run the cleanup', async () => {
    const { env, a } = await setup()
    const response = await app.request(
      `https://plattr.example/api/projects/${a.project.token}/media/cleanup`,
      {
        method: 'POST',
        headers: { origin: 'https://plattr.example', 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      },
      env as never,
    )
    expect(response.status).toBe(401)
  })

  test('a cross-origin request cannot start a cleanup', async () => {
    const { env, a } = await setup()
    const response = await app.request(
      `https://plattr.example/api/projects/${a.project.token}/media/cleanup`,
      {
        method: 'POST',
        headers: { origin: 'https://elsewhere.example', 'content-type': 'application/json', cookie: a.cookie },
        body: JSON.stringify({ dryRun: true }),
      },
      env as never,
    )
    expect(response.status).toBe(403)
  })
})

describe('auto-hidden sections reach the editor', () => {
  test('the save response and the stored document say why a section is hidden', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const env = { DB: db, ASSETS: {} as Fetcher }
    const gym = await createProject(db, {
      name: 'Iron Yard Probe',
      contact: '',
      email: '',
      vertical: 'gym',
      accent: '#8fd6a4',
      logo: 'IY',
      features: ['classes'],
      platforms: ['pwa'],
      plan: 'onetime',
    })
    const cookie = await ownerCookieFor(db, gym)
    // A business that has named no coaches: the saved profiles block is empty.
    const spec = await db.prepare('SELECT spec FROM projects WHERE id = ?').bind(gym.id).first<{ spec: string }>()
    const parsed = JSON.parse(spec!.spec)
    parsed.team = []
    await db.prepare('UPDATE projects SET spec = ? WHERE id = ?').bind(JSON.stringify(parsed), gym.id).run()

    const doc = {
      v: 2,
      screens: [
        {
          id: 'scr_home',
          kind: 'home',
          name: 'Home',
          icon: 'home',
          nav: true,
          hidden: false,
          sections: [
            { id: 'sec_hero', kind: 'heading', title: 'Train here', hidden: false },
            { id: 'sec_fx_gym_trainers', kind: 'flagship', variant: 'gym-trainers', hidden: false },
          ],
        },
      ],
    }
    const saved = await putDoc(gym.token, cookie, env, doc)
    expect(saved.status).toBe(200)
    const payload = (await saved.json()) as { hidden: string[]; doc: { screens: { sections: { id: string; hidden: boolean; hiddenBecause?: string }[] }[] } }
    expect(payload.hidden).toContain('sec_fx_gym_trainers')
    const node = payload.doc.screens[0].sections.find((entry) => entry.id === 'sec_fx_gym_trainers')
    expect(node?.hidden).toBe(true)
    expect(node?.hiddenBecause).toBe('empty')

    const reread = (await (await app.request(
      `https://plattr.example/api/projects/${gym.token}/doc`,
      { headers: { cookie } },
      env as never,
    )).json()) as { doc: { screens: { sections: { id: string; hiddenBecause?: string }[] }[] } }
    expect(reread.doc.screens[0].sections.find((entry) => entry.id === 'sec_fx_gym_trainers')?.hiddenBecause).toBe('empty')
  })

  test('showing the section again clears the reason', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const env = { DB: db, ASSETS: {} as Fetcher }
    const gym = await createProject(db, {
      name: 'Iron Yard Probe',
      contact: '',
      email: '',
      vertical: 'gym',
      accent: '#8fd6a4',
      logo: 'IY',
      features: ['classes'],
      platforms: ['pwa'],
      plan: 'onetime',
    })
    const cookie = await ownerCookieFor(db, gym)
    const spec = await db.prepare('SELECT spec FROM projects WHERE id = ?').bind(gym.id).first<{ spec: string }>()
    const parsed = JSON.parse(spec!.spec)
    parsed.team = []
    await db.prepare('UPDATE projects SET spec = ? WHERE id = ?').bind(JSON.stringify(parsed), gym.id).run()

    const shown = await putDoc(gym.token, cookie, env, {
      v: 2,
      screens: [{
        id: 'scr_home', kind: 'home', name: 'Home', icon: 'home', nav: true, hidden: false,
        sections: [{ id: 'sec_fx_gym_trainers', kind: 'flagship', variant: 'gym-trainers', hidden: false }],
      }],
    })
    const payload = (await shown.json()) as { hidden: string[] }
    // It is still empty, so the server hides it again and says so.
    expect(payload.hidden).toContain('sec_fx_gym_trainers')
  })
})
