import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { createProject } from '../src/worker/db'
import { MemoryD1 } from './memoryD1'
import { ownerCookieFor } from './ownerCookie'

/**
 * Media isolation is decided on the server. A document or catalogue that names
 * an image owned by another build is refused, and the delivery route is scoped
 * by project, so neither the editor nor a published app can show another
 * business's photograph.
 */

class MemoryR2 {
  objects = new Map<string, Uint8Array>()
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
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key)
    return {}
  }
}

function webp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0)
  const size = 22
  bytes.set([size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >> 24) & 0xff], 4)
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

async function upload(token: string, env: unknown, cookie: string): Promise<string> {
  const form = new FormData()
  form.append('file', new File([png(640, 480)], 'shop.png', { type: 'image/png' }))
  form.append('variant', new File([webp(320, 240)], 'size.webp', { type: 'image/webp' }))
  form.append('variant', new File([webp(640, 480)], 'size.webp', { type: 'image/webp' }))
  const response = await app.request(
    `https://plattr.example/api/projects/${token}/media`,
    { method: 'POST', headers: { origin: 'https://plattr.example', cookie }, body: form },
    env as never,
  )
  expect(response.status).toBe(201)
  const body = (await response.json()) as { media: { id: string } }
  return body.media.id
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

describe('media isolation between projects', () => {
  test('a document cannot reference another project media id', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const r2 = new MemoryR2() as unknown as R2Bucket
    const env = { DB: db, ASSETS: {} as Fetcher, MEDIA: r2 }
    const a = await makeProject(db, 'Project A')
    const b = await makeProject(db, 'Project B')
    const mediaA = await upload(a.project.token, env, a.cookie)

    const rejected = await putDoc(b.project.token, b.cookie, env, docWithMedia(mediaA))
    expect(rejected.status).toBe(422)
    const payload = (await rejected.json()) as { error: { code: string } }
    expect(payload.error.code).toBe('invalid_media_reference')

    // Nothing was written: B still has no document of its own.
    const stored = await db
      .prepare('SELECT doc FROM projects WHERE id = ?')
      .bind(b.project.id)
      .first<{ doc: string }>()
    expect(stored?.doc ?? '').toBe('')
  })

  test('a document may reference its own project media', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const r2 = new MemoryR2() as unknown as R2Bucket
    const env = { DB: db, ASSETS: {} as Fetcher, MEDIA: r2 }
    const a = await makeProject(db, 'Project A')
    const mediaA = await upload(a.project.token, env, a.cookie)

    const saved = await putDoc(a.project.token, a.cookie, env, docWithMedia(mediaA))
    expect(saved.status).toBe(200)
    const payload = (await saved.json()) as { doc: { screens: { sections: { media?: { id: string } }[] }[] } }
    const media = payload.doc.screens[0].sections[0].media
    expect(media?.id).toBe(mediaA)
  })

  test('a catalogue entry cannot reference another project media id', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const r2 = new MemoryR2() as unknown as R2Bucket
    const env = { DB: db, ASSETS: {} as Fetcher, MEDIA: r2 }
    const a = await makeProject(db, 'Project A')
    const b = await makeProject(db, 'Project B')
    const mediaA = await upload(a.project.token, env, a.cookie)

    const rejected = await app.request(
      `https://plattr.example/api/projects/${b.project.token}/catalog`,
      {
        method: 'PUT',
        headers: { origin: 'https://plattr.example', 'content-type': 'application/json', cookie: b.cookie },
        body: JSON.stringify({
          menu: [{ name: 'Pieces', items: [{ name: 'Lamp', price: 4500, media: { id: mediaA } }] }],
        }),
      },
      env as never,
    )
    expect(rejected.status).toBe(422)
  })

  test('the delivery route refuses another project media id', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const r2 = new MemoryR2() as unknown as R2Bucket
    const env = { DB: db, ASSETS: {} as Fetcher, MEDIA: r2 }
    const a = await makeProject(db, 'Project A')
    const b = await makeProject(db, 'Project B')
    const mediaA = await upload(a.project.token, env, a.cookie)

    const own = await app.request(`https://plattr.example/p/${a.project.token}/media/${mediaA}/320.webp`, {}, env as never)
    expect(own.status).toBe(200)

    const foreign = await app.request(
      `https://plattr.example/p/${b.project.token}/media/${mediaA}/320.webp`,
      {},
      env as never,
    )
    expect(foreign.status).toBe(404)
  })

  test('a published app never links to another build media path', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const r2 = new MemoryR2() as unknown as R2Bucket
    const env = { DB: db, ASSETS: {} as Fetcher, MEDIA: r2 }
    const a = await makeProject(db, 'Project A')
    const b = await makeProject(db, 'Project B')
    const mediaA = await upload(a.project.token, env, a.cookie)
    await putDoc(a.project.token, a.cookie, env, docWithMedia(mediaA))

    const page = await app.request(`https://plattr.example/p/${b.project.token}/app`, {}, env as never)
    const html = await page.text()
    expect(html.includes(`/p/${a.project.token}/media/`)).toBe(false)
    expect(html.includes(mediaA)).toBe(false)
  })
})
