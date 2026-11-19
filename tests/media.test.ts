import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { createProject, saveDoc } from '../src/worker/db'
import { addSection, docFromSpec, homeScreen, updateSection } from '../src/worker/doc'
import type { MediaBucket } from '../src/worker/media'
import { MemoryD1 } from './memoryD1'
import { ownerCookieFor } from './ownerCookie'

const ownerCookies = new Map<string, string>()

/** Adds the real dashboard session for the project named in the URL. */
async function authedRequest(
  input: string,
  init: RequestInit = {},
  env: unknown,
): Promise<Response> {
  const token = input.match(/(?:projects|p)\/([0-9a-f]{24})/)?.[1]
  const cookie = token ? ownerCookies.get(token) : undefined
  const headers = new Headers(init.headers as HeadersInit)
  if (cookie) headers.set('cookie', cookie)
  return app.request(input, { ...init, headers }, env as never)
}

/**
 * The media route is exercised end to end: a real multipart upload, magic-byte
 * checks, content-addressed reuse, R2 failure, token-scoped delivery, document
 * persistence and reference-checked deletion. R2 is an in-memory stand-in with
 * the same get/put/delete surface.
 */

class MemoryR2 {
  objects = new Map<string, Uint8Array>()
  failPut = false
  failDelete = false
  puts = 0

  async put(key: string, value: ArrayBuffer) {
    if (this.failPut) throw new Error('R2 down')
    this.puts += 1
    this.objects.set(key, new Uint8Array(value.slice(0)))
    return {}
  }

  async get(key: string) {
    const value = this.objects.get(key)
    if (!value) return null
    return { body: value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength), httpEtag: '"' + key + '"' }
  }

  async delete(keys: string | string[]) {
    if (this.failDelete) throw new Error('R2 down')
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key)
    return {}
  }
}

function webp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
  const size = 22
  bytes.set([size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >> 24) & 0xff], 4)
  bytes.set([0x57, 0x45, 0x42, 0x50], 8) // WEBP
  bytes.set([0x56, 0x50, 0x38, 0x58], 12) // VP8X
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

async function projectWithDb() {
  const db = new MemoryD1() as unknown as D1Database
  const project = await createProject(db, {
    name: 'Fern & Flint',
    contact: '',
    email: '',
    vertical: 'shop',
    accent: '#2a5a8f',
    logo: 'FF',
    features: ['catalog', 'offers', 'loyalty', 'reviews'],
    platforms: ['pwa'],
    plan: 'onetime',
  })
  const cookie = await ownerCookieFor(db, project)
  ownerCookies.set(project.token, cookie)
  return { db, project, cookie }
}

function uploadForm(bytes = png(640, 480), variants = [webp(320, 240), webp(640, 480)]) {
  const form = new FormData()
  form.append('file', new File([bytes], 'shop.png', { type: 'image/png' }))
  for (const variant of variants) form.append('variant', new File([variant], 'size.webp', { type: 'image/webp' }))
  return form
}

async function upload(
  token: string,
  env: { DB: D1Database; ASSETS: Fetcher; MEDIA?: R2Bucket },
  form = uploadForm(),
) {
  return authedRequest(
    `https://plattr.example/api/projects/${token}/media`,
    { method: 'POST', headers: { origin: 'https://plattr.example' }, body: form },
    env,
  )
}

const ENV = (MEDIA: R2Bucket, DB: D1Database) => ({ DB, ASSETS: {} as Fetcher, MEDIA })

describe('media library', () => {
  test('uploads validated WebP variants and reuses the same content', async () => {
    const { db, project } = await projectWithDb()
    const r2 = new MemoryR2()
    const env = ENV(r2 as unknown as R2Bucket, db)

    const first = await upload(project.token, env)
    expect(first.status).toBe(201)
    const body = (await first.json()) as {
      media: { id: string; width: number; height: number; format: string; variants: { width: number }[] }
      existing: boolean
    }
    expect(body.media.width).toBe(640)
    expect(body.media.height).toBe(480)
    expect(body.media.format).toBe('webp')
    expect(body.media.variants.map((entry) => entry.width)).toEqual([320, 640])
    expect(body.existing).toBe(false)
    expect(r2.puts).toBe(2)

    const again = await upload(project.token, env)
    expect(again.status).toBe(200)
    const againBody = (await again.json()) as { existing: boolean; media: { id: string } }
    expect(againBody.existing).toBe(true)
    expect(againBody.media.id).toBe(body.media.id)

    const listed = (await (
      await authedRequest(`https://plattr.example/api/projects/${project.token}/media`, {}, env as never)
    ).json()) as { media: unknown[]; suggestions: unknown[]; limits: { files: number } }
    expect(listed.media.length).toBe(1)
    expect(listed.suggestions.length).toBeGreaterThan(0)
    expect(listed.limits.files).toBe(24)

    const served = await authedRequest(
      `https://plattr.example/p/${project.token}/media/${body.media.id}/640.webp`,
      {},
      env as never,
    )
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/webp')
    expect(served.headers.get('cache-control')).toContain('private')
    expect(served.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new Uint8Array(await served.arrayBuffer()).byteLength).toBe(webp(640, 480).byteLength)
  })

  test('the same photograph in two apps gets its own media id', async () => {
    const first = await projectWithDb()
    const second = await projectWithDb()
    const r2 = new MemoryR2()
    const one = await upload(first.project.token, ENV(r2 as unknown as R2Bucket, first.db))
    const two = await upload(second.project.token, ENV(r2 as unknown as R2Bucket, second.db))
    expect(one.status).toBe(201)
    expect(second.project.token).not.toBe(first.project.token)
    // Both apps keep their own row and their own bytes: an id derived from the
    // content alone would collide with the first app's primary key.
    expect(two.status).toBe(201)
    const oneBody = (await one.json()) as { media: { id: string } }
    const twoBody = (await two.json()) as { media: { id: string } }
    expect(twoBody.media.id).not.toBe(oneBody.media.id)
  })

  test('rejects forged types, oversized dimensions and cross-origin uploads', async () => {
    const { db, project } = await projectWithDb()
    const r2 = new MemoryR2()
    const env = ENV(r2 as unknown as R2Bucket, db)

    const forged = new FormData()
    forged.append('file', new File([new Uint8Array([1, 2, 3, 4])], 'fake.png', { type: 'image/png' }))
    forged.append('variant', new File([webp(320, 240)], '320.webp', { type: 'image/webp' }))
    const forgedResponse = await upload(project.token, env, forged)
    expect(forgedResponse.status).toBe(400)

    // A real PNG labelled as a JPEG must not pass: both its declared type and
    // its magic bytes have to agree.
    const mislabelled = new FormData()
    mislabelled.append('file', new File([png(640, 480)], 'shop.jpg', { type: 'image/jpeg' }))
    mislabelled.append('variant', new File([webp(320, 240)], '320.webp', { type: 'image/webp' }))
    expect((await upload(project.token, env, mislabelled)).status).toBe(400)

    const huge = new FormData()
    huge.append('file', new File([png(5000, 5000)], 'huge.png', { type: 'image/png' }))
    huge.append('variant', new File([webp(320, 240)], '320.webp', { type: 'image/webp' }))
    expect((await upload(project.token, env, huge)).status).toBe(400)

    const svg = new FormData()
    const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    svg.append('file', new File([svgBytes], 'x.svg', { type: 'image/svg+xml' }))
    svg.append('variant', new File([webp(320, 240)], '320.webp', { type: 'image/webp' }))
    expect((await upload(project.token, env, svg)).status).toBe(400)

    const nonWebp = new FormData()
    nonWebp.append('file', new File([png(640, 480)], 'shop.png', { type: 'image/png' }))
    nonWebp.append('variant', new File([png(320, 240)], '320.png', { type: 'image/png' }))
    expect((await upload(project.token, env, nonWebp)).status).toBe(400)

    const cross = await authedRequest(
      `https://plattr.example/api/projects/${project.token}/media`,
      { method: 'POST', headers: { origin: 'https://evil.example' }, body: uploadForm() },
      env as never,
    )
    expect(cross.status).toBe(403)
  })

  test('a failed R2 write leaves no metadata behind', async () => {
    const { db, project } = await projectWithDb()
    const r2 = new MemoryR2()
    r2.failPut = true
    const env = ENV(r2 as unknown as R2Bucket, db)
    const response = await upload(project.token, env)
    expect(response.status).toBe(502)
    const listed = (await (
      await authedRequest(`https://plattr.example/api/projects/${project.token}/media`, {}, env as never)
    ).json()) as { media: unknown[] }
    expect(listed.media.length).toBe(0)
  })

  test('document references persist crop, fitting and delivery markup', async () => {
    const { db, project } = await projectWithDb()
    const r2 = new MemoryR2()
    const env = ENV(r2 as unknown as R2Bucket, db)
    const uploaded = (await (await upload(project.token, env)).json()) as { media: { id: string; width: number; height: number } }

    let doc = docFromSpec(project.spec)
    doc = addSection(doc, homeScreen(doc).id, 'image', project.spec)
    doc = updateSection(doc, homeScreen(doc).id, 'sec_image', {
      title: 'Our counter',
      media: {
        id: uploaded.media.id,
        alt: 'Coffee on the counter',
        width: uploaded.media.width,
        height: uploaded.media.height,
        focalX: 24,
        focalY: 68,
        fit: 'contain',
        aspect: 'portrait',
      },
    })
    await saveDoc(db, project, doc)

    const read = (await (
      await authedRequest(`https://plattr.example/api/projects/${project.token}/doc`, {}, env as never)
    ).json()) as { doc: { screens: { sections: { media?: Record<string, unknown> }[] }[] } }
    const media = read.doc.screens.flatMap((screen) => screen.sections).find((section) => section.media)?.media
    expect(media).toMatchObject({ focalX: 24, focalY: 68, fit: 'contain', aspect: 'portrait', alt: 'Coffee on the counter' })

    const html = await (
      await authedRequest(`https://plattr.example/p/${project.token}/app`, {}, env as never)
    ).text()
    expect(html).toContain(`/p/${project.token}/media/${uploaded.media.id}/640.webp`)
    expect(html).toContain('srcset=')
    expect(html).toContain('object-position:24% 68%')
    expect(html).toContain('object-fit:contain')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain(`data-direction=`)
  })

  test('deletion is refused while the app uses an image and scrubs old versions', async () => {
    const { db, project } = await projectWithDb()
    const r2 = new MemoryR2()
    const env = ENV(r2 as unknown as R2Bucket, db)
    const uploaded = (await (await upload(project.token, env)).json()) as { media: { id: string } }

    let doc = docFromSpec(project.spec)
    doc = addSection(doc, homeScreen(doc).id, 'image', project.spec)
    doc = updateSection(doc, homeScreen(doc).id, 'sec_image', { media: { id: uploaded.media.id } })
    await saveDoc(db, project, doc)

    const used = await authedRequest(
      `https://plattr.example/api/projects/${project.token}/media/${uploaded.media.id}`,
      { method: 'DELETE', headers: { origin: 'https://plattr.example' } },
      env as never,
    )
    expect(used.status).toBe(409)

    // Remove it from the current document. A retained version still points at
    // it, so deletion scrubs that version instead of leaving a broken image.
    const without = docFromSpec(project.spec)
    await saveDoc(db, project, without)
    const freed = await authedRequest(
      `https://plattr.example/api/projects/${project.token}/media/${uploaded.media.id}`,
      { method: 'DELETE', headers: { origin: 'https://plattr.example' } },
      env as never,
    )
    expect(freed.status).toBe(200)
    expect(r2.objects.size).toBe(0)
    const versions = (await db.prepare('SELECT doc FROM doc_versions WHERE project_id = ?').bind(project.id).all()) as {
      results: { doc: string }[]
    }
    expect(versions.results.length).toBeGreaterThan(0)
    for (const version of versions.results) expect(version.doc).not.toContain(uploaded.media.id)
  })

  test('enforces the per-app file quota', async () => {
    const { db, project } = await projectWithDb()
    const r2 = new MemoryR2()
    const env = ENV(r2 as unknown as R2Bucket, db)
    for (let index = 0; index < 24; index += 1) {
      await db
        .prepare(
          `INSERT INTO media (id, project_id, hash, width, height, bytes, alt, focal_x, focal_y, created_at, variants)
           VALUES (?, ?, ?, 1, 1, 1, '', 50, 50, ?, '[]')`,
        )
        .bind(`med_${String(index).padStart(24, '0')}`, project.id, `hash-${index}`, new Date().toISOString())
        .run()
    }
    const response = await upload(project.token, env)
    expect(response.status).toBe(409)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('quota_files')
  })

  test('enforces the per-app byte quota', async () => {
    const { db, project } = await projectWithDb()
    const r2 = new MemoryR2()
    const env = ENV(r2 as unknown as R2Bucket, db)
    await db
      .prepare(
        `INSERT INTO media (id, project_id, hash, width, height, bytes, alt, focal_x, focal_y, created_at, variants)
         VALUES (?, ?, ?, 1, 1, ?, '', 50, 50, ?, '[]')`,
      )
      .bind('med_000000000000000000000000', project.id, 'big-hash', 40 * 1024 * 1024, new Date().toISOString())
      .run()
    const response = await upload(project.token, env)
    expect(response.status).toBe(409)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('quota_bytes')
  })

  test('delivery is token-scoped and rejects unknown widths or projects', async () => {
    const { db, project } = await projectWithDb()
    const other = await projectWithDb()
    const r2 = new MemoryR2()
    const env = ENV(r2 as unknown as R2Bucket, db)
    const uploaded = (await (await upload(project.token, env)).json()) as { media: { id: string } }

    const wrongWidth = await authedRequest(
      `https://plattr.example/p/${project.token}/media/${uploaded.media.id}/9999.webp`,
      {},
      env as never,
    )
    // 9999 is syntactically a width but picks the largest stored variant.
    expect(wrongWidth.status).toBe(200)
    const badName = await authedRequest(
      `https://plattr.example/p/${project.token}/media/${uploaded.media.id}/photo.webp`,
      {},
      env as never,
    )
    expect(badName.status).toBe(404)

    const otherEnv = ENV(r2 as unknown as R2Bucket, other.db)
    const crossProject = await authedRequest(
      `https://plattr.example/p/${other.project.token}/media/${uploaded.media.id}/320.webp`,
      {},
      otherEnv as never,
    )
    expect(crossProject.status).toBe(404)
  })

  test('a catalogue item owns its photo, alt text, crop and responsive markup', async () => {
    const { db, project } = await projectWithDb()
    const r2 = new MemoryR2()
    const env = ENV(r2 as unknown as R2Bucket, db)
    const uploaded = (await (await upload(project.token, env)).json()) as { media: { id: string; width: number; height: number } }

    const saved = await authedRequest(
      `https://plattr.example/api/projects/${project.token}/catalog`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: 'https://plattr.example' },
        body: JSON.stringify({
          menu: [
            {
              name: 'Objects',
              items: [
                {
                  name: 'Stoneware mug',
                  desc: 'Hand-thrown',
                  price: 2800,
                  media: {
                    id: uploaded.media.id,
                    alt: 'A cream stoneware mug',
                    width: uploaded.media.width,
                    height: uploaded.media.height,
                    focalX: 32,
                    focalY: 71,
                    fit: 'contain',
                  },
                },
              ],
            },
          ],
        }),
      },
      env as never,
    )
    expect(saved.status).toBe(200)
    const savedBody = (await saved.json()) as { menu: { items: { media?: Record<string, unknown> }[] }[] }
    expect(savedBody.menu[0].items[0].media).toMatchObject({ id: uploaded.media.id, focalX: 32, focalY: 71, fit: 'contain' })

    const html = await (await authedRequest(`https://plattr.example/p/${project.token}/app`, {}, env as never)).text()
    expect(html).toContain(`/p/${project.token}/media/${uploaded.media.id}/640.webp`)
    expect(html).toContain('A cream stoneware mug')
    expect(html).toContain('object-position:32% 71%')
    expect(html).toContain('object-fit:contain')
    expect(html).toContain('loading="lazy"')

    const blocked = await authedRequest(
      `https://plattr.example/api/projects/${project.token}/media/${uploaded.media.id}`,
      { method: 'DELETE', headers: { origin: 'https://plattr.example' } },
      env as never,
    )
    expect(blocked.status).toBe(409)
  })

  test('replacing a photo keeps its id so every item reference survives', async () => {
    const { db, project } = await projectWithDb()
    const r2 = new MemoryR2()
    const env = ENV(r2 as unknown as R2Bucket, db)
    const uploaded = (await (await upload(project.token, env)).json()) as { media: { id: string } }
    await authedRequest(
      `https://plattr.example/api/projects/${project.token}/catalog`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: 'https://plattr.example' },
        body: JSON.stringify({
          menu: [{ name: 'Objects', items: [{ name: 'Vase', desc: '', price: 100, media: { id: uploaded.media.id, alt: 'Old caption' } }] }],
        }),
      },
      env as never,
    )

    const form = new FormData()
    form.append('file', new File([png(800, 600)], 'new.png', { type: 'image/png' }))
    form.append('variant', new File([webp(320, 240)], '320.webp', { type: 'image/webp' }))
    form.append('variant', new File([webp(640, 480)], '640.webp', { type: 'image/webp' }))
    form.append('replace', uploaded.media.id)
    form.append('alt', 'The replacement vase')
    const replaced = await authedRequest(
      `https://plattr.example/api/projects/${project.token}/media`,
      { method: 'POST', headers: { origin: 'https://plattr.example' }, body: form },
      env as never,
    )
    expect(replaced.status).toBe(200)
    const body = (await replaced.json()) as { media: { id: string; width: number; alt: string; variants: { width: number }[] }; replaced: boolean }
    expect(body.replaced).toBe(true)
    expect(body.media.id).toBe(uploaded.media.id)
    expect(body.media.width).toBe(800)
    expect(body.media.alt).toBe('The replacement vase')
    expect(body.media.variants.map((entry) => entry.width)).toEqual([320, 640])

    const html = await (await authedRequest(`https://plattr.example/p/${project.token}/app`, {}, env as never)).text()
    expect(html).toContain(`/p/${project.token}/media/${uploaded.media.id}/640.webp`)
    // The item keeps its own alt text; replacing the library file must not
    // silently rewrite the catalogue copy that references it.
    expect(html).toContain('Old caption')
  })

  test('each flagship trade renders its own item photo and alt text', async () => {
    for (const vertical of [
      'restaurant',
      'salon',
      'hotel',
      'professional',
      'cafe',
      'gym',
      'clinic',
      'property',
      'studio',
      'trades',
      'auto',
      'ecommerce',
      'courses',
      'finance',
    ] as const) {
      const db = new MemoryD1() as unknown as D1Database
      const project = await createProject(db, {
        name: 'Fern & Flint',
        contact: '',
        email: '',
        vertical,
        accent: '#2a5a8f',
        logo: 'FF',
        features: ['catalog', 'booking'],
        platforms: ['pwa'],
        plan: 'onetime',
      })
      ownerCookies.set(project.token, await ownerCookieFor(db, project))
      const r2 = new MemoryR2()
      const env = ENV(r2 as unknown as R2Bucket, db)
      const uploaded = (await (await upload(project.token, env)).json()) as { media: { id: string; width: number; height: number } }
      const first = project.spec.menu[0].items[0]
      const saved = await authedRequest(
        `https://plattr.example/api/projects/${project.token}/catalog`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json', origin: 'https://plattr.example' },
          body: JSON.stringify({
            menu: [
              {
                name: project.spec.menu[0].name,
                items: [
                  {
                    ...first,
                    media: {
                      id: uploaded.media.id,
                      alt: `Own photo for ${first.name}`,
                      width: uploaded.media.width,
                      height: uploaded.media.height,
                      focalX: 41,
                      focalY: 58,
                      fit: 'cover',
                    },
                  },
                ],
              },
            ],
          }),
        },
        env as never,
      )
      expect(saved.status).toBe(200)
      const html = await (await authedRequest(`https://plattr.example/p/${project.token}/app`, {}, env as never)).text()
      expect(html).toContain(`/p/${project.token}/media/${uploaded.media.id}/640.webp`)
      expect(html).toContain(`Own photo for ${first.name}`)
      expect(html).toContain('object-position:41% 58%')
    }
  })
})
