import { describe, expect, test } from 'bun:test'
import { createProject, getProject, saveVersion } from '../src/worker/db'
import { buildSpec, moneyForSpec, sanitizeMenu } from '../src/worker/pricing'
import { applyApproval } from '../src/worker/reimport'
import { MemoryD1 } from './memoryD1'

/**
 * The brief's currency answer, end to end on the server: what the owner picked
 * is stored with the evidence that produced the question, survives a reload and
 * a later re-import, and reaches every money surface.
 */

const WEBSITE = 'https://www.presentandcorrect.com'

const CANDIDATES = [
  {
    code: 'INR',
    method: 'shopify-analytics',
    source: 'https://www.presentandcorrect.com/',
    raw: 'the storefront shows visitors INR',
  },
  {
    code: 'GBP',
    method: 'variant-labels',
    source: 'https://www.presentandcorrect.com/products.json',
    raw: '£10 matched against its option price',
  },
]

const MENU = [
  {
    name: 'Catalogue',
    items: [
      { name: 'Candy Cards', desc: 'Jelly beans.', price: 300 },
      { name: 'Linen Shirt', desc: 'Washed linen.', price: 4200 },
    ],
  },
]

function specWith(site: Record<string, unknown>) {
  return buildSpec({
    name: 'Present & Correct',
    vertical: 'shop',
    accent: '#1b1b1b',
    logo: 'PC',
    features: ['catalog', 'ordering'],
    site: { website: WEBSITE, menu: MENU, ...site },
  })
}

async function projectWith(overrides: Record<string, unknown> = {}) {
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
      website: WEBSITE,
      menu: MENU,
      currency: 'GBP',
      currencyEvidence: { code: 'GBP', method: 'owner', source: 'confirmed by the owner in the brief', raw: 'GBP' },
      currencyCandidates: CANDIDATES,
      ...overrides,
    },
  })
  return { db, project }
}

describe('the owner confirms a currency', () => {
  test('the code they pick is the one every surface prints', () => {
    for (const [code, symbol] of [
      ['GBP', '£'],
      ['INR', '₹'],
      ['USD', '$'],
      ['EUR', '€'],
    ] as const) {
      const spec = specWith({
        currency: code,
        currencyEvidence: { code, method: 'owner', source: 'confirmed by the owner in the brief', raw: code },
        currencyCandidates: CANDIDATES,
      })
      expect(spec.currency).toBe(code)
      expect(spec.currencySource?.method).toBe('owner')
      expect(moneyForSpec(300, spec)).toBe(`${symbol}3`)
    }
  })

  test('the evidence that produced the question is kept beside the answer', () => {
    const spec = specWith({
      currency: 'GBP',
      currencyEvidence: { code: 'GBP', method: 'owner', source: 'confirmed by the owner in the brief', raw: 'GBP' },
      currencyCandidates: CANDIDATES,
    })
    expect(spec.currencyCandidates).toEqual(CANDIDATES)
    // Including the visitor-presentment code that was refused, and its source.
    expect(spec.currencyCandidates?.find((entry) => entry.code === 'INR')?.method).toBe('shopify-analytics')
    expect(spec.currencyCandidates?.find((entry) => entry.code === 'GBP')?.source).toContain('/products.json')
  })

  test('a conflicting or absent currency labels nothing until answered', () => {
    const conflict = specWith({ currencyCandidates: CANDIDATES, currencyConflict: true })
    expect(conflict.currency).toBeUndefined()
    expect(moneyForSpec(300, conflict)).toBe('3')
    expect(conflict.currencyCandidates).toHaveLength(2)

    const none = specWith({})
    expect(none.currency).toBeUndefined()
    expect(moneyForSpec(300, none)).toBe('3')
    expect(none.currencyCandidates).toBeUndefined()
  })

  test('a saved answer comes back with its source and evidence after a reload', async () => {
    const { db, project } = await projectWith()
    const reread = await getProject(db, project.token)
    expect(reread?.spec.currency).toBe('GBP')
    expect(reread?.spec.currencySource).toMatchObject({ code: 'GBP', method: 'owner' })
    expect(reread?.spec.currencyCandidates).toHaveLength(2)
  })

  test('a later re-import never overrides the answered currency', async () => {
    const { db, project } = await projectWith()
    // The shop is read again and now says INR on the page, with a new product.
    const incoming = sanitizeMenu([
      {
        name: 'Catalogue',
        items: [
          { name: 'Candy Cards', desc: 'Jelly beans.', price: 300 },
          { name: 'Linen Shirt', desc: 'Washed linen.', price: 4200 },
          { name: 'New Pencil', desc: 'HB.', price: 150 },
        ],
      },
    ])
    const menu = applyApproval(project.spec.menu, incoming, { added: true, removed: [], changed: [] })
    const updated = await saveVersion(db, project, { spec: { menu } })
    expect(updated.spec.menu[0].items).toHaveLength(3)
    expect(updated.spec.currency).toBe('GBP')
    expect(updated.spec.currencySource?.method).toBe('owner')
    expect(updated.spec.currencyCandidates).toHaveLength(2)
    const reread = await getProject(db, project.token)
    expect(reread?.spec.currency).toBe('GBP')
    expect(reread?.spec.currencyCandidates?.map((entry) => entry.code).sort()).toEqual(['GBP', 'INR'])
  })
})
