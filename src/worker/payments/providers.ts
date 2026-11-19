import { hmacHex, sameHex } from './crypto'
import {
  PaymentError,
  type CreatedCheckout,
  type PaymentMode,
  type ProviderCredentials,
  type ProviderEvent,
  type ProviderId,
} from './types'

/**
 * One provider interface for every trade. All network calls happen in the
 * Worker; the browser only ever receives a hosted checkout URL or the public
 * Razorpay key id and order id.
 */

const RAZORPAY_API = 'https://api.razorpay.com/v1'
const STRIPE_API = 'https://api.stripe.com/v1'
const TIMEOUT_MS = 15_000
const STRIPE_TOLERANCE_SECONDS = 300

type Fetch = typeof fetch

function basic(keyId: string, keySecret: string): string {
  return 'Basic ' + btoa(`${keyId}:${keySecret}`)
}

async function providerFetch(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal })
    const text = await response.text()
    let body: Record<string, unknown> = {}
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      body = {}
    }
    return { status: response.status, body }
  } catch {
    throw new PaymentError('provider_unreachable', 'The payment gateway could not be reached. Try again.', 502)
  } finally {
    clearTimeout(timer)
  }
}

function gatewayMessage(status: number): string {
  if (status === 401 || status === 403) return 'The gateway rejected these credentials. Check the keys and the mode.'
  if (status === 429) return 'The gateway is rate limiting this account. Try again shortly.'
  return 'The gateway could not complete that request. Check the account and try again.'
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  return typeof value === 'string' ? value : ''
}

function numberField(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Refuse credentials whose prefixes contradict the chosen mode. */
export function credentialFormatError(
  provider: ProviderId,
  mode: PaymentMode,
  keyId: string,
  keySecret: string,
): string | null {
  if (!keyId.trim()) return provider === 'razorpay' ? 'Add the Razorpay Key ID.' : 'Add the Stripe publishable key.'
  if (!keySecret.trim()) return provider === 'razorpay' ? 'Add the Razorpay Key Secret.' : 'Add the Stripe secret key.'
  if (provider === 'razorpay') {
    if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId))
      return 'Razorpay Key IDs start with rzp_test_ or rzp_live_.'
    if (keyId.startsWith(`rzp_${mode}_`) === false)
      return `That is not a Razorpay ${mode} key. Switch the mode or use the ${mode} key.`
    if (keySecret.length < 12) return 'That Razorpay Key Secret looks too short.'
    return null
  }
  if (!/^pk_(test|live)_[A-Za-z0-9]+$/.test(keyId))
    return 'Stripe publishable keys start with pk_test_ or pk_live_.'
  if (!keyId.startsWith(`pk_${mode}_`)) return `That is not a Stripe ${mode} publishable key.`
  if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(keySecret))
    return 'Stripe secret keys start with sk_test_ or sk_live_.'
  if (!keySecret.startsWith(`sk_${mode}_`)) return `That is not a Stripe ${mode} secret key.`
  return null
}

export async function testCredentials(
  provider: ProviderId,
  credentials: ProviderCredentials,
  fetchImpl: Fetch = fetch,
): Promise<{ ok: boolean; message: string }> {
  const result =
    provider === 'razorpay'
      ? await providerFetch(fetchImpl, `${RAZORPAY_API}/payments?count=1`, {
          method: 'GET',
          headers: { authorization: basic(credentials.keyId, credentials.keySecret) },
        })
      : await providerFetch(fetchImpl, `${STRIPE_API}/balance`, {
          method: 'GET',
          headers: { authorization: `Bearer ${credentials.keySecret}` },
        })
  if (result.status >= 200 && result.status < 300) return { ok: true, message: 'Credentials accepted by the gateway.' }
  return { ok: false, message: gatewayMessage(result.status) }
}

export async function createCheckout(options: {
  provider: ProviderId
  credentials: ProviderCredentials
  amount: number
  currency: string
  businessName: string
  reference: string
  transactionId: string
  token: string
  origin: string
  customer: { name: string; email: string; phone: string }
  fetchImpl?: Fetch
}): Promise<CreatedCheckout> {
  const {
    provider,
    credentials,
    amount,
    currency,
    businessName,
    reference,
    transactionId,
    token,
    origin,
    customer,
  } = options
  const fetchImpl = options.fetchImpl ?? fetch
  if (!Number.isInteger(amount) || amount <= 0)
    throw new PaymentError('amount_invalid', 'There is no payable amount for this record.', 422)

  if (provider === 'razorpay') {
    const result = await providerFetch(fetchImpl, `${RAZORPAY_API}/orders`, {
      method: 'POST',
      headers: {
        authorization: basic(credentials.keyId, credentials.keySecret),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        currency,
        receipt: reference.slice(0, 40),
        notes: { plattr_tx: transactionId, project: token },
      }),
    })
    if (result.status < 200 || result.status >= 300)
      throw new PaymentError('provider_rejected', gatewayMessage(result.status), 502)
    const providerOrderId = stringField(result.body, 'id')
    const gatewayAmount = numberField(result.body, 'amount')
    if (!providerOrderId) throw new PaymentError('provider_rejected', 'The gateway did not return an order.', 502)
    if (gatewayAmount !== undefined && gatewayAmount !== amount)
      throw new PaymentError('amount_mismatch', 'The gateway order amount did not match the order.', 502)
    return { providerOrderId }
  }

  const params = new URLSearchParams()
  params.set('mode', 'payment')
  params.set('success_url', `${origin}/p/${token}/payment/${transactionId}?from=stripe`)
  params.set('cancel_url', `${origin}/p/${token}/payment/${transactionId}?from=stripe-cancel`)
  params.set('client_reference_id', transactionId)
  params.set('metadata[plattr_tx]', transactionId)
  params.set('metadata[project]', token)
  params.set('line_items[0][quantity]', '1')
  params.set('line_items[0][price_data][currency]', currency.toLowerCase())
  params.set('line_items[0][price_data][unit_amount]', String(amount))
  params.set('line_items[0][price_data][product_data][name]', `${businessName} · ${reference}`)
  params.set('payment_intent_data[metadata][plattr_tx]', transactionId)
  if (customer.email) params.set('customer_email', customer.email)

  const result = await providerFetch(fetchImpl, `${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credentials.keySecret}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
  if (result.status < 200 || result.status >= 300)
    throw new PaymentError('provider_rejected', gatewayMessage(result.status), 502)
  const providerOrderId = stringField(result.body, 'id')
  const redirectUrl = stringField(result.body, 'url')
  const gatewayAmount = numberField(result.body, 'amount_total')
  const gatewayCurrency = stringField(result.body, 'currency')
  if (!providerOrderId || !redirectUrl)
    throw new PaymentError('provider_rejected', 'The gateway did not return a checkout link.', 502)
  if (gatewayAmount !== undefined && gatewayAmount !== amount)
    throw new PaymentError('amount_mismatch', 'The gateway session amount did not match the order.', 502)
  if (gatewayCurrency && gatewayCurrency.toUpperCase() !== currency.toUpperCase())
    throw new PaymentError('currency_mismatch', 'The gateway session currency did not match the order.', 502)
  return { providerOrderId, redirectUrl }
}

export type RetrievedPayment = {
  status: 'paid' | 'pending' | 'failed'
  providerPaymentId?: string
  amount?: number
  currency?: string
  reason?: string
}

export async function retrievePayment(options: {
  provider: ProviderId
  credentials: ProviderCredentials
  providerOrderId: string
  providerPaymentId?: string
  fetchImpl?: Fetch
}): Promise<RetrievedPayment> {
  const { provider, credentials, providerOrderId, providerPaymentId } = options
  const fetchImpl = options.fetchImpl ?? fetch

  if (provider === 'razorpay') {
    if (providerPaymentId) {
      const result = await providerFetch(fetchImpl, `${RAZORPAY_API}/payments/${encodeURIComponent(providerPaymentId)}`, {
        method: 'GET',
        headers: { authorization: basic(credentials.keyId, credentials.keySecret) },
      })
      if (result.status < 200 || result.status >= 300)
        throw new PaymentError('provider_error', gatewayMessage(result.status), 502)
      const status = stringField(result.body, 'status')
      return {
        status: status === 'captured' ? 'paid' : status === 'failed' ? 'failed' : 'pending',
        providerPaymentId,
        amount: numberField(result.body, 'amount'),
        currency: stringField(result.body, 'currency').toUpperCase(),
        reason: stringField(result.body, 'error_description') || undefined,
      }
    }
    const result = await providerFetch(fetchImpl, `${RAZORPAY_API}/orders/${encodeURIComponent(providerOrderId)}/payments`, {
      method: 'GET',
      headers: { authorization: basic(credentials.keyId, credentials.keySecret) },
    })
    if (result.status < 200 || result.status >= 300)
      throw new PaymentError('provider_error', gatewayMessage(result.status), 502)
    const items = Array.isArray(result.body.items) ? (result.body.items as Record<string, unknown>[]) : []
    const captured = items.find((entry) => entry.status === 'captured')
    if (captured)
      return {
        status: 'paid',
        providerPaymentId: stringField(captured, 'id'),
        amount: numberField(captured, 'amount'),
        currency: stringField(captured, 'currency').toUpperCase(),
      }
    const failed = items.find((entry) => entry.status === 'failed')
    if (failed)
      return {
        status: 'failed',
        providerPaymentId: stringField(failed, 'id'),
        reason: stringField(failed, 'error_description') || undefined,
      }
    return { status: 'pending' }
  }

  const result = await providerFetch(
    fetchImpl,
    `${STRIPE_API}/checkout/sessions/${encodeURIComponent(providerOrderId)}`,
    { method: 'GET', headers: { authorization: `Bearer ${credentials.keySecret}` } },
  )
  if (result.status < 200 || result.status >= 300)
    throw new PaymentError('provider_error', gatewayMessage(result.status), 502)
  const paymentStatus = stringField(result.body, 'payment_status')
  const sessionStatus = stringField(result.body, 'status')
  return {
    status: paymentStatus === 'paid' ? 'paid' : sessionStatus === 'expired' ? 'failed' : 'pending',
    providerPaymentId: stringField(result.body, 'payment_intent') || undefined,
    amount: numberField(result.body, 'amount_total'),
    currency: stringField(result.body, 'currency').toUpperCase(),
  }
}

/**
 * A refund is not an idempotent read. A timeout, a dropped connection, a 5xx or
 * a truncated success body all mean "the gateway may have created this refund";
 * only a 4xx refusal proves nothing was created. Callers must keep the refund
 * claimed in the unknown case so a retry cannot send a second refund.
 */
function refundOutcomeUnknown(): PaymentError {
  return new PaymentError(
    'refund_outcome_unknown',
    'The gateway did not confirm this refund, so it may already be processing. Check the gateway dashboard before trying again.',
    502,
  )
}

/** POSTs a refund and returns the gateway body, or throws with the outcome class. */
async function refundRequest(fetchImpl: Fetch, url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let result: { status: number; body: Record<string, unknown> }
  try {
    result = await providerFetch(fetchImpl, url, init)
  } catch (error) {
    // Network error or the 15 s abort: the request may already have reached the
    // gateway, so the outcome is unknown rather than a failed refund.
    if (error instanceof PaymentError && error.code === 'provider_unreachable') throw refundOutcomeUnknown()
    throw error
  }
  if (result.status >= 400 && result.status < 500 && result.status !== 408 && result.status !== 409)
    throw new PaymentError('refund_failed', gatewayMessage(result.status), 502)
  if (result.status < 200 || result.status >= 300) throw refundOutcomeUnknown()
  return result.body
}

export async function refundPayment(options: {
  provider: ProviderId
  credentials: ProviderCredentials
  providerPaymentId: string
  amount: number
  fetchImpl?: Fetch
}): Promise<{ refundId: string; status: 'refunded' | 'requested' }> {
  const { provider, credentials, providerPaymentId, amount } = options
  const fetchImpl = options.fetchImpl ?? fetch
  if (!providerPaymentId)
    throw new PaymentError('payment_missing', 'This payment has no gateway payment reference to refund.', 422)

  if (provider === 'razorpay') {
    const result = await refundRequest(
      fetchImpl,
      `${RAZORPAY_API}/payments/${encodeURIComponent(providerPaymentId)}/refund`,
      {
        method: 'POST',
        headers: {
          authorization: basic(credentials.keyId, credentials.keySecret),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ amount, notes: { source: 'plattr' } }),
      },
    )
    const refundId = stringField(result, 'id')
    const status = stringField(result, 'status')
    if (!refundId) throw refundOutcomeUnknown()
    return { refundId, status: status === 'processed' ? 'refunded' : 'requested' }
  }

  const params = new URLSearchParams()
  params.set('payment_intent', providerPaymentId)
  params.set('amount', String(amount))
  params.set('metadata[source]', 'plattr')
  const result = await refundRequest(fetchImpl, `${STRIPE_API}/refunds`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credentials.keySecret}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
  const refundId = stringField(result, 'id')
  const status = stringField(result, 'status')
  if (!refundId) throw refundOutcomeUnknown()
  return { refundId, status: status === 'succeeded' ? 'refunded' : 'requested' }
}

function parseStripeSignature(header: string): { timestamp: number; signatures: string[] } {
  const parts = header.split(',').map((part) => part.trim())
  let timestamp = 0
  const signatures: string[] = []
  for (const part of parts) {
    const [key, value] = part.split('=')
    if (key === 't') timestamp = Number(value)
    if (key === 'v1' && value) signatures.push(value)
  }
  return { timestamp, signatures }
}

/** Verifies the signature first; never parses an unverified payload as truth. */
export async function parseWebhook(options: {
  provider: ProviderId
  rawBody: string
  headers: Headers
  webhookSecret: string
}): Promise<ProviderEvent> {
  const { provider, rawBody, headers, webhookSecret } = options
  if (!webhookSecret)
    throw new PaymentError('webhook_secret_missing', 'No webhook secret is configured for this gateway.', 503)

  if (provider === 'razorpay') {
    const signature = headers.get('x-razorpay-signature') ?? ''
    const expected = await hmacHex(webhookSecret, rawBody)
    if (!sameHex(signature.toLowerCase(), expected))
      throw new PaymentError('invalid_signature', 'That webhook signature is not valid.', 401)
    const eventId = headers.get('x-razorpay-event-id') ?? ''
    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      throw new PaymentError('invalid_json', 'That webhook body is not JSON.', 400)
    }
    const type = stringField(payload, 'event')
    const entities = (payload.payload ?? {}) as Record<string, { entity?: Record<string, unknown> }>
    const payment = entities.payment?.entity
    const order = entities.order?.entity
    const refund = entities.refund?.entity
    const eventIdSafe = eventId || `body_${(await hmacHex('event', rawBody)).slice(0, 40)}`
    if (type === 'payment.captured' || type === 'order.paid') {
      // `order.paid` can arrive without a payment entity. The order id must
      // never be stored as the payment id, or a later refund would be sent to
      // the wrong Razorpay resource.
      const orderLevel = !payment && Boolean(order)
      const entity = payment ?? order ?? {}
      return {
        eventId: eventIdSafe,
        eventType: type,
        outcome: 'paid',
        providerOrderId: stringField(entity, 'order_id') || stringField(entity, 'id'),
        providerPaymentId: orderLevel ? '' : stringField(entity, 'id'),
        amount: numberField(entity, 'amount') ?? numberField(entity, 'amount_paid'),
        currency: stringField(entity, 'currency').toUpperCase(),
        transactionId: ((entity.notes ?? {}) as Record<string, unknown>).plattr_tx as string | undefined,
      }
    }
    if (type === 'payment.failed') {
      const entity = payment ?? {}
      return {
        eventId: eventIdSafe,
        eventType: type,
        outcome: 'failed',
        providerOrderId: stringField(entity, 'order_id'),
        providerPaymentId: stringField(entity, 'id'),
        amount: numberField(entity, 'amount'),
        currency: stringField(entity, 'currency').toUpperCase(),
        transactionId: ((entity.notes ?? {}) as Record<string, unknown>).plattr_tx as string | undefined,
        reason: stringField(entity, 'error_description') || 'The gateway reported a failed payment.',
      }
    }
    if (type === 'refund.processed' || type === 'refund.created') {
      const entity = refund ?? {}
      return {
        eventId: eventIdSafe,
        eventType: type,
        outcome: type === 'refund.processed' ? 'refunded' : 'pending',
        providerPaymentId: stringField(entity, 'payment_id'),
        providerRefundId: stringField(entity, 'id'),
        amountRefunded: numberField(entity, 'amount'),
        transactionId: ((entity.notes ?? {}) as Record<string, unknown>).plattr_tx as string | undefined,
      }
    }
    return { eventId: eventIdSafe, eventType: type || 'unknown', outcome: 'ignored' }
  }

  const header = headers.get('stripe-signature') ?? ''
  const { timestamp, signatures } = parseStripeSignature(header)
  if (!timestamp || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > STRIPE_TOLERANCE_SECONDS)
    throw new PaymentError('invalid_signature', 'That webhook timestamp is outside the accepted window.', 401)
  const expected = await hmacHex(webhookSecret, `${timestamp}.${rawBody}`)
  if (!signatures.some((signature) => sameHex(signature.toLowerCase(), expected)))
    throw new PaymentError('invalid_signature', 'That webhook signature is not valid.', 401)

  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    throw new PaymentError('invalid_json', 'That webhook body is not JSON.', 400)
  }
  const eventId = stringField(payload, 'id')
  const type = stringField(payload, 'type')
  const data = (payload.data ?? {}) as { object?: Record<string, unknown> }
  const object = data.object ?? {}
  const metadata = (object.metadata ?? {}) as Record<string, unknown>
  const transactionId = typeof metadata.plattr_tx === 'string' ? metadata.plattr_tx : undefined
  const eventIdSafe = eventId || `body_${(await hmacHex('event', rawBody)).slice(0, 40)}`

  if (type === 'checkout.session.completed') {
    return {
      eventId: eventIdSafe,
      eventType: type,
      outcome: stringField(object, 'payment_status') === 'paid' ? 'paid' : 'pending',
      providerOrderId: stringField(object, 'id'),
      providerPaymentId: stringField(object, 'payment_intent'),
      amount: numberField(object, 'amount_total'),
      currency: stringField(object, 'currency').toUpperCase(),
      transactionId,
    }
  }
  if (type === 'payment_intent.payment_failed') {
    return {
      eventId: eventIdSafe,
      eventType: type,
      outcome: 'failed',
      providerPaymentId: stringField(object, 'id'),
      amount: numberField(object, 'amount'),
      currency: stringField(object, 'currency').toUpperCase(),
      transactionId,
      reason: 'The gateway reported a failed payment.',
    }
  }
  if (type === 'charge.refunded') {
    const refundList = (object.refunds ?? {}) as { data?: Record<string, unknown>[] }
    return {
      eventId: eventIdSafe,
      eventType: type,
      outcome: 'refunded',
      providerPaymentId: stringField(object, 'payment_intent'),
      providerRefundId: refundList.data?.[0] ? stringField(refundList.data[0], 'id') : undefined,
      amountRefunded: numberField(object, 'amount_refunded'),
      currency: stringField(object, 'currency').toUpperCase(),
      transactionId,
    }
  }
  return { eventId: eventIdSafe, eventType: type || 'unknown', outcome: 'ignored' }
}
