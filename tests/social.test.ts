import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'

const env = { ASSETS: {} as Fetcher } as { ASSETS: Fetcher }

function tag(html: string, attribute: string, value: string): string | undefined {
  return new RegExp(`<meta ${attribute}="${value}" content="([^"]*)"`).exec(html)?.[1]
}

describe('the pages a stranger shares', () => {
  test('the home page carries share tags with absolute artwork', async () => {
    const response = await app.request('https://plattr.example/?from=test', {}, env)
    const html = await response.text()

    expect(response.headers.get('content-type')).toContain('text/html')
    expect(tag(html, 'property', 'og:title')).toBeTruthy()
    expect(tag(html, 'property', 'og:description')).toBeTruthy()
    expect(tag(html, 'property', 'og:url')).toBe('https://plattr.example/')
    expect(tag(html, 'property', 'og:image')).toBe('https://plattr.example/og.png')
    expect(tag(html, 'property', 'og:image:width')).toBe('1200')
    expect(tag(html, 'property', 'og:image:height')).toBe('630')
    expect(tag(html, 'name', 'twitter:card')).toBe('summary_large_image')
    expect(tag(html, 'name', 'twitter:image')).toBe('https://plattr.example/og.png')
  })

  test('every page gets its own title, and the icons are real files', async () => {
    const brief = await (await app.request('https://plattr.example/brief', {}, env)).text()
    const home = await (await app.request('https://plattr.example/', {}, env)).text()
    expect(tag(brief, 'property', 'og:title')).not.toBe(tag(home, 'property', 'og:title'))
    expect(brief).toContain('href="/favicon.ico"')
    expect(brief).toContain('href="/favicon.svg"')
    expect(brief).toContain('href="/apple-touch-icon.png"')
  })

  test('assets answer before the not-found page, and 404s still become a page', async () => {
    const assetEnv = {
      ASSETS: {
        fetch: async (request: Request) =>
          new URL(request.url).pathname === '/og.png'
            ? new Response('png', { headers: { 'content-type': 'image/png' } })
            : new Response('missing', { status: 404 }),
      },
    } as unknown as { ASSETS: Fetcher }

    const image = await app.request('https://plattr.example/og.png', {}, assetEnv)
    expect(image.status).toBe(200)
    expect(image.headers.get('content-type')).toBe('image/png')

    const missing = await app.request('https://plattr.example/nope', {}, assetEnv)
    expect(missing.status).toBe(404)
    expect(await missing.text()).toContain('Not found · Plattr')
  })
})
