import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { dashboardData } from '../src/worker/business'
import { createProject } from '../src/worker/db'
import { MemoryD1 } from './memoryD1'

/**
 * Checkout acceptance without a payment provider: the same attempt makes one
 * order, the order keeps the option it was sent, and the money on the customer
 * side is the money in the record.
 */

const ORIGIN = 'https://plattr.example'

const MENU = [
  {
    name: 'Catalogue',
    items: [
      {
        name: 'Plain Card',
        desc: 'One option.',
        price: 750,
        variants: [{ id: 'vp-single', name: 'Default Title', price: 750, selected: true }],
      },
      {
        name: 'Linen Shirt',
        desc: 'Two options.',
        price: 4200,
        variants: [
          { id: 'vp-small', name: 'Small', price: 4200, selected: true },
          { id: 'vp-large', name: 'Large', price: 4800 },
        ],
      },
    ],
  },
]

async function shop(deliveryFee?: number) {
  const db = new MemoryD1() as unknown as D1Database
  const project = await createProject(db, {
    name: 'Present & Correct',
    contact: '',
    email: '',
    vertical: 'shop',
    accent: '#1b1b1b',
    logo: 'PC',
    features: ['catalog', 'ordering'],
    platforms: ['pwa'],
    plan: 'onetime',
    site: {
      menu: MENU,
      currency: 'GBP',
      website: 'https://www.presentandcorrect.com',
      ...(deliveryFee === undefined
        ? {}
        : { fulfilment: { options: ['Pickup', 'Delivery'], source: 'owner' as const, deliveryFee } }),
    },
  })
  return { db, project, env: { DB: db, ASSETS: {} as Fetcher } }
}

type Line = { key: string; qty: number; variant?: string }

async function place(
  project: { token: string },
  env: unknown,
  items: Line[],
  requestId?: string,
  fulfilment = 'Pickup',
) {
  const response = await app.request(
    `${ORIGIN}/p/${project.token}/orders`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        customer: { name: 'Maya Rao', email: 'maya@example.com' },
        fulfilment,
        items,
        ...(requestId ? { requestId } : {}),
      }),
    },
    env as never,
  )
  const body = (await response.json()) as { order?: { id: string; total: number; currency: string }; error?: { code: string } }
  return { status: response.status, order: body.order, error: body.error }
}

async function readOrder(project: { token: string }, env: unknown, id: string) {
  const response = await app.request(`${ORIGIN}/p/${project.token}/orders/${id}`, {}, env as never)
  return (await response.json()) as {
    order: { total: number; currency: string; items: { name: string; variant: string; variantId: string; price: number; qty: number }[] }
  }
}

describe('a checkout attempt is placed once', () => {
  test('sending the same attempt twice returns the one order it made', async () => {
    const { db, project, env } = await shop()
    const first = await place(project, env, [{ key: '0-0', qty: 1, variant: 'vp-single' }], 'attempt-aaaa1111')
    expect(first.status).toBe(201)
    const again = await place(project, env, [{ key: '0-0', qty: 1, variant: 'vp-single' }], 'attempt-aaaa1111')
    expect(again.status).toBe(201)
    expect(again.order?.id).toBe(first.order?.id)
    expect(again.order?.total).toBe(750)

    const data = await dashboardData(db, project)
    expect(data.orders).toHaveLength(1)
  })

  test('a new attempt is a new order, even for the same bag', async () => {
    const { project, env } = await shop()
    const first = await place(project, env, [{ key: '0-1', qty: 1, variant: 'vp-large' }], 'attempt-bbbb2222')
    const second = await place(project, env, [{ key: '0-1', qty: 1, variant: 'vp-large' }], 'attempt-cccc3333')
    expect(second.order?.id).not.toBe(first.order?.id)
  })

  test('an unusable attempt reference is ignored, not refused', async () => {
    const { project, env } = await shop()
    const first = await place(project, env, [{ key: '0-0', qty: 1, variant: 'vp-single' }], 'x')
    const second = await place(project, env, [{ key: '0-0', qty: 1, variant: 'vp-single' }], 'x')
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(second.order?.id).not.toBe(first.order?.id)
  })
})

describe('the customer side and the record agree', () => {
  test('the response total is the sum the record keeps, in the build currency', async () => {
    const { project, env } = await shop()
    const placed = await place(project, env, [
      { key: '0-0', qty: 1, variant: 'vp-single' },
      { key: '0-1', qty: 2, variant: 'vp-large' },
    ])
    expect(placed.status).toBe(201)
    // 750 + 2 × 4800. Pickup adds no delivery fee.
    expect(placed.order?.total).toBe(10350)
    expect(placed.order?.currency).toBe('GBP')

    const order = placed.order!
    const stored = await readOrder(project, env, order.id)
    expect(stored.order.total).toBe(order.total)
    expect(stored.order.currency).toBe('GBP')
    expect(stored.order.items).toEqual([
      expect.objectContaining({ name: 'Plain Card', variant: 'Default Title', variantId: 'vp-single', price: 750, qty: 1 }),
      expect.objectContaining({ name: 'Linen Shirt', variant: 'Large', variantId: 'vp-large', price: 4800, qty: 2 }),
    ])
    const sum = stored.order.items.reduce((total, line) => total + line.price * line.qty, 0)
    expect(sum).toBe(stored.order.total)
  })

  test('the option chosen before adding is the option priced', async () => {
    const { project, env } = await shop()
    const small = await place(project, env, [{ key: '0-1', qty: 1, variant: 'vp-small' }])
    const large = await place(project, env, [{ key: '0-1', qty: 1, variant: 'vp-large' }])
    expect(small.order?.total).toBe(4200)
    expect(large.order?.total).toBe(4800)
  })

  test('a delivered bag carries no fee the business never set', async () => {
    const { project, env } = await shop()
    const placed = await place(project, env, [{ key: '0-0', qty: 1, variant: 'vp-single' }], undefined, 'Delivery')
    // The platform used to add 2.99 to every delivery. A fee is a business
    // fact: without one stated by the source or set by the owner, the customer
    // is charged the catalogue total and nothing else.
    expect(placed.order?.total).toBe(750)
    const stored = await readOrder(project, env, placed.order!.id)
    expect(stored.order.total).toBe(750)
  })

  test('a delivery fee the owner set is charged on both sides', async () => {
    const { project, env } = await shop(499)
    const placed = await place(project, env, [{ key: '0-0', qty: 1, variant: 'vp-single' }], undefined, 'Delivery')
    expect(placed.order?.total).toBe(1249)
    const stored = await readOrder(project, env, placed.order!.id)
    expect(stored.order.total).toBe(1249)
  })
})

describe('what is no longer on sale is refused', () => {
  test('a product removed since the bag was saved', async () => {
    const { project, env } = await shop()
    const placed = await place(project, env, [{ key: '0-9', qty: 1 }])
    expect(placed.status).toBe(422)
    expect(placed.error?.code).toBe('item_unknown')
  })

  test('an option removed since it was chosen', async () => {
    const { project, env } = await shop()
    const placed = await place(project, env, [{ key: '0-1', qty: 1, variant: 'vp-medium' }])
    expect(placed.status).toBe(422)
    expect(placed.error?.code).toBe('variant_unknown')
  })

  test('an option named for a product that has none', async () => {
    const { db, env } = await shop()
    // A draft build with no options at all, as an unimported menu would be.
    const bare = await createProject(db, {
      name: 'Bare Shop',
      contact: '',
      email: '',
      vertical: 'shop',
      accent: '#1b1b1b',
      logo: 'BS',
      features: ['catalog', 'ordering'],
      platforms: ['pwa'],
      plan: 'onetime',
      site: { menu: [{ name: 'Catalogue', items: [{ name: 'Pencil', desc: 'HB.', price: 250 }] }], currency: 'GBP' },
    })
    const placed = await place(bare, env, [{ key: '0-0', qty: 1, variant: 'vp-anything' }])
    expect(placed.status).toBe(422)
    expect(placed.error?.code).toBe('variant_unknown')
  })

  test('a quantity outside the allowed range', async () => {
    const { project, env } = await shop()
    const placed = await place(project, env, [{ key: '0-0', qty: 21, variant: 'vp-single' }])
    expect(placed.status).toBe(422)
    expect(placed.error?.code).toBe('qty_invalid')
  })
})
