import { describe, expect, test } from 'bun:test'
import { assessItem, auditCatalogue, pageRoleOf, sectionPayload } from '../src/worker/catalogue'
import { cleanMenu } from '../src/worker/importer'
import type { MenuItem, MenuSection } from '../src/worker/types'

/**
 * The trade decides what a page's rows are. These fixtures are the exact
 * shapes the benchmark produced from real sites: a restaurant's policy and
 * location pages, a hotel's hire pages, a practice's journal captions, and a
 * stationer's product literally called “Shipping Tags”.
 */

const item = (name: string, extra: Partial<MenuItem> = {}): MenuItem => ({
  name,
  desc: '',
  price: 0,
  ...extra,
})

const names = (sections: MenuSection[]) => sections.flatMap((section) => section.items.map((entry) => entry.name))
const reasons = (sections: MenuSection[], vertical: Parameters<typeof cleanMenu>[1]) =>
  cleanMenu(sections, vertical, { requireEvidence: true }).quality.dropped

describe('a page role is read before its contents', () => {
  test('policy, journal and location pages are not inventory', () => {
    expect(pageRoleOf({ url: 'https://www.padella.co/cookie-policy/' })).toBe('policy')
    expect(pageRoleOf({ url: 'https://example.com/journal/a-day-in-the-kitchen' })).toBe('article')
    expect(pageRoleOf({ url: 'https://example.com/contact-us' })).toBe('contact')
    expect(pageRoleOf({ url: 'https://example.com/about-us' })).toBe('about')
    expect(pageRoleOf({ url: 'https://example.com/rooms' })).toBe('inventory')
  })

  test('a practice’s project page is proof of work, not a service', () => {
    expect(pageRoleOf({ url: 'https://example.com/project/stone-house/', vertical: 'professional' })).toBe('article')
    // The same path on a shop is a product listing.
    expect(pageRoleOf({ url: 'https://example.com/project/stone-house/', vertical: 'shop' })).toBe('inventory')
  })

  test('a section label can itself say its rows are editorial', () => {
    expect(sectionPayload('Journal', 'professional')).toBe('article')
    expect(sectionPayload('Privacy policy', 'shop')).toBe('policy')
    expect(sectionPayload('Venue hire', 'hotel')).toBe('promotion')
    expect(sectionPayload('Cuts & colour', 'salon')).toBeNull()
  })
})

describe('restaurant inventory', () => {
  test('policy and location rows never become dishes; a priced dish stays', () => {
    const sections: MenuSection[] = [
      {
        name: 'Restaurant',
        items: [
          item('Cookie Policy', { desc: 'Last updated November 04, 2025 This Cookie Policy explains…' }),
          item('Privacy Policy', { desc: 'We use cookies to let us know how the majority of people…' }),
          item('Padella Shoreditch', { desc: 'Hand-rolled pasta, Italian cocktails. Book a table…' }),
          item('Pappardelle with beef shin', {
            desc: 'Slow-cooked beef shin, parmesan',
            price: 1450,
            priceEvidence: {
              method: 'text',
              source: 'https://www.padella.co/menus',
              raw: '£14.50',
              currency: 'GBP',
              validated: true,
            },
          }),
        ],
      },
    ]
    const cleaned = cleanMenu(sections, 'restaurant', { requireEvidence: true })
    expect(names(cleaned.sections)).toEqual(['Pappardelle with beef shin'])
    expect(cleaned.quality.dropped.map((entry) => entry.reason)).toEqual([
      'policy-page',
      'policy-page',
      'location-page',
    ])
  })

  test('a dish with a description but no price is kept, honestly unpriced', () => {
    const verdict = assessItem({
      name: 'Pici cacio e pepe',
      desc: 'Hand-rolled pici, pecorino, black pepper',
      section: 'Pasta',
      vertical: 'restaurant',
    })
    expect(verdict.accept).toBe(true)
    expect(verdict.missing).toContain('price')
    expect(verdict.status).toBe('verified')
  })
})

describe('hotel inventory', () => {
  test('venue hire and packages are offers, not rooms', () => {
    const verdicts = ['Event Venue Hire', 'Business Hire', 'Packages'].map((name) =>
      assessItem({ name, desc: 'Hotel Pelirocco is the original rock-n-roll Brighton hotel.', vertical: 'hotel' }),
    )
    expect(verdicts.every((verdict) => !verdict.accept)).toBe(true)
    expect(verdicts.map((verdict) => verdict.reason)).toEqual(['not-a-room', 'not-a-room', 'not-a-room'])
  })

  test('a room with a description and a stated occupancy is verified', () => {
    const verdict = assessItem({
      name: 'The Rocco Suite',
      desc: 'A rock-n-roll suite with a freestanding bath. Sleeps 2.',
      vertical: 'hotel',
      section: 'Rooms',
    })
    expect(verdict.accept).toBe(true)
    expect(verdict.payload).toBe('room')
    expect(verdict.missing).toContain('price')
  })

  test('a rate is never invented for a room without one', () => {
    const { sections } = cleanMenu(
      [{ name: 'Rooms', items: [item('The Rocco Suite', { desc: 'Sleeps 2. Sea view.' })] }],
      'hotel',
      { requireEvidence: true },
    )
    expect(sections[0].items[0].price).toBe(0)
  })
})

describe('professional services', () => {
  test('journal captions and archive navigation are not services', () => {
    const reasons = cleanMenu(
      [
        {
          name: 'Journal',
          items: [item('Bloomsbury Flat, progress visuals. A place to read, think…', { desc: 'A place to read.' })],
        },
        {
          name: 'Professional services',
          items: [
            item('Projects Archive', { desc: 'Our architects design house extensions and conversions.' }),
            item('Build', { desc: 'AFL Build: a sustainable builder in London with a design and build service.' }),
          ],
        },
      ],
      'professional',
      { requireEvidence: true },
    )
    expect(names(reasons.sections)).toEqual(['Build'])
    expect(reasons.quality.dropped.map((entry) => entry.reason)).toContain('article-section')
    expect(reasons.quality.dropped.map((entry) => entry.reason)).toContain('navigation')
  })

  test('pricing stays quote-based when the source publishes no prices', () => {
    const verdict = assessItem({
      name: 'Full house refurbishment',
      desc: 'A design-led refurbishment of a London townhouse.',
      vertical: 'professional',
      section: 'Services',
    })
    expect(verdict.accept).toBe(true)
    expect(verdict.missing).toContain('price')
  })
})

describe('retail inventory', () => {
  test('“Shipping Tags (x20)” is a product, not a shipping policy', () => {
    const { sections, quality } = cleanMenu(
      [
        {
          name: 'Catalogue',
          items: [
            item('Shipping Tags (x20)', {
              price: 450,
              sourceMethod: 'embedded-json',
              priceEvidence: {
                method: 'shopify-variant',
                source: 'https://shop.example/products.json',
                raw: '4.50',
                currency: 'GBP',
                validated: true,
              },
            }),
            item('Shop Now', { price: 1000 }),
          ],
        },
      ],
      'shop',
      { requireEvidence: true },
    )
    expect(names(sections)).toEqual(['Shipping Tags (x20)'])
    expect(quality.dropped[0].reason).toBe('navigation')
  })

  test('a declared product with no price or photograph is kept, marked incomplete', () => {
    const { sections } = cleanMenu(
      [{ name: 'Catalogue', items: [item('Desk pen', { sourceMethod: 'structured-data' })] }],
      'shop',
      { requireEvidence: true },
    )
    expect(sections[0].items[0].price).toBe(0)
    const audit = auditCatalogue(sections, 'shop')
    expect(audit.counts.incomplete).toBe(1)
    expect(audit.counts.verified).toBe(0)
  })

  test('a heading with a price is still not a product', () => {
    const verdict = assessItem({ name: 'VIEW NOW', desc: '', price: 1000, vertical: 'shop' })
    expect(verdict.accept).toBe(false)
    expect(verdict.payload).toBe('navigation')
  })
})

describe('the audit keeps its own record', () => {
  test('every refusal carries the row, the section and the reason', () => {
    const audit = auditCatalogue(
      [
        {
          name: 'Journal',
          items: [item('A walk through the workshop', { desc: 'A long caption about a day.' })],
        },
        {
          name: 'Restaurant',
          items: [item('Cookie Policy', { desc: 'How we use cookies.' })],
        },
      ],
      'restaurant',
    )
    expect(audit.counts.accepted).toBe(0)
    expect(audit.rejected).toHaveLength(2)
    expect(audit.rejected[0]).toMatchObject({ section: 'Journal', reason: 'article-section' })
    expect(audit.rejected[1]).toMatchObject({ section: 'Restaurant', payload: 'policy' })
  })
})
