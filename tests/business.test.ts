import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { createProject, getProject } from '../src/worker/db'
import {
  createOwnerSession,
  deleteOwnerSessions,
  hasOwnerSession,
  ownerAccessKey,
  ownerCookieName,
} from '../src/worker/ownerAuth'
import { MemoryD1 } from './memoryD1'

const OWNER_SECRET = 'test-owner-secret'

const JSON_HEADERS = { 'content-type': 'application/json', origin: 'https://plattr.example' }

async function projectFor(vertical: 'shop' | 'salon' | 'professional' | 'restaurant') {
  const db = new MemoryD1() as unknown as D1Database
  const features =
    vertical === 'shop'
      ? ['catalog', 'ordering', 'delivery', 'offers']
      : vertical === 'salon'
        ? ['catalog', 'booking', 'offers']
        : vertical === 'professional'
          ? ['catalog', 'quote', 'booking']
          : ['catalog', 'ordering', 'booking']
  const project = await createProject(db, {
    name: 'Fern & Flint',
    contact: '',
    email: '',
    vertical,
    accent: '#2a5a8f',
    logo: 'FF',
    features,
    platforms: ['pwa'],
    plan: 'onetime',
  })
  const env = { DB: db, ASSETS: {} as Fetcher, OWNER_SECRET }
  const key = await ownerAccessKey(project.token, OWNER_SECRET)
  const login = await app.request(
    `https://plattr.example/p/${project.token}/dashboard/login`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key }).toString(),
    },
    env as never,
  )
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
  return { db, project, env, cookie }
}

async function post(env: { DB: D1Database; ASSETS: Fetcher }, token: string, path: string, body: unknown) {
  return app.request(`https://plattr.example/p/${token}/${path}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  }, env as never)
}

async function patch(env: { DB: D1Database; ASSETS: Fetcher }, token: string, path: string, body: unknown, cookie = '') {
  return app.request(`https://plattr.example/api/projects/${token}/${path}`, {
    method: 'PATCH',
    headers: { ...JSON_HEADERS, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }, env as never)
}

describe('customer orders', () => {
  test('creates a real order using server prices and moves it through the kitchen', async () => {
    const { db, project, env, cookie } = await projectFor('shop')
    const first = project.spec.menu[0].items[0]
    const second = project.spec.menu[0].items[1]
    const response = await post(env, project.token, 'orders', {
      customer: { name: 'Maya Rao', email: 'maya@example.com' },
      fulfilment: 'Pickup',
      items: [
        { key: '0-0', qty: 2, price: 1 },
        { key: '0-1', qty: 1, price: 1 },
      ],
    })
    expect(response.status).toBe(201)
    const created = (await response.json()) as { order: { id: string; number: string; status: string; total: number } }
    expect(created.order.status).toBe('new')
    expect(created.order.total).toBe(first.price * 2 + second.price)

    const stored = await getProject(db, project.token)
    expect(stored?.id).toBe(project.id)
    const order = await app.request(
      `https://plattr.example/p/${project.token}/orders/${created.order.id}`,
      {},
      env as never,
    )
    expect(order.status).toBe(200)
    const publicOrder = (await order.json()) as { order: { status: string; total: number; customer?: unknown } }
    expect(publicOrder.order.status).toBe('new')
    expect(publicOrder.order.total).toBe(created.order.total)
    expect(publicOrder.order.customer).toBeUndefined()

    const earlyJump = await patch(env, project.token, `orders/${created.order.id}`, { status: 'completed' }, cookie)
    expect(earlyJump.status).toBe(409)

    expect((await patch(env, project.token, `orders/${created.order.id}`, { status: 'preparing' }, cookie)).status).toBe(200)
    expect((await patch(env, project.token, `orders/${created.order.id}`, { status: 'ready' }, cookie)).status).toBe(200)
    expect((await patch(env, project.token, `orders/${created.order.id}`, { status: 'completed' }, cookie)).status).toBe(200)
    const closed = await app.request(
      `https://plattr.example/p/${project.token}/orders/${created.order.id}`,
      {},
      env as never,
    )
    expect(((await closed.json()) as { order: { status: string } }).order.status).toBe('completed')

    const dashboard = await app.request(
      `https://plattr.example/api/projects/${project.token}/dashboard`,
      { headers: { cookie } },
      env as never,
    )
    const body = (await dashboard.json()) as {
      modules: { orders: boolean; bookings: boolean; analytics: boolean }
      orders: { id: string; customer: { name: string }; items: unknown[] }[]
      customers: { name: string }[]
      summary: { orderValue: number }
    }
    expect(body.modules.orders).toBe(true)
    expect(body.modules.bookings).toBe(false)
    expect(body.orders[0].customer.name).toBe('Maya Rao')
    expect(body.orders[0].items.length).toBe(2)
    expect(body.customers.some((customer) => customer.name === 'Maya Rao')).toBe(true)
    expect(body.summary.orderValue).toBe(created.order.total)

    const queued = await db
      .prepare("SELECT kind, recipient, channel FROM notifications WHERE project_id = ? ORDER BY kind")
      .bind(project.id)
      .all<{ kind: string; recipient: string; channel: string }>()
    const kinds = queued.results.map((entry) => entry.kind)
    expect(kinds).toContain('order.created')
    expect(kinds).toContain('order.confirmation')
    expect(kinds).toContain('order.preparing')
    expect(queued.results.every((entry) => entry.channel === 'email')).toBe(true)
  })

  test('does not create orders from unknown items, bad quantities or disabled trades', async () => {
    const { project, env } = await projectFor('shop')
    const unknown = await post(env, project.token, 'orders', {
      customer: { name: 'Maya Rao', phone: '555 0100' },
      fulfilment: 'Pickup',
      items: [{ key: '40-9', qty: 1 }],
    })
    expect(unknown.status).toBe(422)
    const quantity = await post(env, project.token, 'orders', {
      customer: { name: 'Maya Rao', phone: '555 0100' },
      fulfilment: 'Pickup',
      items: [{ key: '0-0', qty: 0 }],
    })
    expect(quantity.status).toBe(422)
    const noContact = await post(env, project.token, 'orders', {
      customer: { name: 'Anonymous' },
      fulfilment: 'Pickup',
      items: [{ key: '0-0', qty: 1 }],
    })
    expect(noContact.status).toBe(422)

    const salon = await projectFor('salon')
    const disabled = await post(salon.env, salon.project.token, 'orders', {
      customer: { name: 'Maya Rao', phone: '555 0100' },
      fulfilment: 'Pickup',
      items: [{ key: '0-0', qty: 1 }],
    })
    expect(disabled.status).toBe(422)

    const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM orders WHERE project_id = ?')
      .bind(project.id)
      .first<{ count: number }>()
    expect(Number(row?.count)).toBe(0)
  })

  test('rejects cross-site writes', async () => {
    const { project, env } = await projectFor('shop')
    const response = await app.request(
      `https://plattr.example/p/${project.token}/orders`,
      {
        method: 'POST',
        headers: { ...JSON_HEADERS, origin: 'https://evil.example' },
        body: JSON.stringify({ customer: { name: 'Maya Rao', phone: '555 0100' }, items: [{ key: '0-0', qty: 1 }] }),
      },
      env as never,
    )
    expect(response.status).toBe(403)
  })
})

describe('customer bookings', () => {
  test('stores a service booking with a chosen staff member and lets the owner confirm it', async () => {
    const { db, project, env, cookie } = await projectFor('salon')
    const spec = { ...project.spec, staff: ['Maya', 'Sam'] }
    await db.prepare('UPDATE projects SET spec = ? WHERE id = ?').bind(JSON.stringify(spec), project.id).run()
    const service = project.spec.menu[0].items[0]
    const date = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const response = await post(env, project.token, 'bookings', {
      customer: { name: 'Priya Shah', phone: '+91 98765 43210' },
      date,
      slot: '10:00',
      party: 1,
      service: service.name,
      staff: 'Sam',
      note: 'First visit',
    })
    expect(response.status).toBe(201)
    const created = (await response.json()) as { booking: { id: string; status: string; date: string } }
    expect(created.booking.status).toBe('requested')
    expect(created.booking.date).toBe(date)

    const badStaff = await post(env, project.token, 'bookings', {
      customer: { name: 'Priya Shah', phone: '+91 98765 43210' },
      date,
      slot: '10:00',
      party: 1,
      service: service.name,
      staff: 'Not on the team',
    })
    expect(badStaff.status).toBe(422)

    const publicBooking = await app.request(
      `https://plattr.example/p/${project.token}/bookings/${created.booking.id}`,
      {},
      env as never,
    )
    expect(publicBooking.status).toBe(200)
    expect(((await publicBooking.json()) as { booking: { status: string } }).booking.status).toBe('requested')

    expect((await patch(env, project.token, `bookings/${created.booking.id}`, { status: 'confirmed' }, cookie)).status).toBe(200)
    expect((await patch(env, project.token, `bookings/${created.booking.id}`, { status: 'completed' }, cookie)).status).toBe(200)

    const dashboard = (await (
      await app.request(`https://plattr.example/api/projects/${project.token}/dashboard`, { headers: { cookie } }, env as never)
    ).json()) as { modules: { orders: boolean; bookings: boolean }; bookings: { staff: string; customer: { name: string } }[] }
    expect(dashboard.modules.orders).toBe(false)
    expect(dashboard.modules.bookings).toBe(true)
    expect(dashboard.bookings[0].staff).toBe('Sam')
    expect(dashboard.bookings[0].customer.name).toBe('Priya Shah')
  })

  test('rejects a past date and a service outside the catalogue', async () => {
    const { project, env } = await projectFor('salon')
    const response = await post(env, project.token, 'bookings', {
      customer: { name: 'Priya Shah', phone: '9876543210' },
      date: '2020-01-01',
      slot: '10:00',
      party: 1,
    })
    expect(response.status).toBe(422)
    const service = await post(env, project.token, 'bookings', {
      customer: { name: 'Priya Shah', phone: '9876543210' },
      date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      slot: '10:00',
      party: 1,
      service: 'Invented treatment',
    })
    expect(service.status).toBe(422)
  })
})

describe('enquiries and dashboard', () => {
  test('stores a professional enquiry and lets the owner reply and close it', async () => {
    const { project, env, cookie } = await projectFor('professional')
    const response = await post(env, project.token, 'enquiries', {
      name: 'Arun Mehta',
      contact: 'arun@example.com',
      message: 'I need help with annual accounts and payroll for six staff.',
    })
    expect(response.status).toBe(201)
    const created = (await response.json()) as { enquiry: { id: string; status: string } }
    expect(created.enquiry.status).toBe('new')

    expect((await patch(env, project.token, `enquiries/${created.enquiry.id}`, { status: 'replied' }, cookie)).status).toBe(200)
    expect((await patch(env, project.token, `enquiries/${created.enquiry.id}`, { status: 'closed' }, cookie)).status).toBe(200)

    const dashboard = await app.request(`https://plattr.example/p/${project.token}/dashboard`, { headers: { cookie } }, env as never)
    expect(dashboard.status).toBe(200)
    const html = await dashboard.text()
    expect(html).toContain('Arun Mehta')
    expect(html).toContain('annual accounts')
    expect(html).toContain('data-tab="settings"')
    expect(html).toContain('data-tab="enquiries"')
    expect(html).toContain('data-tab="categories"')
  })

  test('the public app token cannot authorize owner operations', async () => {
    const { project, env } = await projectFor('shop')
    const page = await app.request(`https://plattr.example/p/${project.token}/dashboard`, {}, env as never)
    expect(page.status).toBe(303)
    expect(page.headers.get('location')).toContain('/dashboard/login')
    const api = await app.request(`https://plattr.example/api/projects/${project.token}/dashboard`, {}, env as never)
    expect(api.status).toBe(401)
    const login = await app.request(`https://plattr.example/p/${project.token}/dashboard/login`, {}, env as never)
    expect(login.status).toBe(200)
    expect(await login.text()).toContain('Owner sign in')

    const signedIn = await app.request(
      `https://plattr.example/p/${project.token}/dashboard/login`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ key: await ownerAccessKey(project.token, OWNER_SECRET) }).toString(),
      },
      env as never,
    )
    expect(signedIn.status).toBe(303)
    const sessionCookie = signedIn.headers.get('set-cookie') ?? ''
    expect(sessionCookie).toContain(`${ownerCookieName(project.token)}=`)
    expect(sessionCookie).toContain('Path=/')
    expect(sessionCookie).toContain('HttpOnly')

    const created = await post(env, project.token, 'orders', {
      customer: { name: 'Maya Rao', email: 'maya@example.com' },
      fulfilment: 'Pickup',
      items: [{ key: '0-0', qty: 1 }],
    })
    const orderId = ((await created.json()) as { order: { id: string } }).order.id
    const withoutSession = await app.request(
      `https://plattr.example/api/projects/${project.token}/orders/${orderId}`,
      { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ status: 'preparing' }) },
      env as never,
    )
    expect(withoutSession.status).toBe(401)
  })

  test('dashboard modules follow the trade and settings update the customer app', async () => {
    const shop = await projectFor('shop')
    const html = await (
      await app.request(`https://plattr.example/p/${shop.project.token}/dashboard`, { headers: { cookie: shop.cookie } }, shop.env as never)
    ).text()
    expect(html).toContain('data-tab="orders"')
    expect(html).not.toContain('data-tab="bookings"')

    const settings = await app.request(
      `https://plattr.example/api/projects/${shop.project.token}/app-settings`,
      {
        method: 'PUT',
        headers: { ...JSON_HEADERS, cookie: shop.cookie },
        body: JSON.stringify({
          name: 'Fern & Flint',
          tagline: 'Stoneware from people we know.',
          hours: 'Wed–Sun 10:00–17:00',
          phone: '+1 555 0199',
          address: '12 Kiln Lane',
          email: 'hello@fern.example',
          category: 'Homeware shop',
          staff: 'Maya, Sam',
        }),
      },
      shop.env as never,
    )
    expect(settings.status).toBe(200)
    const updated = await getProject(shop.env.DB, shop.project.token)
    expect(updated?.spec.staff).toEqual(['Maya', 'Sam'])
    const appHtml = await (
      await app.request(`https://plattr.example/p/${shop.project.token}/app`, {}, shop.env as never)
    ).text()
    expect(appHtml).toContain('Stoneware from people we know.')
    expect(appHtml).toContain('12 Kiln Lane')
    expect(appHtml).toContain('Wed–Sun 10:00–17:00')
  })

  test('personalisation clears only content still marked as sample', async () => {
    const shop = await projectFor('shop')
    const before = await getProject(shop.env.DB, shop.project.token)
    const savedMenu = before!.spec.menu.map((section, index) =>
      index === 0
        ? { ...section, items: [{ ...section.items[0], name: 'Our own mug', desc: 'Made in the studio' }, ...section.items.slice(1)] }
        : section,
    )
    const catalogue = await app.request(
      `https://plattr.example/api/projects/${shop.project.token}/catalog`,
      {
        method: 'PUT',
        headers: { ...JSON_HEADERS, cookie: shop.cookie },
        body: JSON.stringify({ menu: savedMenu, offers: before!.spec.offers }),
      },
      shop.env as never,
    )
    expect(catalogue.status).toBe(200)

    const noConfirm = await app.request(
      `https://plattr.example/api/projects/${shop.project.token}/personalise/clear-samples`,
      { method: 'POST', headers: { ...JSON_HEADERS, cookie: shop.cookie }, body: JSON.stringify({}) },
      shop.env as never,
    )
    expect(noConfirm.status).toBe(422)

    const unauthenticated = await app.request(
      `https://plattr.example/api/projects/${shop.project.token}/personalise/clear-samples`,
      { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ confirm: 'remove-sample-content' }) },
      shop.env as never,
    )
    expect(unauthenticated.status).toBe(401)

    const cleared = await app.request(
      `https://plattr.example/api/projects/${shop.project.token}/personalise/clear-samples`,
      {
        method: 'POST',
        headers: { ...JSON_HEADERS, cookie: shop.cookie },
        body: JSON.stringify({ confirm: 'remove-sample-content' }),
      },
      shop.env as never,
    )
    expect(cleared.status).toBe(200)
    const after = await getProject(shop.env.DB, shop.project.token)
    // The catalogue was saved by the owner, so it is theirs and stays. The
    // server adds a stable item id to every entry; nothing the owner wrote is
    // changed apart from that.
    const withoutIds = (menu: typeof savedMenu) =>
      menu.map((section) => ({
        name: section.name,
        items: section.items.map((item) => {
          const { id: _id, ...rest } = item
          return rest
        }),
      }))
    expect(withoutIds(after?.spec.menu ?? [])).toEqual(withoutIds(savedMenu))
    expect(after?.spec.menu.every((section) => section.items.every((item) => item.id))).toBe(true)
    // Groups still flagged as examples are gone, including their copy.
    expect(after?.spec.offers).toEqual([])
    expect(after?.spec.story).toBe('')
    expect(after?.spec.phone).toBe('')
    expect(after?.spec.sampleContent?.menu).toBe(false)
    expect(after?.spec.sampleContent?.contact).toBe(false)
    expect(after?.spec.sampleContent?.story).toBe(false)
    expect(after?.spec.sampleContent?.offers).toBe(false)
    const appHtml = await (
      await app.request(`https://plattr.example/p/${shop.project.token}/app`, {}, shop.env as never)
    ).text()
    expect(appHtml).not.toContain(before!.spec.offers[0].title)
    expect(appHtml).not.toContain(before!.spec.story)
    expect(appHtml).toContain('Our own mug')
  })

  test('legacy projects get sample flags backfilled from the trade seed', async () => {
    const shop = await projectFor('shop')
    const original = (await getProject(shop.env.DB, shop.project.token))!
    const legacy = { ...original.spec }
    delete legacy.sampleContent
    await shop.env.DB.prepare('UPDATE projects SET spec = ? WHERE id = ?')
      .bind(JSON.stringify(legacy), original.id)
      .run()

    const filled = (await getProject(shop.env.DB, shop.project.token))!
    expect(filled.spec.sampleContent).toEqual({
      menu: true,
      contact: true,
      story: true,
      offers: true,
      team: true,
      staff: true,
      tagline: true,
    })

    // Persisted, not recomputed on every read.
    const stored = (await getProject(shop.env.DB, shop.project.token))!
    expect(stored.spec.sampleContent).toEqual(filled.spec.sampleContent)

    // One edited item makes the catalogue the owner's; untouched groups stay
    // sample and can still be cleared in bulk.
    const edited = { ...filled.spec, menu: filled.spec.menu.map((section, index) =>
      index === 0 ? { ...section, items: [{ ...section.items[0], name: 'Our own mug' }] } : section,
    ) }
    delete edited.sampleContent
    await shop.env.DB.prepare('UPDATE projects SET spec = ? WHERE id = ?')
      .bind(JSON.stringify(edited), original.id)
      .run()
    const repaired = (await getProject(shop.env.DB, shop.project.token))!
    expect(repaired.spec.sampleContent?.menu).toBe(false)
    expect(repaired.spec.sampleContent?.contact).toBe(true)
  })

  test('saving business details applies the new name, colour and logo everywhere', async () => {
    const shop = await projectFor('shop')
    const response = await app.request(
      `https://plattr.example/api/projects/${shop.project.token}/app-settings`,
      {
        method: 'PUT',
        headers: { ...JSON_HEADERS, cookie: shop.cookie },
        body: JSON.stringify({
          name: 'Kiln & Co',
          tagline: 'Our own stoneware.',
          story: 'Made two streets from the shop.',
          hours: 'Wed–Sun 10:00–17:00',
          phone: '+1 555 0122',
          address: '14 Kiln Lane',
          email: 'hello@kiln.example',
          category: 'Homeware shop',
          staff: 'Maya, Sam',
          accent: '#336644',
        }),
      },
      shop.env as never,
    )
    expect(response.status).toBe(200)
    const updated = await getProject(shop.env.DB, shop.project.token)
    expect(updated?.name).toBe('Kiln & Co')
    expect(updated?.logo).toBe('KC')
    expect(updated?.accent).toBe('#336644')
    expect(updated?.spec.name).toBe('Kiln & Co')
    expect(updated?.spec.sampleContent?.contact).toBe(false)
    expect(updated?.spec.sampleContent?.story).toBe(false)
    const appResponse = await app.request(
      `https://plattr.example/p/${shop.project.token}/app`,
      {},
      shop.env as never,
    )
    const appHtml = await appResponse.text()
    expect(appHtml).toContain('Kiln &amp; Co')
    expect(appHtml).toContain('Our own stoneware.')
    expect(appResponse.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(appHtml).toContain('name="robots" content="noindex, nofollow"')

    const indexed = await app.request(
      `https://plattr.example/api/projects/${shop.project.token}/app-settings`,
      {
        method: 'PUT',
        headers: { ...JSON_HEADERS, cookie: shop.cookie },
        body: JSON.stringify({ indexable: true }),
      },
      shop.env as never,
    )
    expect(indexed.status).toBe(200)
    const indexedApp = await app.request(
      `https://plattr.example/p/${shop.project.token}/app`,
      {},
      shop.env as never,
    )
    expect(indexedApp.headers.get('x-robots-tag')).toBe('index, follow')
    expect(await indexedApp.text()).not.toContain('name="robots" content="noindex, nofollow"')
  })

  test('the customer app carries real checkout, booking and enquiry controls', async () => {
    const restaurant = await projectFor('restaurant')
    const html = await (
      await app.request(`https://plattr.example/p/${restaurant.project.token}/app`, {}, restaurant.env as never)
    ).text()
    expect(html).toContain('data-checkout-name')
    expect(html).toContain('data-checkout-contact')
    expect(html).toContain('/orders')
    expect(html).toContain('data-book-name')
    expect(html).toContain('/bookings')
    expect(html).not.toContain('Demo checkout')
    expect(html).not.toContain('Demo form')
  })

  test('one business dashboard cannot read or mutate another business records', async () => {
    const db = new MemoryD1() as unknown as D1Database
    const create = (name: string) =>
      createProject(db, {
        name,
        contact: '',
        email: '',
        vertical: 'shop',
        accent: '#2a5a8f',
        logo: 'FF',
        features: ['catalog', 'ordering'],
        platforms: ['pwa'],
        plan: 'onetime',
      })
    const first = await create('Fern & Flint')
    const second = await create('Kiln & Co')
    const env = { DB: db, ASSETS: {} as Fetcher, OWNER_SECRET }
    const login = await app.request(
      `https://plattr.example/p/${second.token}/dashboard/login`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ key: await ownerAccessKey(second.token, OWNER_SECRET) }).toString(),
      },
      env as never,
    )
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
    const item = first.spec.menu[0].items[0]
    const order = await post(env, first.token, 'orders', {
      customer: { name: 'Maya Rao', email: 'maya@example.com' },
      fulfilment: 'Pickup',
      items: [{ key: '0-0', qty: 1 }],
    })
    expect(order.status).toBe(201)
    const created = (await order.json()) as { order: { id: string; total: number } }
    expect(created.order.total).toBe(item.price)

    const secondDashboard = await app.request(
      `https://plattr.example/api/projects/${second.token}/dashboard`,
      { headers: { cookie } },
      env as never,
    )
    const payload = (await secondDashboard.json()) as { orders: unknown[]; customers: unknown[] }
    expect(payload.orders).toEqual([])
    expect(payload.customers).toEqual([])

    const foreignMutation = await patch(env, second.token, `orders/${created.order.id}`, { status: 'preparing' }, cookie)
    expect(foreignMutation.status).toBe(404)
  })

  test('owner sessions expire after idleness and can be revoked everywhere', async () => {
    const shop = await projectFor('shop')
    const first = await createOwnerSession(shop.env.DB, shop.project.id)
    const second = await createOwnerSession(shop.env.DB, shop.project.id)
    expect(await hasOwnerSession(shop.env.DB, shop.project.id, first.id)).toBe(true)

    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    await shop.env.DB.prepare('UPDATE owner_sessions SET last_seen_at = ? WHERE id = ?')
      .bind(old, first.id)
      .run()
    expect(await hasOwnerSession(shop.env.DB, shop.project.id, first.id)).toBe(false)
    expect(await hasOwnerSession(shop.env.DB, shop.project.id, second.id)).toBe(true)

    await deleteOwnerSessions(shop.env.DB, shop.project.id)
    expect(await hasOwnerSession(shop.env.DB, shop.project.id, second.id)).toBe(false)
  })
})
