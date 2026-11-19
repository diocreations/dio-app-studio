export type ProviderId = 'razorpay' | 'stripe'
export type PaymentMode = 'test' | 'live'
export type PaymentStatus = 'created' | 'pending' | 'paid' | 'failed' | 'cancelled'
export type RefundStatus = 'none' | 'requested' | 'partial' | 'refunded' | 'failed'
export type PaymentKind = 'order' | 'booking'

export type ProviderCredentials = {
  keyId: string
  keySecret: string
  webhookSecret: string
}

export type CreatedCheckout = {
  providerOrderId: string
  redirectUrl?: string
}

export type ProviderEvent = {
  eventId: string
  eventType: string
  outcome: 'paid' | 'failed' | 'refunded' | 'pending' | 'ignored'
  providerOrderId?: string
  providerPaymentId?: string
  providerRefundId?: string
  amount?: number
  amountRefunded?: number
  currency?: string
  transactionId?: string
  reason?: string
}

export class PaymentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 502 | 503 = 400,
  ) {
    super(message)
  }
}

export const PROVIDERS: ProviderId[] = ['razorpay', 'stripe']

/** Only two-decimal currencies are accepted, because amounts are integers. */
export const PROVIDER_CURRENCIES: Record<ProviderId, string[]> = {
  // Razorpay domestic checkout is INR; international currencies depend on an
  // account facility Plattr cannot assume.
  razorpay: ['INR'],
  stripe: ['USD', 'GBP', 'EUR', 'AUD', 'CAD', 'SGD', 'AED', 'INR'],
}

export function isProvider(value: unknown): value is ProviderId {
  return value === 'razorpay' || value === 'stripe'
}

export function isMode(value: unknown): value is PaymentMode {
  return value === 'test' || value === 'live'
}

export function providerLabel(provider: ProviderId): string {
  return provider === 'razorpay' ? 'Razorpay' : 'Stripe'
}
