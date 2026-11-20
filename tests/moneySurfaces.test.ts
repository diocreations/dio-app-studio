import { describe, expect, test } from 'bun:test'
import { createProject, type Project } from '../src/worker/db'
import { createOrder, dashboardData } from '../src/worker/business'
import { paymentDashboard, type PaymentTransactionView } from '../src/worker/payments/service'
import { dashboardPage } from '../src/worker/views/dashboard'
import { paymentPage } from '../src/worker/views/payments'
import { MemoryD1 } from './memoryD1'

/**
 * Every surface that prints one build's money: the owner's dashboard, the
 * record of an order, and the hosted payment page. A GBP shop may print £ and
 * nothing else; an imported shop with no confirmed currency prints the amount
 * with no symbol rather than borrowing dollars.
 */

const ORIGIN = 'https://plattr.example'

const MENU = [
  {
    name: 'Catalogue',
    items: [
      { name: 'Linen Shirt', desc: 'Washed linen.', price: 4200 },
      { name: 'Candy Cards', desc: 'Jelly beans.', price: 300 },
    ],
  },
]

async function shop(site: Record<string, unknown>) {
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
    site,
  })
  const order = await createOrder(db, project, {
    customer: { name: 'Maya Rao', email: 'maya@example.com' },
    fulfilment: 'Pickup',
    items: [
      { key: '0-0', qty: 2 },
      { key: '0-1', qty: 1 },
    ],
  })
  return { db, project, order }
}

async function dashboard(site: Record<string, unknown>) {
  const { db, project, order } = await shop(site)
  const data = await dashboardData(db, project)
  const payments = await paymentDashboard(db, project, ORIGIN)
  return { html: dashboardPage({ project, data, origin: ORIGIN, payments }), order, project }
}

function project(): Project {
  return {
    id: 'prj_probe',
    name: 'Present & Correct',
    token: 'probe',
    accent: '#1b1b1b',
    logo: 'PC',
    vertical: 'shop',
    spec: { currency: 'GBP' },
  } as unknown as Project
}

function transaction(currency: string, amount = 4500): PaymentTransactionView & { businessName: string; token: string } {
  return {
    id: 'tx_probe',
    provider: 'stripe',
    mode: 'test',
    kind: 'order',
    reference: 'Order 1001',
    refNumber: '1001',
    customerName: 'Maya Rao',
    customerEmail: 'maya@example.com',
    amount,
    currency,
    status: 'pending',
    refundStatus: 'none',
    amountRefunded: 0,
    providerOrderId: '',
    providerPaymentId: '',
    failureReason: '',
    createdAt: '2026-11-20T10:00:00.000Z',
    paidAt: '',
    businessName: 'Present & Correct',
    token: 'probe',
  }
}

describe('a pound shop never prints a dollar', () => {
  test('the dashboard prints the build currency on orders and in the totals', async () => {
    const { html, order } = await dashboard({
      website: 'https://www.presentandcorrect.com',
      currency: 'GBP',
      menu: MENU,
    })
    expect(html).toContain('£')
    // Including the trade's sample offers: a pound shop is never promised to
    // customers as "Local delivery, $2.99".
    expect(html).not.toMatch(/\$\s?\d/)
    expect(html).toContain(`£${(order.total / 100).toFixed(2)}`)
    expect(html).toContain('£84.00')
    expect(html).toContain('£3.00')
  })

  test('the hosted payment page prints the transaction currency', () => {
    const html = paymentPage({ project: project(), transaction: transaction('GBP') })
    expect(html).toContain('£45.00')
    expect(html).not.toMatch(/\$\s?\d/)
  })

  test('an amount with no currency is never dressed as dollars', () => {
    const unknown = paymentPage({ project: project(), transaction: transaction('XYZ') })
    expect(unknown).toContain('XYZ 45.00')
    expect(unknown).not.toContain('$')
    const none = paymentPage({ project: project(), transaction: transaction('') })
    expect(none).toContain('45.00')
    expect(none).not.toContain('$')
  })

  test('an imported shop with no confirmed currency shows the amount alone', async () => {
    const { html } = await dashboard({ website: 'https://www.presentandcorrect.com', menu: MENU })
    expect(html).toContain('84.00')
    expect(html).not.toMatch(/\$\s?\d/)
    expect(html).not.toContain('£')
  })

  test('a generated demo build keeps its dollar', async () => {
    const { html } = await dashboard({ menu: MENU })
    expect(html).toContain('$84.00')
    expect(html).not.toContain('£')
  })
})
