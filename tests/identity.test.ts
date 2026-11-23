import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { readPrompt } from '../src/worker/prompt'
import { identityIssues } from '../src/worker/identity'
import { sanitizeImported } from '../src/worker/importer'
import { MemoryD1 } from './memoryD1'

/**
 * Business identity consistency and prompt content.
 *
 * These tests exist because two real journeys produced contradictions: a
 * jeweller's build rendered with a café/florist trade and navigation, and a
 * café prompt returned a jeweller's identity. Both are the same class of bug —
 * one business's trade, name or catalogue surviving into another business's
 * build — so both the surface (prompt reading) and the guard (server refusal)
 * are tested here.
 */

const ORIGIN = 'https://plattr.example'

function newEnv() {
  return { DB: new MemoryD1() as unknown as D1Database, ASSETS: {} as Fetcher }
}

function build(env: ReturnType<typeof newEnv>, body: Record<string, unknown>) {
  return app.request(
    `${ORIGIN}/api/projects`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify(body),
    },
    env as never,
  )
}

const GEESTORES = {
  name: 'GeeStores',
  vertical: 'shop',
  category: 'Jewellery shop',
  website: 'https://geestores.com/',
  menu: [
    {
      name: 'Jewellery shop',
      items: [{ name: 'Semi Tussar Saree', desc: '', price: 164000 }],
    },
  ],
}

describe('a prompt describes its own business', () => {
  test('a café prompt reads as a café and carries no other business', () => {
    const read = readPrompt('need a website for a cafe in kochi')
    expect(read.vertical).toBe('cafe')
    expect(read.label).toBe('Café & bakery')
    expect(read.confidence).toBe('detected')
    // A prompt has no imported identity to leak.
    expect(read.sample).toBeUndefined()
    expect(JSON.stringify(read)).not.toContain('GeeStores')
  })

  test('a florist prompt seeds flowers, not the homeware shop sample', () => {
    const read = readPrompt('I run a florist in Kochi — bouquets and wedding flowers')
    expect(read.vertical).toBe('shop')
    expect(read.label).toBe('Florist')
    expect(read.category).toBe('Florist')
    expect(read.sample?.length).toBeGreaterThan(0)
    const names = read.sample!.flatMap((section) => section.items.map((item) => item.name)).join(' ')
    expect(names.toLowerCase()).toContain('bouquet')
    expect(names.toLowerCase()).not.toContain('stoneware mug')
    // Shop workflows are correct for a florist: catalogue, delivery, orders.
    expect(read.features).toContain('ordering')
    expect(read.features).toContain('delivery')
  })
})

describe('identity validation refuses a contradiction', () => {
  test('the site trade and the build trade must be the same', () => {
    const issues = identityIssues({ vertical: 'cafe', category: 'Jewellery shop', siteVertical: 'shop' })
    expect(issues.map((issue) => issue.code)).toEqual(['trade_mismatch', 'category_mismatch'])
    expect(issues[0].message).toContain('Shop & retail')
    expect(issues[0].message).toContain('Café & bakery')
  })

  test('a category from another trade family is a contradiction', () => {
    expect(identityIssues({ vertical: 'shop', category: 'Café' })[0]?.code).toBe('category_mismatch')
    expect(identityIssues({ vertical: 'cafe', category: 'Florist' })[0]?.code).toBe('category_mismatch')
    // A florist is a shop; a jeweller is a shop. Neither is a contradiction.
    expect(identityIssues({ vertical: 'shop', category: 'Florist' })).toEqual([])
    expect(identityIssues({ vertical: 'shop', category: 'Jewellery shop' })).toEqual([])
    // An unknown category is not a failure: the owner may use words no list has.
    expect(identityIssues({ vertical: 'shop', category: 'Purveyor of small joys' })).toEqual([])
  })

  test('the build route refuses a jeweller read built as a café', async () => {
    const env = newEnv()
    const response = await build(env, {
      name: 'GeeStores',
      vertical: 'cafe',
      category: 'Jewellery shop',
      site: GEESTORES,
    })
    expect(response.status).toBe(422)
    const payload = (await response.json()) as { error?: { code?: string; message?: string } }
    expect(payload.error?.code).toBe('identity_mismatch')
    expect(payload.error?.message).toContain('cannot use one trade')
  })

  test('the build route refuses a café label on a shop build', async () => {
    const env = newEnv()
    const response = await build(env, {
      name: 'GeeStores',
      vertical: 'shop',
      category: 'Café',
      site: GEESTORES,
    })
    expect(response.status).toBe(422)
    const payload = (await response.json()) as { error?: { code?: string } }
    expect(payload.error?.code).toBe('identity_mismatch')
  })

  test('a consistent jewellery build is accepted', async () => {
    const env = newEnv()
    const response = await build(env, {
      name: 'GeeStores',
      vertical: 'shop',
      category: 'Jewellery shop',
      site: GEESTORES,
    })
    expect(response.status).toBe(201)
    const payload = (await response.json()) as { token?: string }
    expect(payload.token).toBeTruthy()
  })

  test('the read trade survives sanitising, so the guard can use it', () => {
    const site = sanitizeImported(GEESTORES)
    expect(site?.vertical).toBe('shop')
    expect(site?.menu?.[0]?.items?.[0]?.name).toBe('Semi Tussar Saree')
  })
})
