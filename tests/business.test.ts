import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { createProject, getProject } from '../src/worker/db'
import { MemoryD1 } from './memoryD1'

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
  return { db, project, env: { DB: db, ASSETS: {} as Fetcher } }
}

async function post(env: { DB: D1Database; ASSETS: Fetcher }, token: string, path: string, body: unknown) {
  return app.request(`https://plattr.example/p/${token}/${path}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  }, env as never)
}

async function patch(env: { DB: D1Database; ASSETS: Fetcher }, token: string, path: string, body: unknown) {
  return app.request(`https://plattr.example/api/projects/${token}/${path}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  }, env as never)
}

describe('customer orders', () => {
  test('creates a real order using server prices and moves it through the kitchen', async () => {
    const { db, project, env } = await projectFor('shop')
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

    const earlyJump = await patch(env, project.token, `orders/${created.order.id}`, { status: 'completed' })
    expect(earlyJump.status).toBe(409)

    expect((await patch(env, project.token, `orders/${created.order.id}`, { status: 'preparing' })).status).toBe(200)
    expect((await patch(env, project.token, `orders/${created.order.id}`, { status: 'ready' })).status).toBe(200)
    expect((await patch(env, project.token, `orders/${created.order.id}`, { status: 'completed' })).status).toBe(200)
    const closed = await app.request(
      `https://plattr.example/p/${project.token}/orders/${created.order.id}`,
      {},
      env as never,
    )
    expect(((await closed.json()) as { order: { status: string } }).order.status).toBe('completed')

    const dashboard = await app.request(
      `https://plattr.example/api/projects/${project.token}/dashboard`,
      {},
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
    const { db, project, env } = await projectFor('salon')
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

    expect((await patch(env, project.token, `bookings/${created.booking.id}`, { status: 'confirmed' })).status).toBe(200)
    expect((await patch(env, project.token, `bookings/${created.booking.id}`, { status: 'completed' })).status).toBe(200)

    const dashboard = (await (
      await app.request(`https://plattr.example/api/projects/${project.token}/dashboard`, {}, env as never)
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
    const { project, env } = await projectFor('professional')
    const response = await post(env, project.token, 'enquiries', {
      name: 'Arun Mehta',
      contact: 'arun@example.com',
      message: 'I need help with annual accounts and payroll for six staff.',
    })
    expect(response.status).toBe(201)
    const created = (await response.json()) as { enquiry: { id: string; status: string } }
    expect(created.enquiry.status).toBe('new')

    expect((await patch(env, project.token, `enquiries/${created.enquiry.id}`, { status: 'replied' })).status).toBe(200)
    expect((await patch(env, project.token, `enquiries/${created.enquiry.id}`, { status: 'closed' })).status).toBe(200)

    const dashboard = await app.request(`https://plattr.example/p/${project.token}/dashboard`, {}, env as never)
    expect(dashboard.status).toBe(200)
    const html = await dashboard.text()
    expect(html).toContain('Arun Mehta')
    expect(html).toContain('annual accounts')
    expect(html).toContain('data-tab="settings"')
    expect(html).toContain('data-tab="enquiries"')
    expect(html).toContain('data-tab="categories"')
  })

  test('dashboard modules follow the trade and settings update the customer app', async () => {
    const shop = await projectFor('shop')
    const html = await (
      await app.request(`https://plattr.example/p/${shop.project.token}/dashboard`, {}, shop.env as never)
    ).text()
    expect(html).toContain('data-tab="orders"')
    expect(html).not.toContain('data-tab="bookings"')

    const settings = await app.request(
      `https://plattr.example/api/projects/${shop.project.token}/app-settings`,
      {
        method: 'PUT',
        headers: JSON_HEADERS,
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
})
