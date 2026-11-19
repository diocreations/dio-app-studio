import { describe, expect, test } from 'bun:test'
import app from '../src/worker/index'
import { createProject, getProject, type Project } from '../src/worker/db'
import { ownerAccessKey } from '../src/worker/ownerAuth'
import { decryptJson, hmacHex } from '../src/worker/payments/crypto'
import {
  disconnectConnection,
  paymentCapability,
  paymentDashboard,
  refundTransaction,
  saveConnection,
  startCheckout,
  testConnection,
  verifyRazorpayCheckout,
} from '../src/worker/payments/service'
import { renderApp } from '../src/worker/app'
import { createBooking, createOrder } from '../src/worker/business'
import { MemoryD1 } from './memoryD1'

const OWNER_SECRET = 'payments-owner-secret'
const ORIGIN = 'https://plattr.example'
const VAULT_KEY = btoa(String.fromCharCode(...new Array(32).fill(7)))
const STRIPE_KEY = 'pk_test_51ExamplePublishableKey'
const STRIPE_SECRET = 'sk_test_51ExampleSecretKeyValue'
const STRIPE_WEBHOOK = 'whsec_test_example_secret'

type Env = {
  DB: D1Database
  ASSETS: Fetcher
  OWNER_SECRET: string
  PAYMENT_ENCRYPTION_KEY?: string
}

async function setup(vertical: 'restaurant' | 'shop' | 'finance' = 'restaurant') {
  const db = new MemoryD1() as unknown as D1Database
  const project = await createProject(db, {
    name: 'Fern & Flint',
    contact: '',
    email: '',
    vertical,
    accent: '#2a5a8f',
    logo: 'FF',
    features: vertical === 'finance' ? ['catalog'] : ['catalog', 'ordering', 'booking'],
    platforms: ['pwa'],
    plan: 'onetime',
  })
  const env: Env = { DB: db, ASSETS: {} as Fetcher, OWNER_SECRET, PAYMENT_ENCRYPTION_KEY: VAULT_KEY }
  const key = await ownerAccessKey(project.token, OWNER_SECRET)
  const login = await app.request(
    `${ORIGIN}/p/${project.token}/dashboard/login`,
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

async function api(
  env: Env,
  token: string,
  method: string,
  path: string,
  options: { body?: unknown; cookie?: string; origin?: string | null } = {},
) {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  if (options.cookie) headers.cookie = options.cookie
  if (options.origin !== null) headers.origin = options.origin ?? ORIGIN
  return app.request(
    `${ORIGIN}/api/projects/${token}/${path}`,
    { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) },
    env as never,
  )
}

async function customer(
  env: Env,
  token: string,
  path: string,
  body: unknown,
  method = 'POST',
) {
  return app.request(
    `${ORIGIN}/p/${token}/${path}`,
    { method, headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(body) },
    env as never,
  )
}

function stripeMock(overrides: { status?: number; amount?: number; currency?: string; refundStatus?: string } = {}) {
  const calls: { url: string; body: string }[] = []
  let sessionSequence = 0
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = typeof init?.body === 'string' ? init.body : ''
    calls.push({ url, body })
    if (url.endsWith('/checkout/sessions')) {
      const amount = overrides.amount ?? 0
      return new Response(
        JSON.stringify({
          id: `cs_test_${(sessionSequence += 1)}`,
          url: 'https://checkout.stripe.com/c/pay/cs_test_live',
          amount_total: amount,
          currency: overrides.currency ?? 'usd',
        }),
        { status: overrides.status ?? 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (url.endsWith('/refunds')) {
      return new Response(JSON.stringify({ id: 're_test_1', status: overrides.refundStatus ?? 'succeeded' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.endsWith('/balance')) {
      return new Response(JSON.stringify({ available: [] }), {
        status: overrides.status ?? 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  return { impl, calls }
}

function stripeEvent(options: {
  transactionId: string
  amount?: number
  currency?: string
  type?: string
  paymentStatus?: string
  eventId?: string
}): { body: string; headers: Headers } {
  const event = {
    id: options.eventId ?? 'evt_test_1',
    type: options.type ?? 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123',
        payment_status: options.paymentStatus ?? 'paid',
        payment_intent: 'pi_test_123',
        amount_total: options.amount,
        currency: options.currency ?? 'usd',
        metadata: { plattr_tx: options.transactionId },
      },
    },
  }
  const body = JSON.stringify(event)
  return { body, headers: new Headers() }
}

async function signedStripe(body: string, secret = STRIPE_WEBHOOK) {
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await hmacHex(secret, `${timestamp}.${body}`)
  return new Headers({ 'stripe-signature': `t=${timestamp},v1=${signature}` })
}

async function connectStripe(env: Env, project: Project) {
  return saveConnection(env.DB, project, env, 'stripe', {
    keyId: STRIPE_KEY,
    keySecret: STRIPE_SECRET,
    webhookSecret: STRIPE_WEBHOOK,
    mode: 'test',
  })
}

async function makeOrder(env: Env, project: Project) {
  let key = ''
  project.spec.menu.forEach((section, sectionIndex) => {
    section.items.forEach((item, itemIndex) => {
      if (!key && item.price > 0) key = `${sectionIndex}-${itemIndex}`
    })
  })
  if (!key) throw new Error('test catalogue has no priced item')
  return createOrder(env.DB, project, {
    customer: { name: 'Maya Rao', email: 'maya@example.com' },
    fulfilment: 'Pickup',
    items: [{ key, qty: 1 }],
  })
}

async function signedWebhook(
  env: Env,
  project: Project,
  body: string,
  headers: Headers,
) {
  return app.request(
    `${ORIGIN}/p/${project.token}/payments/webhook/stripe`,
    { method: 'POST', headers, body },
    env as never,
  )
}

describe('payment credentials', () => {
  test('saves encrypted Stripe credentials and never returns a secret', async () => {
    const { db, project, env, cookie } = await setup()
    const response = await api(env, project.token, 'PUT', 'payments/connections/stripe', {
      cookie,
      body: { keyId: STRIPE_KEY, keySecret: STRIPE_SECRET, webhookSecret: STRIPE_WEBHOOK, mode: 'test' },
    })
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { connection: Record<string, unknown> }
    expect(payload.connection.keyId).toBe(STRIPE_KEY)
    expect(payload.connection.hasKeySecret).toBe(true)
    expect(JSON.stringify(payload)).not.toContain(STRIPE_SECRET)

    const row = await db
      .prepare('SELECT secrets, mode FROM payment_connections WHERE project_id = ?')
      .bind(project.id)
      .first<{ secrets: string; mode: string }>()
    expect(row?.secrets.startsWith('v1.')).toBe(true)
    expect(row?.secrets).not.toContain(STRIPE_SECRET)
    expect(row?.secrets).not.toContain(STRIPE_WEBHOOK)

    const decrypted = await decryptJson<{ keySecret: string }>(
      Uint8Array.from(atob(VAULT_KEY), (char) => char.charCodeAt(0)),
      project.id,
      'stripe',
      row!.secrets,
    )
    expect(decrypted?.keySecret).toBe(STRIPE_SECRET)

    const dashboard = await fetchDashboard(env, project.token, cookie)
    expect(dashboard).toContain('Payment gateways')
    expect(dashboard).toContain(STRIPE_KEY)
    expect(dashboard).not.toContain(STRIPE_SECRET)
    expect(dashboard).not.toContain(STRIPE_WEBHOOK)
  })

  test('refuses anonymous reads, foreign origins and mismatched modes', async () => {
    const { project, env, cookie } = await setup()
    expect((await api(env, project.token, 'GET', 'payments', { origin: null })).status).toBe(401)
    expect(
      (
        await api(env, project.token, 'PUT', 'payments/connections/stripe', {
          cookie,
          origin: 'https://evil.example',
          body: { keyId: STRIPE_KEY, keySecret: STRIPE_SECRET, webhookSecret: STRIPE_WEBHOOK, mode: 'test' },
        })
      ).status,
    ).toBe(403)
    const mismatched = await api(env, project.token, 'PUT', 'payments/connections/stripe', {
      cookie,
      body: {
        keyId: 'pk_live_123456',
        keySecret: 'sk_live_123456789012',
        webhookSecret: 'whsec_test_example_secret',
        mode: 'test',
      },
    })
    expect(mismatched.status).toBe(422)
  })

  test('Razorpay requires an INR catalogue and a webhook secret', async () => {
    const { project, env, cookie } = await setup()
    const currency = await api(env, project.token, 'PUT', 'payments/connections/razorpay', {
      cookie,
      body: {
        keyId: 'rzp_test_abc123',
        keySecret: 'razorpay-test-secret-value',
        webhookSecret: 'razorpay-webhook-secret',
        mode: 'test',
      },
    })
    expect(currency.status).toBe(422)
    expect(((await currency.json()) as { error: { code: string } }).error.code).toBe('currency_unsupported')

    const missing = await api(env, project.token, 'PUT', 'payments/connections/stripe', {
      cookie,
      body: { keyId: STRIPE_KEY, keySecret: STRIPE_SECRET, webhookSecret: '', mode: 'test' },
    })
    expect(missing.status).toBe(422)
  })

  test('refuses to store anything without a vault key', async () => {
    const { project, env } = await setup()
    const noKey = { ...env, PAYMENT_ENCRYPTION_KEY: undefined }
    await expect(
      saveConnection(noKey.DB, project, noKey, 'stripe', {
        keyId: STRIPE_KEY,
        keySecret: STRIPE_SECRET,
        webhookSecret: STRIPE_WEBHOOK,
        mode: 'test',
      }),
    ).rejects.toMatchObject({ code: 'vault_unavailable', status: 503 })
  })

  test('keeps ciphertext bound to its project and provider', async () => {
    const { db, project, env } = await setup()
    const connection = await connectStripe(env, project)
    const row = await db
      .prepare('SELECT secrets FROM payment_connections WHERE project_id = ?')
      .bind(project.id)
      .first<{ secrets: string }>()
    const key = Uint8Array.from(atob(VAULT_KEY), (char) => char.charCodeAt(0))
    expect(await decryptJson(key, project.id, 'razorpay', row!.secrets)).toBeNull()
    expect(await decryptJson(key, 'another-project', 'stripe', row!.secrets)).toBeNull()
    expect(connection.provider).toBe('stripe')
  })

  test('verifies credentials through the provider and records the result', async () => {
    const { db, project, env } = await setup()
    await connectStripe(env, project)
    const ok = await testConnection(env.DB, project, env, 'stripe', stripeMock().impl)
    expect(ok.ok).toBe(true)
    let row = await db
      .prepare('SELECT last_verification, last_error FROM payment_connections WHERE project_id = ?')
      .bind(project.id)
      .first<{ last_verification: string; last_error: string }>()
    expect(row?.last_verification).toBe('ok')

    const bad = await testConnection(env.DB, project, env, 'stripe', stripeMock({ status: 401 }).impl)
    expect(bad.ok).toBe(false)
    row = await db
      .prepare('SELECT last_verification, last_error FROM payment_connections WHERE project_id = ?')
      .bind(project.id)
      .first<{ last_verification: string; last_error: string }>()
    expect(row?.last_verification).toBe('failed')
    expect(row?.last_error).not.toContain(STRIPE_SECRET)
    expect(row?.last_error).not.toContain(STRIPE_WEBHOOK)
  })

  test('isolates credentials and payment history between businesses', async () => {
    const a = await setup()
    const b = await setup()
    await connectStripe(a.env, a.project)
    const crossRead = await api(a.env, a.project.token, 'GET', 'payments', { cookie: b.cookie })
    expect(crossRead.status).toBe(401)
    const crossSave = await api(a.env, a.project.token, 'PUT', 'payments/connections/stripe', {
      cookie: b.cookie,
      body: { keyId: 'pk_test_other', keySecret: 'sk_test_other_value_1234', webhookSecret: 'whsec_other_secret' },
    })
    expect(crossSave.status).toBe(401)
    const bDashboard = await paymentDashboard(b.env.DB, b.project, ORIGIN)
    expect(bDashboard.connections).toHaveLength(0)
    expect(bDashboard.transactions).toHaveLength(0)
  })

  test('does not enable payment actions on a trade with no payable workflow', async () => {
    const { project, env } = await setup('finance')
    await connectStripe(env, project)
    const capability = await paymentCapability(env.DB, project)
    expect(capability.enabled).toBe(false)
    expect(capability.payOrders).toBe(false)
    expect(capability.payBookings).toBe(false)
    const html = await (await app.request(`${ORIGIN}/p/${project.token}/app`, {}, env as never)).text()
    expect(html).toContain('"enabled":false')
  })
})

describe('payment journeys', () => {
  test('leaves the app unchanged until a gateway is connected', async () => {
    const { project, env } = await setup()
    const before = await app.request(`${ORIGIN}/p/${project.token}/app`, {}, env as never)
    const html = await before.text()
    expect(html).toContain('"enabled":false')
    expect(html).toContain('No payment is taken in the app.')
    expect((await paymentCapability(env.DB, project)).enabled).toBe(false)

    await connectStripe(env, project)
    const after = await (await app.request(`${ORIGIN}/p/${project.token}/app`, {}, env as never)).text()
    expect(after).toContain('"enabled":true')
    expect(after).toContain('You can pay online after ordering.')
  })

  test('moves an order from unpaid to paid through a signed webhook only', async () => {
    const { db, project, env } = await setup()
    await connectStripe(env, project)
    const order = await makeOrder(env, project)
    const mock = stripeMock({ amount: order.total, currency: 'usd' })
    const started = await startCheckout(env.DB, project, env, ORIGIN, { kind: 'order', refId: order.id }, mock.impl)
    expect(started.amount).toBe(order.total)
    expect(started.provider).toBe('stripe')
    expect(started.payUrl).toContain(`/p/${project.token}/pay/`)

    expect(
      (await db.prepare('SELECT status FROM payment_transactions WHERE id = ?').bind(started.id).first())?.status,
    ).toBe('pending')

    const duplicate = await startCheckout(env.DB, project, env, ORIGIN, { kind: 'order', refId: order.id }, mock.impl)
    expect(duplicate.id).toBe(started.id)

    const payment = await getProject(db, project.token)
    expect(payment).not.toBeNull()

    const event = stripeEvent({ transactionId: started.id, amount: order.total, eventId: 'evt_paid_1' })
    const headers = await signedStripe(event.body)
    const webhook = await signedWebhook(env, project, event.body, headers)
    expect(webhook.status).toBe(200)
    expect(await db.prepare('SELECT status FROM payment_transactions WHERE id = ?').bind(started.id).first()).toMatchObject({ status: 'paid' })
    expect((await db.prepare('SELECT payment_status FROM orders WHERE id = ?').bind(order.id).first())?.payment_status).toBe('paid')

    const replay = await signedWebhook(env, project, event.body, headers)
    const replayBody = (await replay.json()) as { duplicate: boolean }
    expect(replayBody.duplicate).toBe(true)
    const eventCount = await db
      .prepare('SELECT COUNT(*) AS total FROM payment_events WHERE project_id = ?')
      .bind(project.id)
      .first<{ total: number }>()
    expect(Number(eventCount?.total)).toBe(1)

    expect((await db.prepare('SELECT payment_status FROM orders WHERE id = ?').bind(order.id).first())?.payment_status).toBe('paid')
  })

  test('rejects an invalid signature and an amount mismatch without marking paid', async () => {
    const { db, project, env } = await setup()
    await connectStripe(env, project)
    const order = await makeOrder(env, project)
    const started = await startCheckout(env.DB, project, env, ORIGIN, { kind: 'order', refId: order.id }, stripeMock({ amount: order.total }).impl)

    const event = stripeEvent({ transactionId: started.id, amount: order.total, eventId: 'evt_bad_sig' })
    const forged = new Headers({ 'stripe-signature': 't=1,v1=deadbeef' })
    const rejected = await signedWebhook(env, project, event.body, forged)
    expect(rejected.status).toBe(401)
    expect((await db.prepare('SELECT payment_status FROM orders WHERE id = ?').bind(order.id).first())?.payment_status).toBe('unpaid')

    const mismatch = await startCheckout(env.DB, project, env, ORIGIN, { kind: 'order', refId: order.id }, stripeMock({ amount: order.total }).impl)
    expect(mismatch.id).toBe(started.id)
    const wrongAmount = stripeEvent({ transactionId: started.id, amount: 1, eventId: 'evt_wrong_amount' })
    const accepted = await signedWebhook(env, project, wrongAmount.body, await signedStripe(wrongAmount.body))
    expect(accepted.status).toBe(200)
    expect((await db.prepare('SELECT status, failure_reason FROM payment_transactions WHERE id = ?').bind(started.id).first())).toMatchObject({
      status: 'failed',
    })
    expect((await db.prepare('SELECT payment_status FROM orders WHERE id = ?').bind(order.id).first())?.payment_status).toBe('unpaid')
  })

  test('calculates booking deposits from the catalogue, not the browser', async () => {
    const { db, project, env } = await setup()
    await connectStripe(env, project)
    const item = project.spec.menu.flatMap((section) => section.items).find((entry) => entry.price > 0)!
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const booking = await createBooking(env.DB, project, {
      customer: { name: 'Sam Lee', email: 'sam@example.com' },
      date: tomorrow,
      slot: '',
      service: item.name,
      party: 2,
    })
    const mock = stripeMock({ amount: Math.round(item.price * 0.2), currency: 'usd' })
    const started = await startCheckout(env.DB, project, env, ORIGIN, { kind: 'booking', refId: booking.id }, mock.impl)
    expect(started.amount).toBe(Math.round(item.price * 0.2))

    const event = stripeEvent({ transactionId: started.id, amount: started.amount, eventId: 'evt_booking_paid' })
    await signedWebhook(env, project, event.body, await signedStripe(event.body))
    const row = await db
      .prepare('SELECT payment_status, paid_amount FROM bookings WHERE id = ?')
      .bind(booking.id)
      .first<{ payment_status: string; paid_amount: number }>()
    expect(row?.payment_status).toBe('paid')
    expect(Number(row?.paid_amount)).toBe(started.amount)
  })

  test('refunds a paid transaction and updates the order', async () => {
    const { db, project, env } = await setup()
    await connectStripe(env, project)
    const order = await makeOrder(env, project)
    const started = await startCheckout(env.DB, project, env, ORIGIN, { kind: 'order', refId: order.id }, stripeMock({ amount: order.total }).impl)
    const event = stripeEvent({ transactionId: started.id, amount: order.total, eventId: 'evt_refund_source' })
    await signedWebhook(env, project, event.body, await signedStripe(event.body))

    const refund = await refundTransaction(env.DB, project, env, started.id, stripeMock({ refundStatus: 'succeeded' }).impl)
    expect(refund.refundStatus).toBe('refunded')
    expect(refund.amountRefunded).toBe(order.total)
    expect((await db.prepare('SELECT payment_status FROM orders WHERE id = ?').bind(order.id).first())?.payment_status).toBe('refunded')
  })

  test('disconnects a gateway, removes its secrets and keeps the non-payment workflow', async () => {
    const { db, project, env, cookie } = await setup()
    await connectStripe(env, project)
    const order = await makeOrder(env, project)
    expect((await api(env, project.token, 'DELETE', 'payments/connections/stripe', { cookie })).status).toBe(200)
    const row = await db.prepare('SELECT COUNT(*) AS total FROM payment_connections WHERE project_id = ?').bind(project.id).first<{ total: number }>()
    expect(Number(row?.total)).toBe(0)
    expect((await paymentCapability(env.DB, project)).enabled).toBe(false)
    const html = await (await app.request(`${ORIGIN}/p/${project.token}/app`, {}, env as never)).text()
    expect(html).toContain('"enabled":false')
    expect(html).toContain('No payment is taken in the app.')

    const stored = await getProject(db, project.token)
    const stillThere = await app.request(`${ORIGIN}/p/${project.token}/orders/${order.id}`, {}, env as never)
    expect(stillThere.status).toBe(200)
    expect(stored?.id).toBe(project.id)

    await expect(startCheckout(env.DB, project, env, ORIGIN, { kind: 'order', refId: order.id })).rejects.toMatchObject({
      code: 'gateway_not_connected',
    })
    await expect(refundTransaction(env.DB, project, env, 'pay_00000000000000000000')).rejects.toMatchObject({ status: 404 })
  })

  test('refuses to start a payment without a gateway or for an unpaid booking with no priced service', async () => {
    const { project, env } = await setup()
    const order = await makeOrder(env, project)
    await expect(startCheckout(env.DB, project, env, ORIGIN, { kind: 'order', refId: order.id })).rejects.toMatchObject({
      code: 'gateway_not_connected',
      status: 422,
    })
    await connectStripe(env, project)
    await expect(
      startCheckout(env.DB, project, env, ORIGIN, { kind: 'order', refId: 'ord_000000000000000000' }),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('Razorpay adapter', () => {
  test('requires INR, verifies its webhook signature and marks the payment paid', async () => {
    const { db, project: usdProject, env } = await setup()
    await db
      .prepare('UPDATE projects SET spec = ? WHERE id = ?')
      .bind(JSON.stringify({ ...usdProject.spec, currency: 'INR' }), usdProject.id)
      .run()
    const project = (await getProject(db, usdProject.token))!
    const connection = await saveConnection(env.DB, project, env, 'razorpay', {
      keyId: 'rzp_test_abc123',
      keySecret: 'razorpay-test-secret-value',
      webhookSecret: 'razorpay-webhook-secret',
      mode: 'test',
    })
    expect(connection.provider).toBe('razorpay')

    let orderSequence = 0
    let capturedAmount = 0
    const razorpayMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/orders')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { amount: number; currency: string }
        return new Response(
          JSON.stringify({ id: `order_test_${(orderSequence += 1)}`, amount: body.amount, currency: body.currency }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.includes('/payments/pay_test_')) {
        const paymentId = url.split('/payments/')[1]
        return new Response(
          JSON.stringify({ id: paymentId, status: 'captured', amount: capturedAmount, currency: 'INR' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 404 })
    }) as typeof fetch

    const order = await makeOrder(env, project)
    const started = await startCheckout(env.DB, project, env, ORIGIN, { kind: 'order', refId: order.id }, razorpayMock)
    expect(started.provider).toBe('razorpay')

    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_1',
            order_id: 'order_test_1',
            amount: order.total,
            currency: 'INR',
            status: 'captured',
            notes: { plattr_tx: started.id },
          },
        },
      },
    })
    const bad = new Headers({ 'x-razorpay-signature': 'deadbeef', 'x-razorpay-event-id': 'evt_rzp_bad' })
    const rejected = await app.request(
      `${ORIGIN}/p/${project.token}/payments/webhook/razorpay`,
      { method: 'POST', headers: bad, body: payload },
      env as never,
    )
    expect(rejected.status).toBe(401)

    const signature = await hmacHex('razorpay-webhook-secret', payload)
    const good = new Headers({ 'x-razorpay-signature': signature, 'x-razorpay-event-id': 'evt_rzp_1' })
    const accepted = await app.request(
      `${ORIGIN}/p/${project.token}/payments/webhook/razorpay`,
      { method: 'POST', headers: good, body: payload },
      env as never,
    )
    expect(accepted.status).toBe(200)
    expect(await db.prepare('SELECT status FROM payment_transactions WHERE id = ?').bind(started.id).first()).toMatchObject({ status: 'paid' })

    const secondOrder = await makeOrder(env, project)
    const second = await startCheckout(env.DB, project, env, ORIGIN, { kind: 'order', refId: secondOrder.id }, razorpayMock)
    const secondRow = await db
      .prepare('SELECT provider_order_id FROM payment_transactions WHERE id = ?')
      .bind(second.id)
      .first<{ provider_order_id: string }>()
    await expect(
      verifyRazorpayCheckout(
        env.DB,
        project,
        env,
        { transactionId: second.id, razorpayOrderId: secondRow!.provider_order_id, razorpayPaymentId: 'pay_test_1', signature: 'nope' },
        razorpayMock,
      ),
    ).rejects.toMatchObject({ code: 'invalid_signature', status: 401 })

    capturedAmount = secondOrder.total
    const checkoutSignature = await hmacHex(
      'razorpay-test-secret-value',
      `${secondRow!.provider_order_id}|pay_test_2`,
    )
    const verified = await verifyRazorpayCheckout(
      env.DB,
      project,
      env,
      {
        transactionId: second.id,
        razorpayOrderId: secondRow!.provider_order_id,
        razorpayPaymentId: 'pay_test_2',
        signature: checkoutSignature,
      },
      razorpayMock,
    )
    expect(verified.status).toBe('paid')
    expect((await db.prepare('SELECT payment_status FROM orders WHERE id = ?').bind(secondOrder.id).first())?.payment_status).toBe('paid')
  })

  test('order.paid never stores the order id as the payment id, and a later capture backfills it', async () => {
    const { db, project: usdProject, env } = await setup()
    await db
      .prepare('UPDATE projects SET spec = ? WHERE id = ?')
      .bind(JSON.stringify({ ...usdProject.spec, currency: 'INR' }), usdProject.id)
      .run()
    const project = (await getProject(db, usdProject.token))!
    await saveConnection(env.DB, project, env, 'razorpay', {
      keyId: 'rzp_test_orderpaid',
      keySecret: 'razorpay-test-secret-value',
      webhookSecret: 'razorpay-webhook-secret',
      mode: 'test',
    })
    const razorpayMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/orders')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { amount: number; currency: string }
        return new Response(JSON.stringify({ id: 'order_paid_only_1', amount: body.amount, currency: body.currency }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response('{}', { status: 404 })
    }) as typeof fetch

    const order = await makeOrder(env, project)
    const started = await startCheckout(
      env.DB,
      project,
      env,
      ORIGIN,
      { kind: 'order', refId: order.id },
      razorpayMock,
    )
    const signedEvent = async (body: string, id: string) =>
      new Headers({
        'x-razorpay-signature': await hmacHex('razorpay-webhook-secret', body),
        'x-razorpay-event-id': id,
      })

    const orderPaid = JSON.stringify({
      event: 'order.paid',
      payload: {
        order: {
          entity: {
            id: 'order_paid_only_1',
            amount_paid: order.total,
            currency: 'INR',
            notes: { plattr_tx: started.id },
          },
        },
      },
    })
    const orderResponse = await app.request(
      `${ORIGIN}/p/${project.token}/payments/webhook/razorpay`,
      { method: 'POST', headers: await signedEvent(orderPaid, 'evt_rzp_order_paid'), body: orderPaid },
      env as never,
    )
    expect(orderResponse.status).toBe(200)
    expect(
      await db
        .prepare('SELECT status, provider_payment_id FROM payment_transactions WHERE id = ?')
        .bind(started.id)
        .first<{ status: string; provider_payment_id: string }>(),
    ).toMatchObject({ status: 'paid', provider_payment_id: '' })

    const captured = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_order_paid_1',
            order_id: 'order_paid_only_1',
            amount: order.total,
            currency: 'INR',
            notes: { plattr_tx: started.id },
          },
        },
      },
    })
    const capturedResponse = await app.request(
      `${ORIGIN}/p/${project.token}/payments/webhook/razorpay`,
      { method: 'POST', headers: await signedEvent(captured, 'evt_rzp_capture_after_order'), body: captured },
      env as never,
    )
    expect(capturedResponse.status).toBe(200)
    expect(
      await db
        .prepare('SELECT status, provider_payment_id FROM payment_transactions WHERE id = ?')
        .bind(started.id)
        .first<{ status: string; provider_payment_id: string }>(),
    ).toMatchObject({ status: 'paid', provider_payment_id: 'pay_order_paid_1' })
  })
})

describe('edge cases', () => {
  test('supersedes an old pending attempt and records a cancelled transaction', async () => {
    const { db, project, env } = await setup()
    await connectStripe(env, project)
    const order = await makeOrder(env, project)
    const mock = stripeMock({ amount: order.total })
    const first = await startCheckout(env.DB, project, env, ORIGIN, { kind: 'order', refId: order.id }, mock.impl)
    await db
      .prepare('UPDATE payment_transactions SET created_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 45 * 60 * 1000).toISOString(), first.id)
      .run()
    const second = await startCheckout(env.DB, project, env, ORIGIN, { kind: 'order', refId: order.id }, mock.impl)
    expect(second.id).not.toBe(first.id)
    expect((await db.prepare('SELECT status FROM payment_transactions WHERE id = ?').bind(first.id).first())?.status).toBe('cancelled')
    expect((await db.prepare('SELECT status FROM payment_transactions WHERE id = ?').bind(second.id).first())?.status).toBe('pending')
  })

  test('records a failed payment without marking the order paid', async () => {
    const { db, project, env } = await setup()
    await connectStripe(env, project)
    const order = await makeOrder(env, project)
    const started = await startCheckout(env.DB, project, env, ORIGIN, { kind: 'order', refId: order.id }, stripeMock({ amount: order.total }).impl)
    const body = JSON.stringify({
      id: 'evt_failed_payment',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_failed',
          amount: order.total,
          currency: 'usd',
          metadata: { plattr_tx: started.id },
        },
      },
    })
    const response = await signedWebhook(env, project, body, await signedStripe(body))
    expect(response.status).toBe(200)
    const row = await db
      .prepare('SELECT status, failure_reason FROM payment_transactions WHERE id = ?')
      .bind(started.id)
      .first<{ status: string; failure_reason: string }>()
    expect(row?.status).toBe('failed')
    expect(row?.failure_reason.length).toBeGreaterThan(0)
    expect((await db.prepare('SELECT payment_status FROM orders WHERE id = ?').bind(order.id).first())?.payment_status).toBe('unpaid')
  })

  test('a webhook for a business without that gateway is rejected before processing', async () => {
    const a = await setup()
    const b = await setup()
    await connectStripe(a.env, a.project)
    const order = await makeOrder(a.env, a.project)
    const started = await startCheckout(a.env.DB, a.project, a.env, ORIGIN, { kind: 'order', refId: order.id }, stripeMock({ amount: order.total }).impl)
    const event = stripeEvent({ transactionId: started.id, amount: order.total, eventId: 'evt_cross_business' })
    const response = await signedWebhook(b.env, b.project, event.body, await signedStripe(event.body))
    expect(response.status).toBe(404)
    expect((await a.env.DB.prepare('SELECT status FROM payment_transactions WHERE id = ?').bind(started.id).first())?.status).toBe('pending')
  })

  test('the owner transactions API returns history and filters metadata without secrets', async () => {
    const { project, env, cookie } = await setup()
    await connectStripe(env, project)
    const order = await makeOrder(env, project)
    await startCheckout(env.DB, project, env, ORIGIN, { kind: 'order', refId: order.id }, stripeMock({ amount: order.total }).impl)
    const response = await api(env, project.token, 'GET', 'payments', { cookie })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      transactions: { provider: string; amount: number; currency: string }[]
      connections: { hasKeySecret: boolean }[]
    }
    expect(body.transactions[0]?.provider).toBe('stripe')
    expect(body.transactions[0]?.amount).toBe(order.total)
    expect(body.transactions[0]?.currency).toBe('USD')
    expect(body.connections[0]?.hasKeySecret).toBe(true)
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain(STRIPE_SECRET)
    expect(serialized).not.toContain(STRIPE_WEBHOOK)
  })
})

describe('payment dashboard', () => {
  test('summaries and rendered dashboard contain status, provider and amounts but no secrets', async () => {
    const { project, env, cookie } = await setup()
    await connectStripe(env, project)
    const order = await makeOrder(env, project)
    const started = await startCheckout(env.DB, project, env, ORIGIN, { kind: 'order', refId: order.id }, stripeMock({ amount: order.total }).impl)
    const event = stripeEvent({ transactionId: started.id, amount: order.total, eventId: 'evt_dash' })
    await signedWebhook(env, project, event.body, await signedStripe(event.body))

    const dashboard = await paymentDashboard(env.DB, project, ORIGIN)
    expect(dashboard.summary.collected).toBe(order.total)
    expect(dashboard.transactions[0]?.provider).toBe('stripe')
    expect(dashboard.transactions[0]?.status).toBe('paid')
    const html = await fetchDashboard(env, project.token, cookie)
    expect(html).toContain('Transactions')
    expect(html).toContain(providerLabelLocal('stripe'))
    expect(html).toContain('Refund')
    expect(html).not.toContain(STRIPE_SECRET)
    expect(html).not.toContain(STRIPE_WEBHOOK)
  })

  test('the generated app can render payment options independently of a trade', () => {
    const spec = {
      name: 'Test',
      kind: 'Independent',
      tagline: 'A test app',
      story: '',
      accent: '#222222',
      logo: 'TT',
      hours: '',
      phone: '555',
      address: '',
      vertical: 'shop' as const,
      features: ['catalog', 'ordering'] as const,
      menu: [{ name: 'Shelf', items: [{ name: 'Mug', desc: '', price: 1200 }] }],
      offers: [],
      loyalty: { goal: 5, reward: '' },
    }
    const without = renderApp(spec as never, { token: 'payments-none', live: false })
    expect(without).toContain('"enabled":false')
    const withPayments = renderApp(spec as never, {
      token: 'payments-on',
      live: false,
      payments: { payOrders: true, payBookings: false },
    })
    expect(withPayments).toContain('"enabled":true')
    expect(withPayments).toContain('"orders":true')
    expect(withPayments).toContain('[data-add],[data-inc],[data-pay]')
  })
})

async function fetchDashboard(env: Env, token: string, cookie: string) {
  const response = await app.request(`${ORIGIN}/p/${token}/dashboard`, { headers: { cookie } }, env as never)
  expect(response.status).toBe(200)
  return response.text()
}

function providerLabelLocal(provider: string) {
  return provider === 'stripe' ? 'Stripe' : 'Razorpay'
}

/* ------------------------------------------------------------------------- */
/* Route-level HTTP coverage: the public and owner endpoints as the browser  */
/* and the providers actually call them.                                     */
/* ------------------------------------------------------------------------- */

type RouteEnv = Env & { DB: D1Database }

async function eventRow(db: D1Database, projectId: string, eventId: string) {
  return db
    .prepare('SELECT status FROM payment_events WHERE project_id = ? AND event_id = ?')
    .bind(projectId, eventId)
    .first<{ status: string }>()
}

async function transactionRow(db: D1Database, id: string) {
  return db
    .prepare('SELECT status, refund_status FROM payment_transactions WHERE id = ?')
    .bind(id)
    .first<{ status: string; refund_status: string }>()
}

async function orderPaymentStatus(db: D1Database, id: string) {
  return (await db.prepare('SELECT payment_status FROM orders WHERE id = ?').bind(id).first<{ payment_status: string }>())
    ?.payment_status
}

/** A D1 proxy that fails the first N statements containing `fragment`. */
function failingDatabase(db: D1Database, fragment: string, failures = 1): D1Database {
  let remaining = failures
  const wrap = (sql: string, statement: D1PreparedStatement) => {
    const wrapped = {
      bind: (...params: unknown[]) => wrap(sql, statement.bind(...(params as never[]))),
      first: (...args: unknown[]) => (statement.first as (...inner: unknown[]) => unknown)(...args),
      all: (...args: unknown[]) => (statement.all as (...inner: unknown[]) => unknown)(...args),
      run: async () => {
        if (sql.includes(fragment) && remaining > 0) {
          remaining -= 1
          throw new Error('simulated database failure')
        }
        return statement.run()
      },
    }
    return wrapped as unknown as D1PreparedStatement
  }
  return { prepare: (sql: string) => wrap(sql, db.prepare(sql)) } as unknown as D1Database
}

async function paidOrder(env: Env, project: Project, eventId: string) {
  const order = await makeOrder(env, project)
  const started = await startCheckout(
    env.DB,
    project,
    env,
    ORIGIN,
    { kind: 'order', refId: order.id },
    stripeMock({ amount: order.total }).impl,
  )
  const event = stripeEvent({ transactionId: started.id, amount: order.total, eventId })
  const response = await signedWebhook(env, project, event.body, await signedStripe(event.body))
  expect(response.status).toBe(200)
  expect(await transactionRow(env.DB, started.id)).toMatchObject({ status: 'paid' })
  return { order, started }
}

describe('payment HTTP routes', () => {
  test('owner routes reject unknown businesses and anonymous requests', async () => {
    const { project, env } = await setup()
    const other = await setup()
    const calls: [string, string][] = [
      ['GET', 'payments'],
      ['PUT', 'payments/settings'],
      ['PUT', 'payments/connections/stripe'],
      ['POST', 'payments/connections/stripe/test'],
      ['DELETE', 'payments/connections/stripe'],
      ['POST', 'payments/transactions/pay_00000000000000000000/refund'],
    ]
    for (const [method, path] of calls) {
      const body = method === 'GET' || method === 'DELETE' ? undefined : {}
      const anonymous = await api(env, project.token, method, path, { body, origin: null })
      expect(`${method} ${path} anonymous ${anonymous.status}`).toBe(`${method} ${path} anonymous 401`)
      const foreignSession = await api(env, project.token, method, path, { body, cookie: other.cookie })
      expect(`${method} ${path} foreign ${foreignSession.status}`).toBe(`${method} ${path} foreign 401`)
      const unknownProject = await api(env, 'not-a-real-token', method, path, { body, origin: null })
      expect(`${method} ${path} unknown ${unknownProject.status}`).toBe(`${method} ${path} unknown 404`)
    }
  })

  test('owner payment writes reject a foreign origin', async () => {
    const { project, env, cookie } = await setup()
    const evil = 'https://evil.example'
    const credentials = {
      keyId: STRIPE_KEY,
      keySecret: STRIPE_SECRET,
      webhookSecret: STRIPE_WEBHOOK,
      mode: 'test',
    }
    const calls: [string, string, unknown][] = [
      ['PUT', 'payments/settings', { payOrders: false }],
      ['PUT', 'payments/connections/stripe', credentials],
      ['POST', 'payments/connections/stripe/test', undefined],
      ['DELETE', 'payments/connections/stripe', undefined],
      ['POST', 'payments/transactions/pay_00000000000000000000/refund', undefined],
    ]
    for (const [method, path, body] of calls) {
      const response = await api(env, project.token, method, path, { cookie, origin: evil, body })
      expect(`${method} ${path} ${response.status}`).toBe(`${method} ${path} 403`)
    }
  })

  test('settings route validates the provider and deposit bounds, then persists', async () => {
    const { project, env, cookie } = await setup()
    await connectStripe(env, project)

    const wrongProvider = await api(env, project.token, 'PUT', 'payments/settings', {
      cookie,
      body: { activeProvider: 'razorpay' },
    })
    expect(wrongProvider.status).toBe(422)
    expect(((await wrongProvider.json()) as { error: { code: string } }).error.code).toBe('not_connected')

    expect(
      (await api(env, project.token, 'PUT', 'payments/settings', { cookie, body: { bookingDepositPercent: 4 } }))
        .status,
    ).toBe(422)
    expect(
      (await api(env, project.token, 'PUT', 'payments/settings', { cookie, body: { bookingDepositPercent: 101 } }))
        .status,
    ).toBe(422)

    const saved = await api(env, project.token, 'PUT', 'payments/settings', {
      cookie,
      body: { payOrders: false, payBookings: true, bookingDepositPercent: 35 },
    })
    expect(saved.status).toBe(200)
    expect(((await saved.json()) as { settings: unknown }).settings).toMatchObject({
      payOrders: false,
      payBookings: true,
      bookingDepositPercent: 35,
    })

    const read = await api(env, project.token, 'GET', 'payments', { cookie })
    const dashboard = (await read.json()) as {
      settings: { bookingDepositPercent: number }
      connections: { provider: string }[]
    }
    expect(dashboard.settings.bookingDepositPercent).toBe(35)
    expect(dashboard.connections.map((entry) => entry.provider)).toEqual(['stripe'])
  })

  test('connection routes reject unknown providers, malformed JSON and oversized bodies', async () => {
    const { project, env, cookie } = await setup()
    expect((await api(env, project.token, 'PUT', 'payments/connections/paypal', { cookie, body: {} })).status).toBe(404)
    expect((await api(env, project.token, 'POST', 'payments/connections/paypal/test', { cookie })).status).toBe(404)
    expect((await api(env, project.token, 'DELETE', 'payments/connections/paypal', { cookie })).status).toBe(404)

    const malformed = await app.request(
      `${ORIGIN}/api/projects/${project.token}/payments/connections/stripe`,
      { method: 'PUT', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie }, body: '{' },
      env as never,
    )
    expect(malformed.status).toBe(400)

    const oversized = await app.request(
      `${ORIGIN}/api/projects/${project.token}/payments/connections/stripe`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: ORIGIN, cookie },
        body: JSON.stringify({ keyId: 'k'.repeat(17 * 1024) }),
      },
      env as never,
    )
    expect(oversized.status).toBe(413)
  })

  test('testing and disconnecting a gateway return clean route errors', async () => {
    const { project, env, cookie } = await setup()
    const notConnected = await api(env, project.token, 'POST', 'payments/connections/stripe/test', { cookie })
    expect(notConnected.status).toBe(422)
    expect(((await notConnected.json()) as { error: { code: string } }).error.code).toBe('not_connected')

    expect((await api(env, project.token, 'DELETE', 'payments/connections/stripe', { cookie })).status).toBe(404)
    await connectStripe(env, project)
    expect((await api(env, project.token, 'DELETE', 'payments/connections/stripe', { cookie })).status).toBe(200)
    expect((await api(env, project.token, 'DELETE', 'payments/connections/stripe', { cookie })).status).toBe(404)
  })

  test('refund route rejects cross-origin, unknown and unpaid transactions', async () => {
    const { project, env, cookie } = await setup()
    await connectStripe(env, project)
    const order = await makeOrder(env, project)
    const started = await startCheckout(
      env.DB,
      project,
      env,
      ORIGIN,
      { kind: 'order', refId: order.id },
      stripeMock({ amount: order.total }).impl,
    )

    expect(
      (
        await api(env, project.token, 'POST', `payments/transactions/${started.id}/refund`, {
          cookie,
          origin: 'https://evil.example',
        })
      ).status,
    ).toBe(403)
    expect(
      (await api(env, project.token, 'POST', 'payments/transactions/pay_00000000000000000000/refund', { cookie }))
        .status,
    ).toBe(404)
    const unpaid = await api(env, project.token, 'POST', `payments/transactions/${started.id}/refund`, { cookie })
    expect(unpaid.status).toBe(409)
    expect(((await unpaid.json()) as { error: { code: string } }).error.code).toBe('not_paid')
  })

  test('customer payment start rejects foreign origins, bad JSON and missing gateways', async () => {
    const { project, env } = await setup()
    const crossOrigin = await app.request(
      `${ORIGIN}/p/${project.token}/payments/start`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ kind: 'order', refId: 'ord_00000000000000000000' }),
      },
      env as never,
    )
    expect(crossOrigin.status).toBe(403)

    const malformed = await app.request(
      `${ORIGIN}/p/${project.token}/payments/start`,
      { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: '{' },
      env as never,
    )
    expect(malformed.status).toBe(400)

    const noGateway = await customer(env, project.token, 'payments/start', {
      kind: 'order',
      refId: 'ord_00000000000000000000',
    })
    expect(noGateway.status).toBe(422)
    expect(((await noGateway.json()) as { error: { code: string } }).error.code).toBe('gateway_not_connected')

    const invalid = await customer(env, project.token, 'payments/start', {
      kind: 'refund',
      refId: 'ord_00000000000000000000',
    })
    expect(invalid.status).toBe(422)
    expect(((await invalid.json()) as { error: { code: string } }).error.code).toBe('payment_invalid')

    await connectStripe(env, project)
    const missingRecord = await customer(env, project.token, 'payments/start', {
      kind: 'order',
      refId: 'ord_00000000000000000000',
    })
    expect(missingRecord.status).toBe(404)
  })

  test('pay pages hide unknown and other-business transactions', async () => {
    const a = await setup()
    const b = await setup()
    expect(
      (await app.request(`${ORIGIN}/p/${a.project.token}/pay/pay_00000000000000000000`, {}, a.env as never)).status,
    ).toBe(404)
    expect(
      (await app.request(`${ORIGIN}/p/${a.project.token}/payment/pay_00000000000000000000`, {}, a.env as never))
        .status,
    ).toBe(404)

    await connectStripe(b.env, b.project)
    const order = await makeOrder(b.env, b.project)
    const started = await startCheckout(
      b.env.DB,
      b.project,
      b.env,
      ORIGIN,
      { kind: 'order', refId: order.id },
      stripeMock({ amount: order.total }).impl,
    )
    expect(
      (await app.request(`${ORIGIN}/p/${a.project.token}/pay/${started.id}`, {}, a.env as never)).status,
    ).toBe(404)
    expect(
      (await app.request(`${ORIGIN}/p/${a.project.token}/payment/${started.id}`, {}, a.env as never)).status,
    ).toBe(404)
  })

  test('webhook route rejects unknown providers, unwired gateways and bad bodies', async () => {
    const { project, env } = await setup()
    const body = JSON.stringify({
      id: 'evt_route_1',
      type: 'checkout.session.completed',
      data: {
        object: { id: 'cs_route', payment_status: 'paid', amount_total: 100, currency: 'usd', metadata: {} },
      },
    })

    const unknownProvider = await app.request(
      `${ORIGIN}/p/${project.token}/payments/webhook/paypal`,
      { method: 'POST', headers: await signedStripe(body), body },
      env as never,
    )
    expect(unknownProvider.status).toBe(404)
    expect((await signedWebhook(env, project, body, await signedStripe(body))).status).toBe(404)

    await connectStripe(env, project)
    expect((await signedWebhook(env, project, body, new Headers())).status).toBe(401)
    expect(
      (await signedWebhook(env, project, body, new Headers({ 'stripe-signature': 't=1,v1=deadbeef' }))).status,
    ).toBe(401)
    expect((await signedWebhook(env, project, '{', await signedStripe('{'))).status).toBe(400)
    expect((await signedWebhook(env, project, 'x'.repeat(129 * 1024), new Headers())).status).toBe(413)

    const accepted = await signedWebhook(env, project, body, await signedStripe(body))
    expect(accepted.status).toBe(200)
    expect(accepted.headers.get('cache-control')).toBe('no-store')
  })

  test('a route-level paid webhook updates history and the owner dashboard', async () => {
    const { project, env, cookie } = await setup()
    await connectStripe(env, project)
    const order = await makeOrder(env, project)
    const started = await startCheckout(
      env.DB,
      project,
      env,
      ORIGIN,
      { kind: 'order', refId: order.id },
      stripeMock({ amount: order.total }).impl,
    )
    const event = stripeEvent({ transactionId: started.id, amount: order.total, eventId: 'evt_route_paid' })
    const response = await signedWebhook(env, project, event.body, await signedStripe(event.body))
    expect(response.status).toBe(200)
    expect(await orderPaymentStatus(env.DB, order.id)).toBe('paid')

    const history = await api(env, project.token, 'GET', 'payments', { cookie })
    const payload = (await history.json()) as {
      transactions: { id: string; status: string; amount: number; currency: string }[]
      summary: { collected: number }
    }
    expect(payload.transactions).toHaveLength(1)
    expect(payload.transactions[0]).toMatchObject({
      id: started.id,
      status: 'paid',
      amount: order.total,
      currency: 'USD',
    })
    expect(payload.summary.collected).toBe(order.total)

    const duplicate = await signedWebhook(env, project, event.body, await signedStripe(event.body))
    expect(((await duplicate.json()) as { duplicate: boolean }).duplicate).toBe(true)
    expect(await eventRow(env.DB, project.id, 'evt_route_paid')).toMatchObject({ status: 'processed' })
  })

  test('disconnecting one business leaves the other connection and history intact', async () => {
    const a = await setup()
    const b = await setup()
    await connectStripe(a.env, a.project)
    await connectStripe(b.env, b.project)
    const { started } = await paidOrder(a.env, a.project, 'evt_isolation_a')
    await paidOrder(b.env, b.project, 'evt_isolation_b')

    const removed = await api(a.env, a.project.token, 'DELETE', 'payments/connections/stripe', {
      cookie: a.cookie,
    })
    expect(removed.status).toBe(200)

    const dashboardA = await paymentDashboard(a.env.DB, a.project, ORIGIN)
    const dashboardB = await paymentDashboard(b.env.DB, b.project, ORIGIN)
    expect(dashboardA.connections).toHaveLength(0)
    expect(dashboardA.transactions.map((entry) => entry.id)).toContain(started.id)
    expect(dashboardB.connections).toHaveLength(1)
    expect(dashboardB.transactions).toHaveLength(1)
    expect((await paymentCapability(a.env.DB, a.project)).enabled).toBe(false)
    expect((await paymentCapability(b.env.DB, b.project)).enabled).toBe(true)
  })
})

/* ------------------------------------------------------------------------- */
/* Failure consistency: a delivery that dies part-way must converge, and a    */
/* settled payment must stay settled.                                         */
/* ------------------------------------------------------------------------- */

describe('payment failure consistency', () => {
  test('a webhook that fails mid-write is retried and converges exactly once', async () => {
    const { db, project, env } = await setup()
    await connectStripe(env, project)
    const order = await makeOrder(env, project)
    const started = await startCheckout(
      env.DB,
      project,
      env,
      ORIGIN,
      { kind: 'order', refId: order.id },
      stripeMock({ amount: order.total }).impl,
    )
    const event = stripeEvent({ transactionId: started.id, amount: order.total, eventId: 'evt_failure_retry' })
    const headers = await signedStripe(event.body)

    const flakyEnv = { ...env, DB: failingDatabase(env.DB, "UPDATE orders SET payment_status = 'paid'", 1) }
    const failed = await signedWebhook(flakyEnv, project, event.body, headers)
    expect(failed.status).toBe(500)
    expect(await eventRow(env.DB, project.id, 'evt_failure_retry')).toMatchObject({ status: 'failed' })
    expect(await transactionRow(env.DB, started.id)).toMatchObject({ status: 'pending' })
    expect(await orderPaymentStatus(env.DB, order.id)).toBe('unpaid')

    const retried = await signedWebhook(env, project, event.body, headers)
    expect(retried.status).toBe(200)
    expect(((await retried.json()) as { duplicate: boolean }).duplicate).toBe(false)
    expect(await transactionRow(env.DB, started.id)).toMatchObject({ status: 'paid' })
    expect(await orderPaymentStatus(env.DB, order.id)).toBe('paid')
    expect(await eventRow(env.DB, project.id, 'evt_failure_retry')).toMatchObject({ status: 'processed' })

    const events = await db
      .prepare('SELECT COUNT(*) AS total FROM payment_events WHERE project_id = ?')
      .bind(project.id)
      .first<{ total: number }>()
    expect(Number(events?.total)).toBe(1)
    const logs = await db
      .prepare("SELECT COUNT(*) AS total FROM activity WHERE project_id = ? AND label = 'Payment received'")
      .bind(project.id)
      .first<{ total: number }>()
    expect(Number(logs?.total)).toBe(1)
  })

  test('an event left received by an interrupted delivery is processed on retry', async () => {
    const { db, project, env } = await setup()
    await connectStripe(env, project)
    const order = await makeOrder(env, project)
    const started = await startCheckout(
      env.DB,
      project,
      env,
      ORIGIN,
      { kind: 'order', refId: order.id },
      stripeMock({ amount: order.total }).impl,
    )
    const event = stripeEvent({ transactionId: started.id, amount: order.total, eventId: 'evt_crash_window' })
    await db
      .prepare(
        "INSERT INTO payment_events (id, project_id, provider, event_id, event_type, status, created_at) VALUES (?, ?, 'stripe', ?, 'checkout.session.completed', 'received', ?)",
      )
      .bind('pev_crash_window', project.id, 'evt_crash_window', new Date().toISOString())
      .run()

    const retried = await signedWebhook(env, project, event.body, await signedStripe(event.body))
    expect(retried.status).toBe(200)
    expect(((await retried.json()) as { duplicate: boolean }).duplicate).toBe(false)
    expect(await eventRow(env.DB, project.id, 'evt_crash_window')).toMatchObject({ status: 'processed' })
    expect(await transactionRow(env.DB, started.id)).toMatchObject({ status: 'paid' })
    expect(await orderPaymentStatus(env.DB, order.id)).toBe('paid')
  })

  test('late failure and mismatched duplicate events cannot un-pay a settled order', async () => {
    const { db, project, env } = await setup()
    await connectStripe(env, project)
    const { order, started } = await paidOrder(env, project, 'evt_settled_first')

    const lateFailure = JSON.stringify({
      id: 'evt_late_failure',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_test_123',
          amount: order.total,
          currency: 'usd',
          metadata: { plattr_tx: started.id },
        },
      },
    })
    const late = await signedWebhook(env, project, lateFailure, await signedStripe(lateFailure))
    expect(late.status).toBe(200)
    expect(await transactionRow(env.DB, started.id)).toMatchObject({ status: 'paid' })
    expect(await orderPaymentStatus(env.DB, order.id)).toBe('paid')

    const mismatched = stripeEvent({
      transactionId: started.id,
      amount: 1,
      eventId: 'evt_wrong_amount_after_paid',
    })
    const mismatchedResponse = await signedWebhook(
      env,
      project,
      mismatched.body,
      await signedStripe(mismatched.body),
    )
    expect(mismatchedResponse.status).toBe(200)
    expect(await transactionRow(env.DB, started.id)).toMatchObject({ status: 'paid' })
    expect(await orderPaymentStatus(env.DB, order.id)).toBe('paid')

    const logs = await db
      .prepare("SELECT COUNT(*) AS total FROM activity WHERE project_id = ? AND label = 'Payment failed'")
      .bind(project.id)
      .first<{ total: number }>()
    expect(Number(logs?.total)).toBe(0)
  })

  test('a signed paid event with no amount or currency is not taken as payment', async () => {
    const { project, env } = await setup()
    await connectStripe(env, project)
    const order = await makeOrder(env, project)
    const started = await startCheckout(
      env.DB,
      project,
      env,
      ORIGIN,
      { kind: 'order', refId: order.id },
      stripeMock({ amount: order.total }).impl,
    )

    const noAmount = stripeEvent({ transactionId: started.id, eventId: 'evt_missing_amount' })
    const missingAmount = await signedWebhook(env, project, noAmount.body, await signedStripe(noAmount.body))
    expect(missingAmount.status).toBe(200)
    expect(await transactionRow(env.DB, started.id)).toMatchObject({ status: 'failed' })
    expect(await orderPaymentStatus(env.DB, order.id)).toBe('unpaid')

    const noCurrency = stripeEvent({
      transactionId: started.id,
      amount: order.total,
      currency: '',
      eventId: 'evt_missing_currency',
    })
    const missingCurrency = await signedWebhook(
      env,
      project,
      noCurrency.body,
      await signedStripe(noCurrency.body),
    )
    expect(missingCurrency.status).toBe(200)
    expect(await transactionRow(env.DB, started.id)).toMatchObject({ status: 'failed' })
    expect(await orderPaymentStatus(env.DB, order.id)).toBe('unpaid')
  })

  test('a refund already in progress cannot be submitted twice', async () => {
    const { project, env } = await setup()
    await connectStripe(env, project)
    const { started } = await paidOrder(env, project, 'evt_refund_source_route')

    const pending = await refundTransaction(
      env.DB,
      project,
      env,
      started.id,
      stripeMock({ refundStatus: 'pending' }).impl,
    )
    expect(pending.refundStatus).toBe('requested')
    expect(await transactionRow(env.DB, started.id)).toMatchObject({
      status: 'paid',
      refund_status: 'requested',
    })

    await expect(
      refundTransaction(env.DB, project, env, started.id, stripeMock({ refundStatus: 'succeeded' }).impl),
    ).rejects.toMatchObject({ code: 'refund_pending', status: 409 })
    expect(await transactionRow(env.DB, started.id)).toMatchObject({ refund_status: 'requested' })
  })

  test('a refund the gateway definitely refuses releases the claim so it can be retried', async () => {
    const { project, env } = await setup()
    await connectStripe(env, project)
    const { started } = await paidOrder(env, project, 'evt_refund_retry_source')

    const rejecting = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/refunds'))
        return new Response(JSON.stringify({ error: { message: 'refund refused' } }), {
          status: 402,
          headers: { 'content-type': 'application/json' },
        })
      return new Response('{}', { status: 404 })
    }) as typeof fetch

    await expect(
      refundTransaction(env.DB, project, env, started.id, rejecting),
    ).rejects.toMatchObject({ code: 'refund_failed', status: 502 })
    expect(await transactionRow(env.DB, started.id)).toMatchObject({ refund_status: 'none' })

    const refund = await refundTransaction(
      env.DB,
      project,
      env,
      started.id,
      stripeMock({ refundStatus: 'succeeded' }).impl,
    )
    expect(refund.refundStatus).toBe('refunded')
  })

  test('a refund timeout keeps the claim so a retry cannot refund a second time', async () => {
    const { project, env } = await setup()
    await connectStripe(env, project)
    const { order, started } = await paidOrder(env, project, 'evt_refund_timeout_source')

    // The refund may have been applied before the response was lost, so Plattr
    // cannot know whether money already moved. The claim must survive.
    const timingOut = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/refunds')) {
        const abort = new Error('The operation was aborted.')
        abort.name = 'AbortError'
        throw abort
      }
      return new Response('{}', { status: 404 })
    }) as typeof fetch

    await expect(
      refundTransaction(env.DB, project, env, started.id, timingOut),
    ).rejects.toMatchObject({ code: 'refund_outcome_unknown', status: 502 })
    expect(await transactionRow(env.DB, started.id)).toMatchObject({
      status: 'paid',
      refund_status: 'requested',
    })
    expect(await orderPaymentStatus(env.DB, order.id)).toBe('paid')

    // A second click or a retry is rejected before any gateway call is made.
    const retry = stripeMock({ refundStatus: 'succeeded' })
    await expect(
      refundTransaction(env.DB, project, env, started.id, retry.impl),
    ).rejects.toMatchObject({ code: 'refund_pending', status: 409 })
    expect(retry.calls.some((call) => call.url.endsWith('/refunds'))).toBe(false)
    expect(await transactionRow(env.DB, started.id)).toMatchObject({ refund_status: 'requested' })
  })

  test('a refund 5xx keeps the claim because the gateway may have applied it', async () => {
    const { project, env } = await setup()
    await connectStripe(env, project)
    const { started } = await paidOrder(env, project, 'evt_refund_5xx_source')

    const serverError = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/refunds')) return new Response('{}', { status: 500 })
      return new Response('{}', { status: 404 })
    }) as typeof fetch

    await expect(
      refundTransaction(env.DB, project, env, started.id, serverError),
    ).rejects.toMatchObject({ code: 'refund_outcome_unknown', status: 502 })
    expect(await transactionRow(env.DB, started.id)).toMatchObject({ refund_status: 'requested' })
  })
})
