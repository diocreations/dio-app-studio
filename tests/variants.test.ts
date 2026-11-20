import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { createProject } from '../src/worker/db'
import { MemoryD1 } from './memoryD1'

/**
 * A product with options, end to end: what the customer sees, what they pick,
 * and what the server charges. The browser never sends a price; it only names
 * an option, and the owner's catalogue decides what that option costs.
 */

const ORIGIN = 'https://plattr.example'

const MENU = [
  {
    name: 'Shirts',
    items: [
      {
        name: 'Linen Shirt',
        desc: 'Washed linen, cut loose.',
        price: 4200,
        variants: [
          { id: 'v-small', name: 'Small', price: 4200, currency: 'GBP', selected: true },
          { id: 'v-medium', name: 'Medium', price: 5800, currency: 'GBP' },
          { id: 'v-large', name: 'Large', price: 4900, currency: 'GBP' },
        ],
      },
      { name: 'Canvas Tote', desc: 'One size.', price: 2400 },
    ],
  },
]

async function shop(menu = MENU) {
  const db = new MemoryD1() as unknown as D1Database
  const project = await createProject(db, {
    name: 'Marlow Supply',
    contact: '',
    email: '',
    vertical: 'shop',
    accent: '#2a5a8f',
    logo: 'MS',
    features: ['catalog', 'ordering'],
    platforms: ['pwa'],
    plan: 'onetime',
    site: { currency: 'GBP', menu },
  })
  const env = { DB: db, ASSETS: {} as Fetcher }
  return { db, project, env }
}

function order(env: { DB: D1Database; ASSETS: Fetcher }, token: string, items: unknown[]) {
  return app.request(
    `${ORIGIN}/p/${token}/orders`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ customer: { name: 'Maya Rao', email: 'maya@example.com' }, fulfilment: 'Pickup', items }),
    },
    env as never,
  )
}

describe('a product with options', () => {
  test('the shelf says From and how many options there are', async () => {
    const { project, env } = await shop()
    const html = await (await app.request(`${ORIGIN}/p/${project.token}/app`, {}, env as never)).text()

    expect(html).toContain('Linen Shirt')
    expect(html).toContain('From £42')
    expect(html).toContain('3 options')
    // Each option keeps its name and its price in the shipped catalogue.
    expect(html).toContain('"name":"Small"')
    expect(html).toContain('"name":"Large"')
    expect(html).toContain('"price":5800')
    expect(html).toContain('"id":"v-large"')
    // No stock, availability or inventory is invented for the shop.
    expect(html).not.toContain('"available":')
    expect(html).not.toContain('"stock":')
    expect(html).not.toContain('"inventory":')
  })

  test('a single-price product keeps the simpler display', async () => {
    const { project, env } = await shop([{ name: 'Paper', items: [{ name: 'Notebook', desc: 'Sewn.', price: 900 }] }])
    const html = await (await app.request(`${ORIGIN}/p/${project.token}/app`, {}, env as never)).text()
    expect(html).toContain('£9')
    expect(html).not.toContain('From £')
    // No option choice is shipped for a product that has none.
    expect(html).not.toContain('"selected":true')
  })

  test('the variant the customer picks is what the server charges', async () => {
    const { project, env } = await shop()
    const large = await order(env, project.token, [{ key: '0-0', qty: 1, variant: 'v-large' }])
    expect(large.status).toBe(201)
    const largeOrder = (await large.json()) as { order: { total: number; id: string } }
    expect(largeOrder.order.total).toBe(4900)

    const read = await app.request(`${ORIGIN}/p/${project.token}/orders/${largeOrder.order.id}`, {}, env as never)
    const stored = (await read.json()) as { order: { items: { name: string; variant: string; price: number }[] } }
    expect(stored.order.items[0]).toMatchObject({ name: 'Linen Shirt', variant: 'Large', price: 4900 })

    // Two sizes are two lines, each at its own price, never one averaged figure.
    const mixed = await order(env, project.token, [
      { key: '0-0', qty: 1, variant: 'v-small' },
      { key: '0-0', qty: 1, variant: 'v-large' },
    ])
    expect(mixed.status).toBe(201)
    expect(((await mixed.json()) as { order: { total: number } }).order.total).toBe(4200 + 4900)
  })

  test('a price sent by the browser cannot change what an option costs', async () => {
    const { project, env } = await shop()
    const response = await order(env, project.token, [{ key: '0-0', qty: 1, variant: 'v-medium', price: 1 }])
    expect(response.status).toBe(201)
    expect(((await response.json()) as { order: { total: number } }).order.total).toBe(5800)
  })

  test('an unknown option is refused, not quietly swapped for the lowest price', async () => {
    const { project, env } = await shop()
    const unknown = await order(env, project.token, [{ key: '0-0', qty: 1, variant: 'v-xxl' }])
    expect(unknown.status).toBe(422)
    expect(((await unknown.json()) as { error: { code: string } }).error.code).toBe('variant_unknown')

    // Another product's option is not accepted here either.
    const foreign = await order(env, project.token, [{ key: '0-1', qty: 1, variant: 'v-large' }])
    expect(foreign.status).toBe(422)

    // A plain product takes no option at all.
    const plain = await order(env, project.token, [{ key: '0-1', qty: 1, variant: 'One size' }])
    expect(plain.status).toBe(422)
  })
})
