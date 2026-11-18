import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { createProject } from '../src/worker/db'
import app from '../src/worker/index'
import { buildSpec } from '../src/worker/pricing'
import { MemoryD1 } from './memoryD1'

const NOINDEX = '<meta name="robots" content="noindex, nofollow" />'

async function customerBuild() {
  const db = new MemoryD1() as unknown as D1Database
  const project = await createProject(db, {
    name: 'Private Bakehouse',
    contact: '',
    email: '',
    vertical: 'cafe',
    accent: '#a8642c',
    logo: 'PB',
    features: ['catalog'],
    platforms: ['pwa'],
    plan: 'onetime',
  })
  return { db, token: project.token }
}

describe('the private build pages', () => {
  test('the token page and its app ask not to be indexed', async () => {
    const { db, token } = await customerBuild()
    const env = { DB: db, ASSETS: {} as Fetcher }
    for (const path of [`/p/${token}`, `/p/${token}/app`]) {
      const response = await app.request(`https://plattr.example${path}`, {}, env)
      expect(response.status, path).toBe(200)
      const html = await response.text()
      expect(html, path).toContain(NOINDEX)
    }
  })

  test('a demo build stays indexable', () => {
    const spec = buildSpec({
      name: 'Demo Salon',
      vertical: 'salon',
      accent: '#7a4b8f',
      logo: 'DS',
      features: ['catalog'],
    })
    const demo = renderApp(spec, { token: 'demo-salons', live: false })
    expect(demo).not.toContain(NOINDEX)
    expect(renderApp(spec, { token: 'customer-salons', live: false, noindex: true })).toContain(NOINDEX)
  })

  test('the public pages are not noindexed', async () => {
    const home = await (await app.request('https://plattr.example/', {}, { ASSETS: {} as Fetcher })).text()
    expect(home).not.toContain('content="noindex')
  })
})

describe('the operator board', () => {
  const { db } = { db: new MemoryD1() as unknown as D1Database }

  test('the set-up and locked variants ask not to be indexed', async () => {
    const noKey = await app.request(
      'https://plattr.example/studio',
      {},
      { DB: db, ASSETS: {} as Fetcher },
    )
    expect(noKey.status).toBe(503)
    expect(await noKey.text()).toContain(NOINDEX)

    const locked = await app.request(
      'https://plattr.example/studio',
      {},
      { DB: db, ASSETS: {} as Fetcher, STUDIO_KEY: 'operator-key' },
    )
    expect(locked.status).toBe(401)
    expect(await locked.text()).toContain(NOINDEX)
  })

  test('the unlocked board is noindexed too', async () => {
    const env = { DB: db, ASSETS: {} as Fetcher, STUDIO_KEY: 'operator-key' }
    const unlock = await app.request(
      'https://plattr.example/studio/unlock',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'key=operator-key',
      },
      env,
    )
    expect(unlock.status).toBe(303)
    const cookie = (unlock.headers.get('set-cookie') ?? '').split(';')[0]
    expect(cookie).toContain('plattr_studio=')

    const board = await app.request('https://plattr.example/studio', { headers: { cookie } }, env)
    expect(board.status).toBe(200)
    expect(await board.text()).toContain(NOINDEX)
  })
})
