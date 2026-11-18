import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'

const env = { ASSETS: {} as Fetcher } as { ASSETS: Fetcher }

describe('what a crawler is told', () => {
  test('robots keeps private pages out and points at the sitemap', async () => {
    const response = await app.request('https://plattr.example/robots.txt', {}, env)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    const body = await response.text()
    expect(body).toContain('User-agent: *')
    expect(body).toContain('Disallow: /studio')
    expect(body).toContain('Disallow: /p/')
    expect(body).toContain('Disallow: /api/')
    expect(body).toContain('Disallow: /demo/')
    expect(body).toContain('Sitemap: https://plattr.example/sitemap.xml')
    // The share-tag middleware must leave non-HTML alone.
    expect(body).not.toContain('og:title')
  })

  test('the sitemap lists the public pages, never a build link', async () => {
    const response = await app.request('https://plattr.example/sitemap.xml', {}, env)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/xml')
    const body = await response.text()
    expect(body).toStartWith('<?xml version="1.0" encoding="UTF-8"?>')
    expect(body).toContain('<loc>https://plattr.example/</loc>')
    expect(body).toContain('<loc>https://plattr.example/brief</loc>')
    expect(body).toContain('<loc>https://plattr.example/privacy</loc>')
    expect(body).not.toContain('/p/')
  })

  test('both files follow the origin they were asked on', async () => {
    const robots = await (
      await app.request('https://plattr-studio-67t93q-preview.freebuff.page/robots.txt', {}, env)
    ).text()
    // A preview is a public copy; it must never be crawled alongside production.
    expect(robots).toBe('User-agent: *\nDisallow: /\n')
  })
})
