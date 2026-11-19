import { getBooking, getOrder } from '../business'
import { ensureSchema, log, type Project } from '../db'
import { decryptJson, encryptJson, hmacHex, paymentVaultKey, sameHex } from './crypto'
import {
  createCheckout,
  parseWebhook,
  refundPayment,
  retrievePayment,
  testCredentials,
  credentialFormatError,
} from './providers'
import {
  PaymentError,
  PROVIDER_CURRENCIES,
  providerLabel,
  type CreatedCheckout,
  type PaymentKind,
  type PaymentMode,
  type PaymentStatus,
  type ProviderCredentials,
  type ProviderId,
  type RefundStatus,
} from './types'

/**
 * The shared payment service. Every trade uses this module; nothing here knows
 * about a trade's renderer. Amounts come from the order/booking rows or the
 * owner's catalogue, never from the browser. Secrets are only decrypted inside
 * a server call that needs to talk to the gateway.
 */

type Fetch = typeof fetch

type VaultSecrets = { keySecret: string; webhookSecret: string }

type ConnectionRow = {
  id: string
  project_id: string
  provider: string
  mode: string
  key_id: string
  secrets: string
  status: string
  last_verification: string
  last_verified_at: string
  last_error: string
  created_at: string
  updated_at: string
}

type SettingsRow = {
  project_id: string
  active_provider: string
  pay_orders: number
  pay_bookings: number
  booking_deposit_percent: number
  updated_at: string
}

export type PaymentSettings = {
  activeProvider: ProviderId | ''
  payOrders: boolean
  payBookings: boolean
  bookingDepositPercent: number
}

export type PaymentConnectionView = {
  provider: ProviderId
  mode: PaymentMode
  keyId: string
  status: 'connected' | 'attention'
  hasKeySecret: boolean
  lastVerification: 'untested' | 'ok' | 'failed'
  lastVerifiedAt: string
  lastError: string
  updatedAt: string
  webhookUrl: string
}

type TxRow = {
  id: string
  project_id: string
  connection_id: string
  provider: string
  mode: string
  kind: string
  ref_id: string
  ref_number: string
  customer_id: string
  customer_name: string
  customer_email: string
  customer_phone: string
  provider_order_id: string
  provider_payment_id: string
  provider_refund_id: string
  amount: number
  currency: string
  status: string
  refund_status: string
  amount_refunded: number
  checkout_url: string
  failure_reason: string
  created_at: string
  updated_at: string
  paid_at: string
}

export type PaymentTransactionView = {
  id: string
  provider: ProviderId
  mode: PaymentMode
  kind: PaymentKind
  reference: string
  refNumber: string
  customerName: string
  customerEmail: string
  amount: number
  currency: string
  status: PaymentStatus
  refundStatus: RefundStatus
  amountRefunded: number
  providerOrderId: string
  providerPaymentId: string
  failureReason: string
  createdAt: string
  paidAt: string
}

export type PaymentDashboard = {
  settings: PaymentSettings
  connections: PaymentConnectionView[]
  transactions: PaymentTransactionView[]
  summary: { collected: number; refunded: number; pending: number; failed: number }
  currency: string
}

export type PaymentCapability = {
  enabled: boolean
  provider: ProviderId | null
  mode: PaymentMode | null
  payOrders: boolean
  payBookings: boolean
  depositPercent: number
  currency: string
}

const DEFAULT_SETTINGS: PaymentSettings = {
  activeProvider: '',
  payOrders: true,
  payBookings: true,
  bookingDepositPercent: 20,
}

function makeId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function currencyFor(project: Project): string {
  return (project.spec.currency ?? 'USD').toUpperCase()
}

function currencySupported(provider: ProviderId, currency: string): boolean {
  return PROVIDER_CURRENCIES[provider].includes(currency)
}

function currencyMessage(provider: ProviderId, currency: string): string {
  if (provider === 'razorpay')
    return `Razorpay checkout in this build requires an INR catalogue; this app prices in ${currency}.`
  return `Stripe checkout in this build does not accept ${currency}. Change the app currency or use a supported one.`
}

async function settingsFor(db: D1Database, projectId: string): Promise<PaymentSettings & { rowExists: boolean }> {
  const row = await db
    .prepare('SELECT * FROM payment_settings WHERE project_id = ?')
    .bind(projectId)
    .first<SettingsRow>()
  if (!row) return { ...DEFAULT_SETTINGS, rowExists: false }
  return {
    activeProvider: row.active_provider === 'razorpay' || row.active_provider === 'stripe' ? row.active_provider : '',
    payOrders: Number(row.pay_orders) === 1,
    payBookings: Number(row.pay_bookings) === 1,
    bookingDepositPercent: Math.min(100, Math.max(5, Number(row.booking_deposit_percent) || 20)),
    rowExists: true,
  }
}

async function connectionFor(
  db: D1Database,
  projectId: string,
  provider: ProviderId,
): Promise<ConnectionRow | null> {
  return db
    .prepare('SELECT * FROM payment_connections WHERE project_id = ? AND provider = ?')
    .bind(projectId, provider)
    .first<ConnectionRow>()
}

async function allConnections(db: D1Database, projectId: string): Promise<ConnectionRow[]> {
  const result = await db
    .prepare('SELECT * FROM payment_connections WHERE project_id = ? ORDER BY provider')
    .bind(projectId)
    .all<ConnectionRow>()
  return result.results ?? []
}

function connectionView(row: ConnectionRow, token: string, origin: string): PaymentConnectionView {
  const provider = row.provider as ProviderId
  const last = row.last_verification === 'ok' || row.last_verification === 'failed' ? row.last_verification : 'untested'
  return {
    provider,
    mode: row.mode === 'live' ? 'live' : 'test',
    keyId: row.key_id,
    status: last === 'failed' ? 'attention' : 'connected',
    hasKeySecret: Boolean(row.secrets),
    lastVerification: last,
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error,
    updatedAt: row.updated_at,
    webhookUrl: `${origin}/p/${token}/payments/webhook/${provider}`,
  }
}

function transactionView(row: TxRow): PaymentTransactionView {
  return {
    id: row.id,
    provider: row.provider as ProviderId,
    mode: row.mode === 'live' ? 'live' : 'test',
    kind: row.kind === 'booking' ? 'booking' : 'order',
    reference: row.ref_id,
    refNumber: row.ref_number,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status as PaymentStatus,
    refundStatus: row.refund_status as RefundStatus,
    amountRefunded: Number(row.amount_refunded),
    providerOrderId: row.provider_order_id,
    providerPaymentId: row.provider_payment_id,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  }
}

/** The owner-facing dashboard payload. It never contains a secret value. */
export async function paymentDashboard(
  db: D1Database,
  project: Project,
  origin: string,
): Promise<PaymentDashboard> {
  await ensureSchema(db)
  const settings = await settingsFor(db, project.id)
  const connections = await allConnections(db, project.id)
  const result = await db
    .prepare('SELECT * FROM payment_transactions WHERE project_id = ? ORDER BY created_at DESC LIMIT 200')
    .bind(project.id)
    .all<TxRow>()
  const transactions = (result.results ?? []).map(transactionView)
  const summary = transactions.reduce(
    (totals, transaction) => {
      if (transaction.status === 'paid') totals.collected += transaction.amount
      totals.refunded += transaction.amountRefunded
      if (transaction.status === 'created' || transaction.status === 'pending') totals.pending += transaction.amount
      if (transaction.status === 'failed') totals.failed += 1
      return totals
    },
    { collected: 0, refunded: 0, pending: 0, failed: 0 },
  )
  return {
    settings: {
      activeProvider: settings.activeProvider,
      payOrders: settings.payOrders,
      payBookings: settings.payBookings,
      bookingDepositPercent: settings.bookingDepositPercent,
    },
    connections: connections.map((row) => connectionView(row, project.token, origin)),
    transactions,
    summary,
    currency: currencyFor(project),
  }
}

/** Public capability used by the app and the hosted pay page. */
export async function paymentCapability(db: D1Database, project: Project): Promise<PaymentCapability> {
  const settings = await settingsFor(db, project.id)
  const connections = await allConnections(db, project.id)
  const connected = connections.filter((row) => row.secrets)
  const preferred =
    connected.find((row) => row.provider === settings.activeProvider) ?? connected[0] ?? null
  const payOrders = settings.payOrders && project.spec.features.includes('ordering')
  const payBookings = settings.payBookings && project.spec.features.includes('booking')
  return {
    enabled: Boolean(preferred) && (payOrders || payBookings),
    provider: preferred ? (preferred.provider as ProviderId) : null,
    mode: preferred ? (preferred.mode === 'live' ? 'live' : 'test') : null,
    payOrders,
    payBookings,
    depositPercent: settings.bookingDepositPercent,
    currency: currencyFor(project),
  }
}

export async function savePaymentSettings(
  db: D1Database,
  project: Project,
  input: { activeProvider?: unknown; payOrders?: unknown; payBookings?: unknown; bookingDepositPercent?: unknown },
): Promise<PaymentSettings> {
  await ensureSchema(db)
  const current = await settingsFor(db, project.id)
  let activeProvider: ProviderId | '' = current.activeProvider
  if (input.activeProvider !== undefined) {
    const requested = typeof input.activeProvider === 'string' ? input.activeProvider : ''
    if (requested === '') activeProvider = ''
    else if (requested === 'razorpay' || requested === 'stripe') {
      const row = await connectionFor(db, project.id, requested)
      if (!row) throw new PaymentError('not_connected', 'Connect that gateway before making it active.', 422)
      activeProvider = requested
    } else throw new PaymentError('provider_invalid', 'Choose Razorpay or Stripe.', 422)
  }
  const payOrders = input.payOrders === undefined ? current.payOrders : input.payOrders === true
  const payBookings = input.payBookings === undefined ? current.payBookings : input.payBookings === true
  const percent =
    input.bookingDepositPercent === undefined
      ? current.bookingDepositPercent
      : Math.round(Number(input.bookingDepositPercent))
  if (!Number.isFinite(percent) || percent < 5 || percent > 100)
    throw new PaymentError('deposit_invalid', 'Choose a deposit between 5% and 100%.', 422)
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO payment_settings (project_id, active_provider, pay_orders, pay_bookings, booking_deposit_percent, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET active_provider = excluded.active_provider,
         pay_orders = excluded.pay_orders, pay_bookings = excluded.pay_bookings,
         booking_deposit_percent = excluded.booking_deposit_percent, updated_at = excluded.updated_at`,
    )
    .bind(project.id, activeProvider, payOrders ? 1 : 0, payBookings ? 1 : 0, percent, now)
    .run()
  await log(db, project.id, 'payment', 'Payment settings saved', `${payOrders ? 'orders' : 'no orders'} · ${payBookings ? `${percent}% booking deposit` : 'no bookings'}`)
  return { activeProvider, payOrders, payBookings, bookingDepositPercent: percent }
}

export async function saveConnection(
  db: D1Database,
  project: Project,
  env: { PAYMENT_ENCRYPTION_KEY?: string },
  provider: ProviderId,
  input: { keyId?: unknown; keySecret?: unknown; webhookSecret?: unknown; mode?: unknown },
  origin = '',
): Promise<PaymentConnectionView> {
  await ensureSchema(db)
  const key = paymentVaultKey(env)
  if (!key)
    throw new PaymentError(
      'vault_unavailable',
      'Payment credential storage is not configured on this deployment.',
      503,
    )
  const mode = input.mode === 'live' ? 'live' : input.mode === 'test' ? 'test' : null
  if (!mode) throw new PaymentError('mode_invalid', 'Choose test or live mode.', 422)
  const keyId = typeof input.keyId === 'string' ? input.keyId.trim() : ''
  const keySecret = typeof input.keySecret === 'string' ? input.keySecret.trim() : ''
  const webhookSecret = typeof input.webhookSecret === 'string' ? input.webhookSecret.trim() : ''

  const existing = await connectionFor(db, project.id, provider)
  let previous: VaultSecrets | null = null
  if (existing) previous = await decryptJson<VaultSecrets>(key, project.id, provider, existing.secrets)
  const nextSecrets: VaultSecrets = {
    keySecret: keySecret || previous?.keySecret || '',
    webhookSecret: webhookSecret || previous?.webhookSecret || '',
  }
  if (!nextSecrets.keySecret)
    throw new PaymentError('secret_required', 'Add the gateway secret key.', 422)
  if (!nextSecrets.webhookSecret || nextSecrets.webhookSecret.length < 8)
    throw new PaymentError('webhook_secret_required', 'Add the webhook signing secret (at least 8 characters).', 422)

  const formatError = credentialFormatError(provider, mode, keyId, nextSecrets.keySecret)
  if (formatError) throw new PaymentError('credentials_invalid', formatError, 422)

  const currency = currencyFor(project)
  if (!currencySupported(provider, currency))
    throw new PaymentError('currency_unsupported', currencyMessage(provider, currency), 422)

  const now = new Date().toISOString()
  const encrypted = await encryptJson(key, project.id, provider, nextSecrets)
  const id = existing?.id ?? makeId('pcn')
  await db
    .prepare(
      `INSERT INTO payment_connections (id, project_id, provider, mode, key_id, secrets, status, last_verification, last_verified_at, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'connected', 'untested', '', '', ?, ?)
       ON CONFLICT(project_id, provider) DO UPDATE SET mode = excluded.mode, key_id = excluded.key_id,
         secrets = excluded.secrets, status = 'connected', last_verification = 'untested',
         last_verified_at = '', last_error = '', updated_at = excluded.updated_at`,
    )
    .bind(id, project.id, provider, mode, keyId, encrypted, now, now)
    .run()

  const settings = await settingsFor(db, project.id)
  if (!settings.activeProvider) await savePaymentSettings(db, project, { activeProvider: provider })
  await log(db, project.id, 'payment', `${providerLabel(provider)} connected`, `${mode} mode · keys saved encrypted`)
  return connectionView(
    (await connectionFor(db, project.id, provider)) as ConnectionRow,
    project.token,
    origin,
  )
}

export async function testConnection(
  db: D1Database,
  project: Project,
  env: { PAYMENT_ENCRYPTION_KEY?: string },
  provider: ProviderId,
  fetchImpl: Fetch = fetch,
  origin = '',
): Promise<{ ok: boolean; message: string; connection: PaymentConnectionView }> {
  await ensureSchema(db)
  const row = await connectionFor(db, project.id, provider)
  if (!row) throw new PaymentError('not_connected', 'Save the gateway keys first.', 422)
  const key = paymentVaultKey(env)
  if (!key) throw new PaymentError('vault_unavailable', 'Payment credential storage is not configured.', 503)
  const secrets = await decryptJson<VaultSecrets>(key, project.id, provider, row.secrets)
  if (!secrets) throw new PaymentError('vault_error', 'The saved credentials could not be read.', 503)
  const credentials: ProviderCredentials = { keyId: row.key_id, ...secrets }
  const result = await testCredentials(provider, credentials, fetchImpl)
  const now = new Date().toISOString()
  await db
    .prepare(
      `UPDATE payment_connections SET last_verification = ?, last_verified_at = ?, last_error = ?,
         status = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(result.ok ? 'ok' : 'failed', now, result.ok ? '' : result.message, result.ok ? 'connected' : 'attention', now, row.id)
    .run()
  await log(
    db,
    project.id,
    'payment',
    `${providerLabel(provider)} ${result.ok ? 'verified' : 'verification failed'}`,
    result.ok ? `${row.mode === 'live' ? 'Live' : 'Test'} credentials accepted` : result.message,
  )
  const updated = (await connectionFor(db, project.id, provider)) as ConnectionRow
  return { ...result, connection: connectionView(updated, project.token, origin) }
}

export async function disconnectConnection(
  db: D1Database,
  project: Project,
  provider: ProviderId,
): Promise<void> {
  await ensureSchema(db)
  const row = await connectionFor(db, project.id, provider)
  if (!row) throw new PaymentError('not_connected', 'That gateway is not connected.', 404)
  await db
    .prepare('DELETE FROM payment_connections WHERE project_id = ? AND provider = ?')
    .bind(project.id, provider)
    .run()
  const settings = await settingsFor(db, project.id)
  if (settings.activeProvider === provider) {
    const remaining = (await allConnections(db, project.id)).find((entry) => entry.secrets)
    await savePaymentSettings(db, project, {
      activeProvider: remaining ? (remaining.provider as ProviderId) : '',
    })
  }
  await log(
    db,
    project.id,
    'payment',
    `${providerLabel(provider)} disconnected`,
    'Saved credentials were removed. Existing transaction records are kept.',
  )
}

async function loadTransaction(
  db: D1Database,
  projectId: string,
  id: string,
): Promise<TxRow | null> {
  if (!/^pay_[a-f0-9]{20}$/.test(id)) return null
  return db
    .prepare('SELECT * FROM payment_transactions WHERE id = ? AND project_id = ?')
    .bind(id, projectId)
    .first<TxRow>()
}

async function amountFor(
  db: D1Database,
  project: Project,
  kind: PaymentKind,
  refId: string,
): Promise<{ amount: number; refNumber: string; customer: { id: string; name: string; email: string; phone: string } }> {
  if (kind === 'order') {
    const order = await getOrder(db, project.id, refId)
    if (!order) throw new PaymentError('not_found', 'That order could not be found.', 404)
    return {
      amount: order.total,
      refNumber: `#${order.number}`,
      customer: { ...order.customer },
    }
  }
  const booking = await getBooking(db, project.id, refId)
  if (!booking) throw new PaymentError('not_found', 'That booking could not be found.', 404)
  const settings = await settingsFor(db, project.id)
  const item = project.spec.menu.flatMap((section) => section.items).find((entry) => entry.name === booking.service)
  if (!item || item.price <= 0)
    throw new PaymentError(
      'amount_unavailable',
      'This booking has no priced service, so a deposit cannot be calculated.',
      422,
    )
  const amount = Math.max(1, Math.round((item.price * settings.bookingDepositPercent) / 100))
  return {
    amount,
    refNumber: `#${booking.number}`,
    customer: { ...booking.customer },
  }
}

export type StartedPayment = {
  id: string
  payUrl: string
  amount: number
  currency: string
  provider: ProviderId
  mode: PaymentMode
}

/** Creates a provider order/session for an existing real record. */
export async function startCheckout(
  db: D1Database,
  project: Project,
  env: { PAYMENT_ENCRYPTION_KEY?: string },
  origin: string,
  input: { kind?: unknown; refId?: unknown },
  fetchImpl: Fetch = fetch,
): Promise<StartedPayment> {
  await ensureSchema(db)
  const kind: PaymentKind | null = input.kind === 'order' ? 'order' : input.kind === 'booking' ? 'booking' : null
  const refId = typeof input.refId === 'string' ? input.refId : ''
  if (!kind || !refId) throw new PaymentError('payment_invalid', 'Choose an order or booking to pay.', 422)
  if (kind === 'order' && project.spec.features.includes('ordering') === false)
    throw new PaymentError('workflow_unsupported', 'This app does not take online orders.', 422)
  if (kind === 'booking' && project.spec.features.includes('booking') === false)
    throw new PaymentError('workflow_unsupported', 'This app does not take bookings.', 422)

  const capability = await paymentCapability(db, project)
  if (!capability.provider)
    throw new PaymentError('gateway_not_connected', 'This business has not connected a payment gateway.', 422)
  if (!capability.enabled)
    throw new PaymentError('payments_disabled', 'This business has not enabled an online payment option.', 422)
  if (kind === 'order' && !capability.payOrders)
    throw new PaymentError('payments_disabled', 'Online payment for orders is turned off.', 422)
  if (kind === 'booking' && !capability.payBookings)
    throw new PaymentError('payments_disabled', 'Online payment for bookings is turned off.', 422)

  const provider = capability.provider
  const row = await connectionFor(db, project.id, provider)
  if (!row) throw new PaymentError('gateway_not_connected', 'This business has not connected a payment gateway.', 422)
  const key = paymentVaultKey(env)
  if (!key) throw new PaymentError('vault_unavailable', 'Payment credential storage is not configured.', 503)
  const secrets = await decryptJson<VaultSecrets>(key, project.id, provider, row.secrets)
  if (!secrets) throw new PaymentError('vault_error', 'The saved gateway credentials could not be read.', 503)

  const { amount, refNumber, customer } = await amountFor(db, project, kind, refId)
  const currency = currencyFor(project)
  if (!currencySupported(provider, currency))
    throw new PaymentError('currency_unsupported', currencyMessage(provider, currency), 422)

  const paid = await db
    .prepare(
      "SELECT id FROM payment_transactions WHERE project_id = ? AND kind = ? AND ref_id = ? AND status = 'paid' LIMIT 1",
    )
    .bind(project.id, kind, refId)
    .first<{ id: string }>()
  if (paid) throw new PaymentError('already_paid', 'That record is already paid.', 409)

  const pending = await db
    .prepare(
      "SELECT * FROM payment_transactions WHERE project_id = ? AND kind = ? AND ref_id = ? AND status IN ('created','pending') ORDER BY created_at DESC LIMIT 1",
    )
    .bind(project.id, kind, refId)
    .first<TxRow>()
  if (pending && Date.now() - Date.parse(pending.created_at) < 30 * 60 * 1000 && pending.amount === amount) {
    return {
      id: pending.id,
      payUrl: `/p/${project.token}/pay/${pending.id}`,
      amount: pending.amount,
      currency: pending.currency,
      provider,
      mode: capability.mode ?? 'test',
    }
  }
  if (pending) {
    await db
      .prepare("UPDATE payment_transactions SET status = 'cancelled', failure_reason = ?, updated_at = ? WHERE id = ?")
      .bind('Superseded by a newer payment attempt.', new Date().toISOString(), pending.id)
      .run()
  }

  const id = makeId('pay')
  const now = new Date().toISOString()
  const mode: PaymentMode = row.mode === 'live' ? 'live' : 'test'
  await db
    .prepare(
      `INSERT INTO payment_transactions (id, project_id, connection_id, provider, mode, kind, ref_id, ref_number,
         customer_id, customer_name, customer_email, customer_phone, amount, currency, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?)`,
    )
    .bind(
      id,
      project.id,
      row.id,
      provider,
      mode,
      kind,
      refId,
      refNumber,
      customer.id ?? '',
      customer.name ?? '',
      customer.email ?? '',
      customer.phone ?? '',
      amount,
      currency,
      now,
      now,
    )
    .run()

  let checkout: CreatedCheckout
  try {
    checkout = await createCheckout({
      provider,
      credentials: { keyId: row.key_id, ...secrets },
      amount,
      currency,
      businessName: project.spec.name,
      reference: `${kind === 'order' ? 'Order' : 'Booking'} ${refNumber}`,
      transactionId: id,
      token: project.token,
      origin,
      customer: { name: customer.name ?? '', email: customer.email ?? '', phone: customer.phone ?? '' },
      fetchImpl,
    })
  } catch (error) {
    const message = error instanceof PaymentError ? error.message : 'The gateway could not start this payment.'
    await db
      .prepare("UPDATE payment_transactions SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?")
      .bind(message, new Date().toISOString(), id)
      .run()
    await log(db, project.id, 'payment', 'Payment could not start', `${providerLabel(provider)} · ${message}`)
    throw error instanceof PaymentError ? error : new PaymentError('provider_error', message, 502)
  }

  await db
    .prepare(
      "UPDATE payment_transactions SET provider_order_id = ?, checkout_url = ?, status = 'pending', updated_at = ? WHERE id = ?",
    )
    .bind(checkout.providerOrderId, checkout.redirectUrl ?? '', new Date().toISOString(), id)
    .run()
  await log(
    db,
    project.id,
    'payment',
    'Payment started',
    `${providerLabel(provider)} · ${kind} ${refNumber} · ${(amount / 100).toFixed(2)} ${currency}`,
  )
  return { id, payUrl: `/p/${project.token}/pay/${id}`, amount, currency, provider, mode }
}

async function markPaid(db: D1Database, project: Project, tx: TxRow, paymentId: string): Promise<void> {
  const now = new Date().toISOString()
  // The order/booking flag is written first and the transaction row is the
  // commit marker. If a delivery dies between the two writes, the provider's
  // retry still sees a pending transaction and re-applies the flag, so a
  // customer is never charged against an order the owner sees as unpaid.
  if (tx.kind === 'booking') {
    await db
      .prepare("UPDATE bookings SET payment_status = 'paid', paid_amount = ?, updated_at = ? WHERE id = ? AND project_id = ?")
      .bind(tx.amount, now, tx.ref_id, project.id)
      .run()
  } else {
    await db
      .prepare("UPDATE orders SET payment_status = 'paid', updated_at = ? WHERE id = ? AND project_id = ?")
      .bind(now, tx.ref_id, project.id)
      .run()
  }
  await db
    .prepare(
      "UPDATE payment_transactions SET status = 'paid', provider_payment_id = ?, paid_at = ?, updated_at = ?, failure_reason = '' WHERE id = ?",
    )
    .bind(paymentId || tx.provider_payment_id, now, now, tx.id)
    .run()
  await log(
    db,
    project.id,
    'payment',
    'Payment received',
    `${providerLabel(tx.provider as ProviderId)} · ${tx.kind} ${tx.ref_number} · ${(tx.amount / 100).toFixed(2)} ${tx.currency}`,
  )
}

function amountMatches(tx: TxRow, amount?: number, currency?: string): boolean {
  if (amount !== undefined && amount !== Number(tx.amount)) return false
  if (currency && currency.toUpperCase() !== tx.currency.toUpperCase()) return false
  return true
}

async function applyEvent(
  db: D1Database,
  project: Project,
  tx: TxRow,
  event: { outcome: string; providerPaymentId?: string; amount?: number; currency?: string; amountRefunded?: number; providerRefundId?: string; reason?: string },
): Promise<void> {
  if (event.outcome === 'paid') {
    // A settled transaction is final. A duplicate paid event that disagrees
    // about the amount is ignored instead of downgrading a real payment, but
    // an order-level event may still supply the payment reference a refund
    // needs if it arrives after the sale settled.
    if (tx.status === 'paid') {
      if (event.providerPaymentId && !tx.provider_payment_id)
        await db
          .prepare('UPDATE payment_transactions SET provider_payment_id = ?, updated_at = ? WHERE id = ?')
          .bind(event.providerPaymentId, new Date().toISOString(), tx.id)
          .run()
      return
    }
    // A signed event that omits the amount or currency cannot prove what was
    // charged, so it is treated as a mismatch rather than as payment.
    if (event.amount === undefined || !event.currency || !amountMatches(tx, event.amount, event.currency)) {
      await db
        .prepare("UPDATE payment_transactions SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?")
        .bind('The gateway amount or currency did not match the order.', new Date().toISOString(), tx.id)
        .run()
      await log(
        db,
        project.id,
        'payment',
        'Payment amount mismatch',
        `${providerLabel(tx.provider as ProviderId)} · ${tx.kind} ${tx.ref_number}`,
      )
      return
    }
    await markPaid(db, project, tx, event.providerPaymentId ?? '')
    return
  }
  // Out-of-order delivery: a failure event that arrives after the payment
  // settled must not un-pay the order.
  if (event.outcome === 'failed' && tx.status === 'paid') return
  if (event.outcome === 'failed') {
    await db
      .prepare("UPDATE payment_transactions SET status = 'failed', failure_reason = ?, provider_payment_id = ?, updated_at = ? WHERE id = ?")
      .bind(
        event.reason || 'The gateway reported a failed payment.',
        event.providerPaymentId || tx.provider_payment_id,
        new Date().toISOString(),
        tx.id,
      )
      .run()
    await log(db, project.id, 'payment', 'Payment failed', `${tx.kind} ${tx.ref_number} · ${event.reason ?? 'gateway declined'}`)
    return
  }
  if (event.outcome === 'refunded') {
    // A refund only makes sense for money that actually settled.
    if (tx.status !== 'paid') return
    const refunded = Math.min(tx.amount, Number(event.amountRefunded ?? tx.amount))
    const full = refunded >= tx.amount
    const recorded = tx.refund_status === 'refunded' && Number(tx.amount_refunded) === refunded
    const now = new Date().toISOString()
    await db
      .prepare(
        'UPDATE payment_transactions SET refund_status = ?, amount_refunded = ?, provider_refund_id = ?, updated_at = ? WHERE id = ?',
      )
      .bind(full ? 'refunded' : 'partial', refunded, event.providerRefundId || tx.provider_refund_id, now, tx.id)
      .run()
    if (full) {
      if (tx.kind === 'booking')
        await db
          .prepare("UPDATE bookings SET payment_status = 'refunded', updated_at = ? WHERE id = ? AND project_id = ?")
          .bind(now, tx.ref_id, project.id)
          .run()
      else
        await db
          .prepare("UPDATE orders SET payment_status = 'refunded', updated_at = ? WHERE id = ? AND project_id = ?")
          .bind(now, tx.ref_id, project.id)
          .run()
    }
    if (!recorded)
      await log(
        db,
        project.id,
        'payment',
        full ? 'Payment refunded' : 'Partial refund recorded',
        `${(refunded / 100).toFixed(2)} ${tx.currency} · ${tx.kind} ${tx.ref_number}`,
      )
  }
}

export async function verifyRazorpayCheckout(
  db: D1Database,
  project: Project,
  env: { PAYMENT_ENCRYPTION_KEY?: string },
  input: { transactionId?: unknown; razorpayOrderId?: unknown; razorpayPaymentId?: unknown; signature?: unknown },
  fetchImpl: Fetch = fetch,
): Promise<PaymentTransactionView> {
  await ensureSchema(db)
  const id = typeof input.transactionId === 'string' ? input.transactionId : ''
  const tx = await loadTransaction(db, project.id, id)
  if (!tx || tx.provider !== 'razorpay') throw new PaymentError('not_found', 'That payment could not be found.', 404)
  if (tx.status === 'paid') return transactionView(tx)
  const row = await connectionFor(db, project.id, 'razorpay')
  if (!row) throw new PaymentError('gateway_not_connected', 'Razorpay is not connected.', 422)
  const key = paymentVaultKey(env)
  if (!key) throw new PaymentError('vault_unavailable', 'Payment credential storage is not configured.', 503)
  const secrets = await decryptJson<VaultSecrets>(key, project.id, 'razorpay', row.secrets)
  if (!secrets) throw new PaymentError('vault_error', 'The saved gateway credentials could not be read.', 503)

  const orderId = typeof input.razorpayOrderId === 'string' ? input.razorpayOrderId : ''
  const paymentId = typeof input.razorpayPaymentId === 'string' ? input.razorpayPaymentId : ''
  const signature = typeof input.signature === 'string' ? input.signature : ''
  if (!orderId || !paymentId || !signature)
    throw new PaymentError('payment_invalid', 'The gateway response was incomplete.', 422)
  if (orderId !== tx.provider_order_id)
    throw new PaymentError('order_mismatch', 'That payment does not belong to this order.', 409)
  const expected = await hmacHex(secrets.keySecret, `${orderId}|${paymentId}`)
  if (!sameHex(signature.toLowerCase(), expected))
    throw new PaymentError('invalid_signature', 'The payment signature is not valid.', 401)

  const retrieved = await retrievePayment({
    provider: 'razorpay',
    credentials: { keyId: row.key_id, ...secrets },
    providerOrderId: orderId,
    providerPaymentId: paymentId,
    fetchImpl,
  })
  if (retrieved.status === 'paid') {
    await applyEvent(db, project, tx, {
      outcome: 'paid',
      providerPaymentId: retrieved.providerPaymentId ?? paymentId,
      amount: retrieved.amount,
      currency: retrieved.currency,
    })
  } else if (retrieved.status === 'failed') {
    await applyEvent(db, project, tx, { outcome: 'failed', reason: retrieved.reason })
  }
  return transactionView((await loadTransaction(db, project.id, id)) as TxRow)
}

/** Re-checks a pending transaction with the provider; redirects are not proof. */
export async function refreshTransaction(
  db: D1Database,
  project: Project,
  env: { PAYMENT_ENCRYPTION_KEY?: string },
  transactionId: string,
  fetchImpl: Fetch = fetch,
): Promise<PaymentTransactionView | null> {
  await ensureSchema(db)
  const tx = await loadTransaction(db, project.id, transactionId)
  if (!tx) return null
  if (tx.status === 'paid' || tx.status === 'failed' || tx.status === 'cancelled') return transactionView(tx)
  const provider = tx.provider as ProviderId
  const row = await connectionFor(db, project.id, provider)
  if (!row || !tx.provider_order_id) return transactionView(tx)
  const key = paymentVaultKey(env)
  if (!key) return transactionView(tx)
  const secrets = await decryptJson<VaultSecrets>(key, project.id, provider, row.secrets)
  if (!secrets) return transactionView(tx)
  try {
    const retrieved = await retrievePayment({
      provider,
      credentials: { keyId: row.key_id, ...secrets },
      providerOrderId: tx.provider_order_id,
      providerPaymentId: tx.provider_payment_id || undefined,
      fetchImpl,
    })
    if (retrieved.status === 'paid')
      await applyEvent(db, project, tx, {
        outcome: 'paid',
        providerPaymentId: retrieved.providerPaymentId,
        amount: retrieved.amount,
        currency: retrieved.currency,
      })
    else if (retrieved.status === 'failed')
      await applyEvent(db, project, tx, { outcome: 'failed', reason: retrieved.reason })
    else if (retrieved.providerPaymentId && retrieved.providerPaymentId !== tx.provider_payment_id)
      await db
        .prepare('UPDATE payment_transactions SET provider_payment_id = ?, updated_at = ? WHERE id = ?')
        .bind(retrieved.providerPaymentId, new Date().toISOString(), tx.id)
        .run()
  } catch (error) {
    if (error instanceof PaymentError) return transactionView(tx)
    throw error
  }
  return transactionView((await loadTransaction(db, project.id, transactionId)) as TxRow)
}

export async function handleWebhook(
  db: D1Database,
  project: Project,
  env: { PAYMENT_ENCRYPTION_KEY?: string },
  provider: ProviderId,
  rawBody: string,
  headers: Headers,
): Promise<{ duplicate: boolean; matched: boolean; outcome: string }> {
  await ensureSchema(db)
  const row = await connectionFor(db, project.id, provider)
  if (!row) throw new PaymentError('not_connected', 'That gateway is not connected.', 404)
  const key = paymentVaultKey(env)
  if (!key) throw new PaymentError('vault_unavailable', 'Payment credential storage is not configured.', 503)
  const secrets = await decryptJson<VaultSecrets>(key, project.id, provider, row.secrets)
  if (!secrets) throw new PaymentError('vault_error', 'The saved gateway credentials could not be read.', 503)

  const event = await parseWebhook({ provider, rawBody, headers, webhookSecret: secrets.webhookSecret })

  const existing = await db
    .prepare('SELECT * FROM payment_events WHERE project_id = ? AND provider = ? AND event_id = ?')
    .bind(project.id, provider, event.eventId)
    .first<{ id: string; status: string }>()
  // Only a processed event is a duplicate. A delivery interrupted by a crash
  // (`received`), a retryable failure, or an early `ignored` event is
  // reprocessed so the provider's retry can still settle the payment.
  if (existing && existing.status === 'processed')
    return { duplicate: true, matched: false, outcome: 'duplicate' }
  const now = new Date().toISOString()
  if (existing) {
    await db
      .prepare("UPDATE payment_events SET status = 'received', event_type = ?, detail = '' WHERE id = ?")
      .bind(event.eventType, existing.id)
      .run()
  } else {
    await db
      .prepare('INSERT INTO payment_events (id, project_id, provider, event_id, event_type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(makeId('pev'), project.id, provider, event.eventId, event.eventType, 'received', now)
      .run()
  }

  try {
    let tx: TxRow | null = null
    if (event.transactionId) tx = await loadTransaction(db, project.id, event.transactionId)
    if (!tx && event.providerOrderId)
      tx = await db
        .prepare('SELECT * FROM payment_transactions WHERE project_id = ? AND provider = ? AND provider_order_id = ?')
        .bind(project.id, provider, event.providerOrderId)
        .first<TxRow>()
    if (!tx && event.providerPaymentId)
      tx = await db
        .prepare('SELECT * FROM payment_transactions WHERE project_id = ? AND provider = ? AND provider_payment_id = ?')
        .bind(project.id, provider, event.providerPaymentId)
        .first<TxRow>()
    if (!tx) {
      await db
        .prepare("UPDATE payment_events SET status = 'ignored', detail = 'No matching payment' WHERE project_id = ? AND provider = ? AND event_id = ?")
        .bind(project.id, provider, event.eventId)
        .run()
      return { duplicate: false, matched: false, outcome: 'ignored' }
    }
    if (event.outcome !== 'ignored') await applyEvent(db, project, tx, event)
    await db
      .prepare("UPDATE payment_events SET status = 'processed' WHERE project_id = ? AND provider = ? AND event_id = ?")
      .bind(project.id, provider, event.eventId)
      .run()
    return { duplicate: false, matched: true, outcome: event.outcome }
  } catch (error) {
    await db
      .prepare("UPDATE payment_events SET status = 'failed', detail = ? WHERE project_id = ? AND provider = ? AND event_id = ?")
      .bind(error instanceof Error ? error.message.slice(0, 200) : 'Processing failed', project.id, provider, event.eventId)
      .run()
    throw error
  }
}

export async function refundTransaction(
  db: D1Database,
  project: Project,
  env: { PAYMENT_ENCRYPTION_KEY?: string },
  transactionId: string,
  fetchImpl: Fetch = fetch,
): Promise<PaymentTransactionView> {
  await ensureSchema(db)
  const tx = await loadTransaction(db, project.id, transactionId)
  if (!tx) throw new PaymentError('not_found', 'That payment could not be found.', 404)
  if (tx.status !== 'paid') throw new PaymentError('not_paid', 'Only a paid transaction can be refunded.', 409)
  if (tx.refund_status === 'refunded') throw new PaymentError('already_refunded', 'That payment is already refunded.', 409)
  const provider = tx.provider as ProviderId
  const row = await connectionFor(db, project.id, provider)
  if (!row)
    throw new PaymentError('gateway_not_connected', 'Reconnect the gateway before refunding through Plattr.', 422)
  const key = paymentVaultKey(env)
  if (!key) throw new PaymentError('vault_unavailable', 'Payment credential storage is not configured.', 503)
  const secrets = await decryptJson<VaultSecrets>(key, project.id, provider, row.secrets)
  if (!secrets) throw new PaymentError('vault_error', 'The saved gateway credentials could not be read.', 503)

  const previousRefund = tx.refund_status === 'failed' ? 'failed' : 'none'
  // Claim the refund atomically. Two tabs or a double click must not send two
  // full refunds to the provider, which would refund more than was charged.
  const claim = await db
    .prepare(
      "UPDATE payment_transactions SET refund_status = 'requested', updated_at = ? WHERE id = ? AND project_id = ? AND status = 'paid' AND refund_status IN ('none','failed')",
    )
    .bind(new Date().toISOString(), tx.id, project.id)
    .run()
  if (Number(claim.meta?.changes ?? 0) !== 1)
    throw new PaymentError('refund_pending', 'A refund for this payment is already in progress or recorded.', 409)

  let result: { refundId: string; status: 'refunded' | 'requested' }
  try {
    result = await refundPayment({
      provider,
      credentials: { keyId: row.key_id, ...secrets },
      providerPaymentId: tx.provider_payment_id,
      amount: tx.amount,
      fetchImpl,
    })
  } catch (error) {
    if (error instanceof PaymentError && error.code === 'refund_outcome_unknown') {
      // The gateway may already have created this refund (timeout, dropped
      // connection, 5xx, unreadable success body). Releasing the claim would let
      // the next click send a second full refund, so the claim stays and the
      // owner reconciles in the gateway dashboard before anything is retried.
      const kept = await db
        .prepare(
          "UPDATE payment_transactions SET refund_status = 'requested', failure_reason = ?, updated_at = ? WHERE id = ? AND project_id = ? AND refund_status = 'requested'",
        )
        .bind(error.message, new Date().toISOString(), tx.id, project.id)
        .run()
      // A refund webhook may have settled the row while the call was in flight;
      // only claim credit for the reconciliation note if the claim is still ours.
      if (Number(kept.meta?.changes ?? 0) === 1)
        await log(
          db,
          project.id,
          'payment',
          'Refund needs reconciliation',
          `${providerLabel(provider)} · ${tx.kind} ${tx.ref_number} · gateway did not confirm the refund`,
        )
      throw error
    }
    // Only a definite gateway refusal releases the claim so it can be retried.
    // The `requested` guard keeps a refund webhook that arrived mid-call from
    // being overwritten.
    await db
      .prepare(
        "UPDATE payment_transactions SET refund_status = ?, updated_at = ? WHERE id = ? AND project_id = ? AND refund_status = 'requested'",
      )
      .bind(previousRefund, new Date().toISOString(), tx.id, project.id)
      .run()
    throw error
  }
  await db
    .prepare(
      "UPDATE payment_transactions SET refund_status = ?, provider_refund_id = ?, updated_at = ? WHERE id = ? AND project_id = ? AND refund_status = 'requested'",
    )
    .bind(
      result.status === 'refunded' ? 'refunded' : 'requested',
      result.refundId,
      new Date().toISOString(),
      tx.id,
      project.id,
    )
    .run()
  if (result.status === 'refunded') await applyEvent(db, project, tx, { outcome: 'refunded', amountRefunded: tx.amount })
  else
    await log(
      db,
      project.id,
      'payment',
      'Refund requested',
      `${providerLabel(provider)} · ${tx.kind} ${tx.ref_number} · awaiting confirmation`,
    )
  return transactionView((await loadTransaction(db, project.id, transactionId)) as TxRow)
}

/** The public key id is safe to render; the secret never leaves the Worker. */
export async function checkoutPresentation(
  db: D1Database,
  project: Project,
  transactionId: string,
): Promise<{
  transaction: PaymentTransactionView & { businessName: string; token: string }
  razorpay?: { keyId: string; orderId: string; amount: number; currency: string; name: string; description: string; email: string; phone: string }
} | null> {
  const tx = await loadTransaction(db, project.id, transactionId)
  if (!tx) return null
  const view = transactionView(tx)
  const base = { ...view, businessName: project.spec.name, token: project.token }
  if (tx.provider !== 'razorpay' || tx.status === 'paid' || !tx.provider_order_id) return { transaction: base }
  const row = await connectionFor(db, project.id, 'razorpay')
  if (!row) return { transaction: base }
  return {
    transaction: base,
    razorpay: {
      keyId: row.key_id,
      orderId: tx.provider_order_id,
      amount: tx.amount,
      currency: tx.currency,
      name: project.spec.name,
      description: `${tx.kind === 'order' ? 'Order' : 'Booking'} ${tx.ref_number}`,
      email: tx.customer_email,
      phone: tx.customer_phone,
    },
  }
}
