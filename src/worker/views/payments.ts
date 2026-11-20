import type { Project } from '../db'
import type { PaymentTransactionView } from '../payments/service'
import { CURRENCY_SYMBOLS } from '../pricing'
import { esc } from './shell'

/**
 * Hosted payment pages. These live outside the customer app shell on purpose:
 * the app never handles card details. Razorpay Checkout opens here, Stripe
 * redirects to its own hosted session, and the return page reads the server's
 * transaction state rather than trusting the browser.
 */

const STATUS_COPY: Record<string, { label: string; heading: string; body: string; tone: string }> = {
  created: {
    label: 'Starting',
    heading: 'Preparing your payment',
    body: 'This should only take a moment. Reload the page if it does not continue.',
    tone: 'wait',
  },
  pending: {
    label: 'Pending',
    heading: 'Waiting for the gateway',
    body: 'We have not received a confirmed payment yet. If you completed checkout, check again in a moment.',
    tone: 'wait',
  },
  paid: {
    label: 'Paid',
    heading: 'Payment received',
    body: 'The business has been paid directly. Keep this reference for your records.',
    tone: 'good',
  },
  failed: {
    label: 'Not completed',
    heading: 'Payment not completed',
    body: 'No money has been taken. You can return to the app and try again, or pay the business directly.',
    tone: 'bad',
  },
  cancelled: {
    label: 'Cancelled',
    heading: 'Payment cancelled',
    body: 'This payment attempt was replaced or cancelled. Start a new payment from the app if you still need to pay.',
    tone: 'bad',
  },
}

function money(amount: number, currency: string): string {
  const code = (currency ?? '').toUpperCase()
  const value = (amount / 100).toFixed(2)
  const symbol = CURRENCY_SYMBOLS[code]
  // A currency this app does not know is named in full; an amount with no
  // currency at all is never dressed up as dollars.
  return symbol ? `${symbol}${value}` : code ? `${code} ${value}` : value
}

export function paymentPage(options: {
  project: Project
  transaction: PaymentTransactionView & { businessName: string; token: string }
  razorpay?: {
    keyId: string
    orderId: string
    amount: number
    currency: string
    name: string
    description: string
    email: string
    phone: string
  }
}): string {
  const { project, transaction, razorpay } = options
  const copy = STATUS_COPY[transaction.status] ?? STATUS_COPY.pending
  const appUrl = `/p/${esc(project.token)}/app`
  const statusUrl = `/p/${esc(project.token)}/payment/${esc(transaction.id)}`
  const isTest = transaction.mode === 'test'
  const refunded = transaction.refundStatus === 'refunded'
  const providerName = transaction.provider === 'razorpay' ? 'Razorpay' : 'Stripe'
  const payConfig = razorpay
    ? {
        key: razorpay.keyId,
        amount: razorpay.amount,
        currency: razorpay.currency,
        name: razorpay.name,
        description: razorpay.description,
        order_id: razorpay.orderId,
        prefill: { name: transaction.customerName, email: razorpay.email, contact: razorpay.phone },
        theme: { color: project.accent },
        verifyUrl: `/p/${project.token}/payments/razorpay/verify`,
        transactionId: transaction.id,
        statusUrl,
      }
    : null

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>Pay ${esc(project.name)} · ${esc(money(transaction.amount, transaction.currency))}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<style>
:root { --ink:#171512; --paper:#f6f2ea; --panel:#fffdf8; --line:rgba(23,21,18,.13); --muted:#746b5e; --accent:${esc(project.accent)}; --good:#276749; --bad:#9b2c2c; }
* { box-sizing: border-box; }
body { margin:0; min-height:100vh; background:var(--paper); color:var(--ink); font:15px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; display:grid; place-items:center; padding:22px; }
.card { width:min(430px,100%); background:var(--panel); border:1px solid var(--line); border-radius:20px; padding:24px; box-shadow:0 24px 60px -40px rgba(23,21,18,.45); }
.brand { display:flex; align-items:center; gap:11px; }
.mark { width:42px; height:42px; border-radius:13px; background:var(--accent); color:#fff; display:grid; place-items:center; font-family:ui-serif,Georgia,serif; font-weight:800; font-size:17px; }
.brand b { display:block; font-family:ui-serif,Georgia,serif; font-size:17px; line-height:1.15; }
.brand span { display:block; font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); margin-top:2px; }
.eyebrow { display:block; margin-top:24px; font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); }
.amount { display:block; font-family:ui-serif,Georgia,serif; font-size:44px; line-height:1; letter-spacing:-.03em; margin-top:6px; }
.ref { margin-top:8px; font-size:12px; color:var(--muted); }
.state { margin-top:20px; border:1px solid var(--line); border-radius:12px; padding:14px; background:#fff; }
.state .pill { display:inline-flex; border-radius:999px; padding:4px 10px; font-size:10px; font-weight:700; letter-spacing:.03em; }
.state .pill.good { background:#e5f3e8; color:var(--good); }
.state .pill.bad { background:#fbe7e7; color:var(--bad); }
.state .pill.wait { background:#fdf0d8; color:#8a5a11; }
.state h1 { font-family:ui-serif,Georgia,serif; font-size:22px; margin:10px 0 5px; font-weight:600; }
.state p { margin:0; font-size:12.5px; color:var(--muted); }
.meta { display:grid; gap:7px; margin-top:16px; padding-top:14px; border-top:1px solid var(--line); font-size:11.5px; }
.meta div { display:flex; justify-content:space-between; gap:12px; }
.meta span { color:var(--muted); }
.actions { display:grid; gap:9px; margin-top:18px; }
.btn { display:inline-flex; justify-content:center; align-items:center; min-height:46px; border-radius:11px; border:1px solid var(--line); background:#fff; color:var(--ink); text-decoration:none; font-weight:650; font-size:13px; padding:0 14px; cursor:pointer; }
.btn.primary { background:var(--ink); color:#fff; border-color:var(--ink); }
.btn[disabled] { opacity:.55; cursor:wait; }
.btn[hidden] { display:none !important; }
.note { margin-top:16px; font-size:10.5px; line-height:1.5; color:var(--muted); text-align:center; }
.test { margin-top:14px; border:1px dashed #cdb384; background:#fff8ec; color:#6f5630; border-radius:9px; padding:9px 11px; font-size:11px; }
.refund { margin-top:12px; border-radius:9px; background:#eef5ff; color:#22558c; padding:9px 11px; font-size:11px; }
@media (max-width:380px) { .amount { font-size:36px; } .card { padding:19px; } }
</style>
</head>
<body>
<main class="card">
  <div class="brand"><span class="mark">${esc(project.logo)}</span><div><b>${esc(project.name)}</b><span>Secure payment</span></div></div>
  <span class="eyebrow">${transaction.kind === 'booking' ? 'Booking deposit' : 'Order'} ${esc(transaction.refNumber)}</span>
  <b class="amount">${esc(money(transaction.amount, transaction.currency))}</b>
  <div class="ref">${esc(providerName)} · ${isTest ? 'Test mode' : 'Live'} · ${esc(transaction.id)}</div>
  ${refunded ? '<div class="refund">Refunded in full to the original payment method.</div>' : ''}
  <section class="state" aria-live="polite">
    <span class="pill ${copy.tone}" id="stateLabel">${esc(copy.label)}</span>
    <h1 id="stateHeading">${esc(copy.heading)}</h1>
    <p id="stateBody">${esc(copy.body)}</p>
  </section>
  <div class="meta">
    <div><span>Business</span><b>${esc(project.name)}</b></div>
    <div><span>Paid to</span><b>${esc(project.name)}'s ${esc(providerName)} account</b></div>
    <div><span>Reference</span><b>${esc(transaction.id)}</b></div>
  </div>
  <div class="actions">
    ${transaction.status === 'paid' ? `<a class="btn primary" href="${appUrl}">Return to the app</a>` : ''}
    ${transaction.status === 'pending' || transaction.status === 'created' ? `<button class="btn primary" type="button" id="payNow"${razorpay ? '' : ' hidden'}>Open secure checkout</button><a class="btn" href="${statusUrl}">Check payment status</a>` : ''}
    ${transaction.status === 'failed' || transaction.status === 'cancelled' ? `<a class="btn primary" href="${appUrl}">Return to the app</a>` : ''}
  </div>
  ${isTest ? '<div class="test">Test mode: use the gateway’s test payment methods. No real money moves.</div>' : ''}
  <p class="note">Card details are entered on ${esc(providerName)}’s secure checkout, never in this app. Plattr does not store card numbers or CVV, and payment settles directly to the business.</p>
</main>
${payConfig ? `<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
(() => {
  const config = ${JSON.stringify(payConfig).replace(/</g, '\\u003c')}
  const button = document.getElementById('payNow')
  const heading = document.getElementById('stateHeading')
  const body = document.getElementById('stateBody')
  const label = document.getElementById('stateLabel')
  let opened = false
  function fail(message) {
    heading.textContent = 'Payment not completed'
    body.textContent = message || 'The checkout was closed before payment. You can try again.'
    label.textContent = 'Not completed'
    label.className = 'pill bad'
    button.disabled = false
    button.textContent = 'Try secure checkout again'
  }
  function open() {
    if (typeof Razorpay !== 'function') { fail('The secure checkout could not load. Check your connection and try again.'); return }
    button.disabled = true
    const checkout = new Razorpay({
      key: config.key,
      amount: config.amount,
      currency: config.currency,
      name: config.name,
      description: config.description,
      order_id: config.order_id,
      prefill: config.prefill,
      theme: config.theme,
      handler: async (response) => {
        heading.textContent = 'Confirming your payment'
        body.textContent = 'Checking the signature and status with the gateway. Do not close this page.'
        try {
          const result = await fetch(config.verifyUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              transactionId: config.transactionId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }),
          })
          if (!result.ok) throw new Error('verification failed')
          location.href = config.statusUrl
        } catch (error) {
          fail('The payment could not be confirmed yet. Check the status before trying again.')
        }
      },
      modal: { ondismiss: () => fail('The checkout was closed before payment.') },
    })
    checkout.on('payment.failed', (response) => {
      fail((response && response.error && response.error.description) || 'The gateway declined this payment.')
    })
    checkout.open()
    opened = true
  }
  button.addEventListener('click', open)
  if (!opened) open()
})()
</script>` : ''}
</body>
</html>`
}

export function paymentMissingPage(project: Project): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex, nofollow" /><title>Payment not found</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f2ea;color:#171512;font:15px/1.5 ui-sans-serif,system-ui,sans-serif;padding:24px">
<main style="max-width:380px;text-align:center">
<div style="width:42px;height:42px;border-radius:13px;background:${esc(project.accent)};color:#fff;display:grid;place-items:center;margin:0 auto 16px;font-weight:800">${esc(project.logo)}</div>
<h1 style="font-family:ui-serif,Georgia,serif;font-size:24px;margin:0 0 8px">This payment link is not valid.</h1>
<p style="color:#746b5e;font-size:13px;margin:0 0 18px">It may have been mistyped, or the payment record was removed. Start again from ${esc(project.name)}’s app.</p>
<a href="/p/${esc(project.token)}/app" style="display:inline-flex;min-height:46px;align-items:center;padding:0 16px;border-radius:11px;background:#171512;color:#fff;text-decoration:none;font-weight:650;font-size:13px">Return to the app</a>
</main></body></html>`
}
