import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { createProject } from '../src/worker/db'
import { docFromSpec, homeScreen } from '../src/worker/doc'
import { renderApp } from '../src/worker/app'
import { VERTICAL_IDS } from '../src/worker/verticals'
import { buildSpec } from '../src/worker/pricing'
import { MemoryD1 } from './memoryD1'
import { ownerCookieFor } from './ownerCookie'

async function projectWithDb() {
  const db = new MemoryD1() as unknown as D1Database
  const project = await createProject(db, {
    name: 'Fern & Flint',
    contact: '',
    email: '',
    vertical: 'restaurant',
    accent: '#c8452b',
    logo: 'FF',
    features: ['catalog', 'ordering', 'offers', 'reviews'],
    platforms: ['pwa'],
    plan: 'onetime',
  })
  return { db, project, cookie: await ownerCookieFor(db, project) }
}

const JSON_HEADERS = { 'content-type': 'application/json', origin: 'https://plattr.example' }

describe('catalogue editing', () => {
  test('saves real names, descriptions and prices used by the app', async () => {
    const { db, project, cookie } = await projectWithDb()
    const env = { DB: db, ASSETS: {} as Fetcher }
    const headers = { ...JSON_HEADERS, cookie }
    const response = await app.request(
      `https://plattr.example/api/projects/${project.token}/catalog`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          menu: [
            {
              name: 'Small plates',
              items: [
                { name: 'Tomato toast', desc: 'Sourdough, basil, sea salt', price: 900 },
                { name: 'Olives', desc: 'Warm, with orange peel', price: 500 },
              ],
            },
          ],
          offers: [{ title: 'Lunch before two', body: 'Two plates and a drink, Tuesday to Friday.' }],
        }),
      },
      env as never,
    )
    expect(response.status).toBe(200)
    const saved = (await response.json()) as { menu: { items: { name: string }[] }[] }
    expect(saved.menu[0].items.map((item) => item.name)).toEqual(['Tomato toast', 'Olives'])

    const html = await (await app.request(`https://plattr.example/p/${project.token}/app`, {}, env as never)).text()
    expect(html).toContain('Tomato toast')
    expect(html).toContain('Sourdough, basil, sea salt')
    expect(html).toContain('Lunch before two')
    expect(html).not.toContain('Burrata, blood orange')
  })

  test('rejects cross-site catalogue writes and empty offer titles', async () => {
    const { db, project, cookie } = await projectWithDb()
    const env = { DB: db, ASSETS: {} as Fetcher }
    const headers = { ...JSON_HEADERS, cookie }
    const cross = await app.request(
      `https://plattr.example/api/projects/${project.token}/catalog`,
      {
        method: 'PUT',
        headers: { ...headers, origin: 'https://evil.example' },
        body: JSON.stringify({ menu: [] }),
      },
      env as never,
    )
    expect(cross.status).toBe(403)

    const emptyOffer = await app.request(
      `https://plattr.example/api/projects/${project.token}/catalog`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          menu: [{ name: 'Drinks', items: [{ name: 'Coffee', desc: '', price: 350 }] }],
          offers: [{ title: '', body: 'Nothing to see' }],
        }),
      },
      env as never,
    )
    expect(emptyOffer.status).toBe(200)
    const body = (await emptyOffer.json()) as { offers: { title: string }[] }
    expect(body.offers).toEqual([])
  })

  test('the editable home story is the copy shown on More', () => {
    const spec = buildSpec({ name: 'Story Co', vertical: 'restaurant', accent: '#a34b2b', logo: 'SC', features: [] })
    const doc = docFromSpec(spec)
    const story = homeScreen(doc).sections.find((section) => section.kind === 'story')
    expect(story).toBeTruthy()
    if (story) story.text = 'We bake before sunrise and close when the bread runs out.'
    const html = renderApp(spec, { token: 'storystorystorystoryst', doc })
    expect(html).toContain('We bake before sunrise and close when the bread runs out.')
    expect(html).not.toContain(spec.story)
  })

  test('generated screens contain no placeholder filler or repeated long copy', () => {
    for (const vertical of VERTICAL_IDS) {
      const spec = buildSpec({ name: 'Quality Co', vertical, accent: '#a34b2b', logo: 'QC', features: [] })
      const html = renderApp(spec, { token: 'qualityqualityquality', doc: docFromSpec(spec) })
      const visible = html
        .replace(/<script[\s\S]*?<\/script>/g, ' ')
        .replace(/<style[\s\S]*?<\/style>/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
      for (const filler of ['Lorem ipsum', 'Your text here', 'Add your description', 'Coming soon', 'Placeholder']) {
        expect(visible.toLowerCase()).not.toContain(filler.toLowerCase())
      }
      // Visible paragraph copy must not repeat back-to-back within one screen.
      const screens = html
        .split('<section class="screen')
        .slice(1)
        .map((screen) => screen.split('</section>')[0])
      for (const screen of screens) {
        const paragraphs = [...screen.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)]
          .map((match) => match[1].replace(/<[^>]+>/g, '').trim())
          .filter((text) => text.length > 40)
        expect(new Set(paragraphs).size).toBe(paragraphs.length)
      }
    }
  })
})
