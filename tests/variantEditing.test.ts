import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { createProject } from '../src/worker/db'
import { sanitizeMenu } from '../src/worker/pricing'
import { MemoryD1 } from './memoryD1'
import { ownerCookieFor } from './ownerCookie'

const ORIGIN = 'https://plattr.example'
const JSON_HEADERS = { 'content-type': 'application/json', origin: ORIGIN }

const MENU = [
  {
    name: 'Shirts',
    items: [
      {
        id: 'itm_aaaaaaaa',
        sourceId: 'gid://shopify/Product/9001',
        name: 'Linen Shirt',
        desc: 'Washed linen.',
        price: 4200,
        variants: [
          { id: 'gid://shopify/ProductVariant/11', name: 'Small', price: 4200, currency: 'GBP', selected: true },
          { id: 'gid://shopify/ProductVariant/12', name: 'Medium', price: 5800, currency: 'GBP' },
        ],
      },
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
  return { db, project, env, cookie: await ownerCookieFor(db, project) }
}

function save(env: { DB: D1Database; ASSETS: Fetcher }, token: string, cookie: string, menu: unknown) {
  return app.request(
    `${ORIGIN}/api/projects/${token}/catalog`,
    { method: 'PUT', headers: { ...JSON_HEADERS, cookie }, body: JSON.stringify({ menu }) },
    env as never,
  )
}

function order(env: { DB: D1Database; ASSETS: Fetcher }, token: string, items: unknown[]) {
  return app.request(
    `${ORIGIN}/p/${token}/orders`,
    {
      method: 'POST',
      headers: { ...JSON_HEADERS },
      body: JSON.stringify({ customer: { name: 'Maya Rao', email: 'maya@example.com' }, fulfilment: 'Pickup', items }),
    },
    env as never,
  )
}

describe('editing product variants', () => {
  test('renaming, repricing, adding, reordering and defaulting all persist', async () => {
    const { project, env, cookie } = await shop()
    const edited = [
      {
        name: 'Shirts',
        items: [
          {
            ...MENU[0].items[0],
            variants: [
              { id: 'gid://shopify/ProductVariant/11', name: 'Small / Ecru', price: 4500, currency: 'GBP' },
              { id: 'gid://shopify/ProductVariant/12', name: 'Medium / Ecru', price: 5800, currency: 'GBP', selected: true },
              { id: 'var_local_1', name: 'Large / Ink', price: 6200, currency: 'GBP' },
            ],
            optionGroups: [
              { name: 'Size', options: ['Small', 'Medium', 'Large'] },
              { name: 'Colour', options: ['Ecru', 'Ink'] },
            ],
          },
        ],
      },
    ]
    const response = await save(env, project.token, cookie, edited)
    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      menu: { items: { sourceId?: string; optionGroups?: unknown[]; variants?: { id?: string; name: string; price: number; selected?: boolean }[] }[] }[]
    }
    const item = payload.menu[0].items[0]
    expect(item.sourceId).toBe('gid://shopify/Product/9001')
    expect(item.variants?.map((variant) => variant.name)).toEqual(['Small / Ecru', 'Medium / Ecru', 'Large / Ink'])
    expect(item.variants?.map((variant) => variant.id)).toEqual([
      'gid://shopify/ProductVariant/11',
      'gid://shopify/ProductVariant/12',
      'var_local_1',
    ])
    expect(item.variants?.find((variant) => variant.selected)?.name).toBe('Medium / Ecru')
    expect(item.optionGroups).toHaveLength(2)

    // Reload: a fresh read of the app and the editor must show the saved data.
    const html = await (await app.request(`${ORIGIN}/p/${project.token}/app`, {}, env as never)).text()
    expect(html).toContain('Small / Ecru')
    expect(html).toContain('Large / Ink')
    expect(html).toContain('gid://shopify/ProductVariant/12')
    expect(html).toContain('6200')
    const editor = await (await app.request(`${ORIGIN}/p/${project.token}/edit`, { headers: { cookie } }, env as never)).text()
    expect(editor).toContain('Small / Ecru')
    expect(editor).toContain('Option groups')
  })

  test('structured option values drive selection and survive reload', async () => {
    const { project, env, cookie } = await shop()
    const structured = [
      {
        name: 'Shirts',
        items: [
          {
            ...MENU[0].items[0],
            optionGroups: [
              { name: 'Size', options: ['Small', 'Medium'] },
              { name: 'Colour', options: ['Ecru', 'Ink'] },
            ],
            variants: [
              { id: 'gid://shopify/ProductVariant/11', name: 'Small / Ecru', price: 4200, currency: 'GBP', values: { Size: 'Small', Colour: 'Ecru' }, selected: true },
              { id: 'gid://shopify/ProductVariant/12', name: 'Medium / Ink', price: 5800, currency: 'GBP', values: { Size: 'Medium', Colour: 'Ink' } },
              { id: 'gid://shopify/ProductVariant/13', name: 'Medium / Ecru', price: 6100, currency: 'GBP', values: { Size: 'Medium', Colour: 'Ecru' }, available: false },
              { id: 'gid://shopify/ProductVariant/14', name: 'Broken', price: 7000, currency: 'GBP', values: { Size: 'Giant', Colour: 'Ink' } },
            ],
          },
        ],
      },
    ]
    const response = await save(env, project.token, cookie, structured)
    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      menu: { items: { variants?: { id?: string; values?: Record<string, string>; available?: boolean }[]; optionGroups?: unknown[] }[] }[]
    }
    const item = payload.menu[0].items[0]
    expect(item.optionGroups).toHaveLength(2)
    expect(item.variants?.find((variant) => variant.id === 'gid://shopify/ProductVariant/12')?.values).toEqual({ Size: 'Medium', Colour: 'Ink' })
    expect(item.variants?.find((variant) => variant.id === 'gid://shopify/ProductVariant/13')?.available).toBe(false)
    // A value absent from its group is dropped, not invented into the matrix.
    expect(item.variants?.find((variant) => variant.id === 'gid://shopify/ProductVariant/14')?.values).toEqual({ Colour: 'Ink' })

    const html = await (await app.request(`${ORIGIN}/p/${project.token}/app`, {}, env as never)).text()
    expect(html).toContain('"values":{"Size":"Small","Colour":"Ecru"}')
    expect(html).toContain('"optionGroups":[{"name":"Size"')
    const editor = await (await app.request(`${ORIGIN}/p/${project.token}/edit`, { headers: { cookie } }, env as never)).text()
    expect(editor).toContain('data-variant-value')

    const blocked = await order(env, project.token, [{ key: '0-0', qty: 1, variant: 'gid://shopify/ProductVariant/13' }])
    expect(blocked.status).toBe(422)
    const allowed = await order(env, project.token, [{ key: '0-0', qty: 1, variant: 'gid://shopify/ProductVariant/12' }])
    expect(allowed.status).toBe(201)
    expect(((await allowed.json()) as { order: { total: number } }).order.total).toBe(5800)
  })

  test('structured defaults, stock, images and partial matrices keep real variant data', async () => {
    const { project, env, cookie } = await shop()
    const image = { id: 'med_0123456789abcdef', width: 800, height: 800 }
    const edited = [
      {
        name: 'Shirts',
        items: [
          {
            ...MENU[0].items[0],
            optionGroups: [
              { name: 'Size', options: ['Small', 'Medium', 'Large'] },
              { name: 'Colour', options: ['Ecru', 'Ink'] },
            ],
            variants: [
              { id: 'gid://shopify/ProductVariant/11', name: 'Small / Ecru', price: 4500, currency: 'GBP', values: { Size: 'Small', Colour: 'Ecru' } },
              { id: 'gid://shopify/ProductVariant/12', name: 'Medium / Ink', price: 6300, currency: 'GBP', selected: true, media: image, values: { Size: 'Medium', Colour: 'Ink' } },
              { id: 'gid://shopify/ProductVariant/13', name: 'Medium / Ecru', price: 6100, currency: 'GBP', available: false, values: { Size: 'Medium', Colour: 'Ecru' } },
              { id: 'gid://shopify/ProductVariant/14', name: 'Large / Ink', price: 7000, currency: 'GBP', values: { Size: 'Large' } },
            ],
          },
        ],
      },
    ]
    const response = await save(env, project.token, cookie, edited)
    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      menu: { items: { variants?: { id?: string; price: number; selected?: boolean; available?: boolean; media?: { id: string }; values?: Record<string, string> }[]; optionGroups?: unknown[] }[] }[]
    }
    const item = payload.menu[0].items[0]
    expect(item.optionGroups).toHaveLength(2)
    expect(item.variants?.map((variant) => variant.id)).toEqual([
      'gid://shopify/ProductVariant/11',
      'gid://shopify/ProductVariant/12',
      'gid://shopify/ProductVariant/13',
      'gid://shopify/ProductVariant/14',
    ])
    expect(item.variants?.filter((variant) => variant.selected).map((variant) => variant.id)).toEqual(['gid://shopify/ProductVariant/12'])
    expect(item.variants?.find((variant) => variant.id === 'gid://shopify/ProductVariant/12')?.media?.id).toBe(image.id)
    expect(item.variants?.find((variant) => variant.id === 'gid://shopify/ProductVariant/13')?.available).toBe(false)
    // A partial row keeps only the value it really has; no group matrix is invented.
    expect(item.variants?.find((variant) => variant.id === 'gid://shopify/ProductVariant/14')?.values).toEqual({ Size: 'Large' })

    const html = await (await app.request(`${ORIGIN}/p/${project.token}/app`, {}, env as never)).text()
    expect(html).toContain('"selected":true')
    expect(html).toContain('"available":false')
    expect(html).toContain(`"media":{"id":"${image.id}"`)
    expect(html).toContain('"values":{"Size":"Medium","Colour":"Ink"}')
  })

  test('orders use the edited variant price and preserve the Shopify variant id', async () => {
    const { project, env, cookie } = await shop()
    await save(env, project.token, cookie, [
      {
        name: 'Shirts',
        items: [
          {
            ...MENU[0].items[0],
            variants: [
              { id: 'gid://shopify/ProductVariant/11', name: 'Small / Ecru', price: 4500, currency: 'GBP' },
              { id: 'gid://shopify/ProductVariant/12', name: 'Medium / Ecru', price: 6100, currency: 'GBP', selected: true },
            ],
          },
        ],
      },
    ])
    const response = await order(env, project.token, [
      { key: '0-0', qty: 2, variant: 'gid://shopify/ProductVariant/12' },
    ])
    expect(response.status).toBe(201)
    const created = (await response.json()) as { order: { total: number; id: string } }
    expect(created.order.total).toBe(12200)
    const read = await app.request(`${ORIGIN}/p/${project.token}/orders/${created.order.id}`, {}, env as never)
    const stored = (await read.json()) as { order: { items: { variant: string; variantId: string; price: number }[] } }
    expect(stored.order.items[0]).toMatchObject({
      variant: 'Medium / Ecru',
      variantId: 'gid://shopify/ProductVariant/12',
      price: 6100,
    })
  })

  test('zero, one and many variants survive normalisation', () => {
    const base = { name: 'P', desc: '', price: 1000 }
    const [none] = sanitizeMenu([{ name: 'S', items: [{ ...base, name: 'Plain' }] }]).at(0)!.items
    expect(none.variants).toBeUndefined()

    const [one] = sanitizeMenu([
      { name: 'S', items: [{ ...base, name: 'One', variants: [{ id: 'v1', name: 'Only', price: 1200, media: { id: 'med_0123456789abcdef', width: 800, height: 800 } }] }] },
    ]).at(0)!.items
    expect(one.variants).toHaveLength(1)
    expect(one.variants?.[0].media?.id).toBe('med_0123456789abcdef')

    const [many] = sanitizeMenu([
      {
        name: 'S',
        items: [
          {
            ...base,
            name: 'Many',
            variants: [
              { id: 'v1', name: 'A', price: 1000 },
              { id: 'v2', name: 'B', price: 2000, selected: true },
            ],
          },
        ],
      },
    ]).at(0)!.items
    expect(many.variants?.map((variant) => variant.id)).toEqual(['v1', 'v2'])
    expect(many.variants?.filter((variant) => variant.selected)).toHaveLength(1)
  })
})
