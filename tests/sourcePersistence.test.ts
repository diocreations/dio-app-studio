import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { flagshipDocFromSpec } from '../src/worker/doc'
import { buildSpec, sanitizeMenu } from '../src/worker/pricing'
import { applyApproval, diffCatalogue } from '../src/worker/reimport'
import { markOwnerEdits, sanitizeProjects, sanitizeSourceReview } from '../src/worker/review'
import type { MenuItem, MenuSection } from '../src/worker/types'

/**
 * The owner decision has to outlive the session that made it, and a later read
 * of the website has to be unable to erase it. These tests follow one correction
 * through storage, a second correction, deletion, a fresh session and a
 * re-import that found different values.
 */

const SESSION_ONE = '2026-11-22T09:00:00.000Z'
const SESSION_TWO = '2026-11-23T10:30:00.000Z'
const REREAD = '2026-11-24T08:15:00.000Z'

const verifiedItem: MenuItem = {
  id: 'pappardelle',
  name: 'Pappardelle with beef shin',
  desc: 'Slow-cooked beef shin, parmesan',
  price: 1450,
  sourceUrl: 'https://www.padella.co/menus',
  sourceMethod: 'visible-text' as const,
  priceEvidence: {
    method: 'text' as const,
    source: 'https://www.padella.co/menus',
    raw: '14.50',
    currency: 'GBP',
    validated: true,
  },
}

const menu = (items: MenuItem[] = [verifiedItem]): MenuSection[] => [
  { name: 'Pasta', items: items.map((item) => ({ ...item })) },
]

/** A fresh server session reads the stored catalogue back through the same
 *  sanitiser the API uses. If a field does not survive this round trip it does
 *  not survive a new session either. */
const reload = (sections: MenuSection[]): MenuSection[] =>
  sanitizeMenu(JSON.parse(JSON.stringify(sections)))

describe('an owner correction survives storage and a fresh session', () => {
  test('a verified product price becomes the owner’s, with the site reading kept', () => {
    const next = menu([{ ...verifiedItem, price: 1550 }])
    const saved = markOwnerEdits(menu(), next, 'GBP', SESSION_ONE)
    const item = reload(saved.menu)[0].items[0]

    expect(item.ownerFields).toEqual(['price'])
    expect(item.priceEvidence).toMatchObject({ method: 'owner', validated: true, raw: '15.50' })
    // The original website reading is still there and still unverified/verified
    // exactly as the site supplied it. Nothing was upgraded by being saved.
    expect(item.sourcePriceEvidence).toMatchObject({ method: 'text', raw: '14.50', validated: true })
    expect(item.sourceUrl).toBe(verifiedItem.sourceUrl)
    expect(item.sourceMethod).toBe('visible-text')
    expect(item.sourceTrail?.original).toMatchObject({ name: verifiedItem.name, price: '14.50' })
    expect(item.sourceTrail?.original?.priceEvidence).toMatchObject({ method: 'text', raw: '14.50' })
    expect(item.sourceTrail?.ownerAt).toBe(SESSION_ONE)
    expect(item.sourceTrail?.decisions).toBeUndefined()
  })

  test('a second correction keeps the first original and updates only the owner time', () => {
    const first = markOwnerEdits(menu(), menu([{ ...verifiedItem, price: 1550 }]), 'GBP', SESSION_ONE)
    const second = markOwnerEdits(first.menu, menu([{ ...first.menu[0].items[0], price: 1625 }]), 'GBP', SESSION_TWO)
    const item = reload(second.menu)[0].items[0]

    expect(item.price).toBe(1625)
    expect(item.ownerFields).toEqual(['price'])
    expect(item.sourceTrail?.original).toMatchObject({ price: '14.50' })
    expect(item.sourceTrail?.ownerAt).toBe(SESSION_TWO)
    expect(item.sourcePriceEvidence).toMatchObject({ raw: '14.50' })
  })

  test('saving the same catalogue twice is not a correction and adds nothing', () => {
    const once = markOwnerEdits(menu(), menu([{ ...verifiedItem, price: 1550 }]), 'GBP', SESSION_ONE)
    const twice = markOwnerEdits(once.menu, once.menu.map((section) => ({ ...section })), 'GBP', SESSION_TWO)
    const item = twice.menu[0].items[0]

    expect(twice.corrected).toBe(0)
    expect(twice.added).toBe(0)
    expect(item.ownerFields).toEqual(['price'])
    expect(item.sourceTrail?.ownerAt).toBe(SESSION_ONE)
    expect(twice.menu[0].items).toHaveLength(1)
  })

  test('an owner photograph and its variants are kept through a correction', () => {
    const product: MenuItem = {
      ...verifiedItem,
      id: 'oilskin-smock',
      name: 'Oilskin smock',
      price: 21000,
      priceEvidence: {
        method: 'text',
        source: 'https://yarmouthoilskins.com/shop/smock',
        raw: '210.00',
        currency: 'GBP',
        validated: true,
      },
      media: { id: 'med_0123456789abcdef' },
      variants: [
        { id: 'sm', name: 'Small', price: 21000, selected: true },
        { id: 'md', name: 'Medium', price: 22000 },
      ],
      optionGroups: [{ name: 'Size', options: ['Small', 'Medium'] }],
    }
    const first = markOwnerEdits(
      menu([product]),
      menu([{ ...product, desc: 'Waxed cotton, made in Yarmouth' }]),
      'GBP',
      SESSION_ONE,
    )
    const item = reload(first.menu)[0].items[0]

    expect(item.media?.id).toBe('med_0123456789abcdef')
    expect(item.variants?.map((variant) => variant.price)).toEqual([21000, 22000])
    expect(item.optionGroups?.[0].options).toEqual(['Small', 'Medium'])
    expect(item.ownerFields).toEqual(['desc'])
    expect(item.sourceTrail?.original).toMatchObject({ name: 'Oilskin smock', price: '210.00' })
  })

  test('deleting an item does not bring it back, and restoring the site price restores its provenance', () => {
    const corrected = markOwnerEdits(menu(), menu([{ ...verifiedItem, price: 1550 }]), 'GBP', SESSION_ONE)
    const deleted = markOwnerEdits(corrected.menu, [{ name: 'Pasta', items: [] }], 'GBP', SESSION_TWO)
    expect(deleted.menu[0].items).toHaveLength(0)

    const restored = markOwnerEdits(corrected.menu, menu([{ ...verifiedItem, price: 1450 }]), 'GBP', SESSION_TWO)
    const item = restored.menu[0].items[0]
    expect(item.ownerFields).toBeUndefined()
    expect(item.priceEvidence).toMatchObject({ method: 'text', raw: '14.50' })
    expect(item.sourcePriceEvidence).toBeUndefined()
    // The dated record of what happened stays, even though the value is the
    // site's again.
    expect(item.sourceTrail?.original).toMatchObject({ price: '14.50' })
  })

  test('business information and the source ledger survive the same round trip', () => {
    const review = sanitizeSourceReview(
      {
        source: 'https://www.padella.co/',
        host: 'www.padella.co',
        status: 'empty',
        pagesRead: ['/', '/privacy/'],
        missing: ['menu with prices', 'phone number'],
        rejected: [
          { name: 'Privacy Policy', section: 'Footer', reason: 'policy-page' },
          { name: 'Padella Borough Market', section: 'Locations', reason: 'location-page' },
        ],
        conflicts: [{ field: 'phone', values: [{ value: '020 7000 0000', source: '/contact' }, { value: '+44 20 7000 0001', source: '/footer' }] }],
      },
      'restaurant',
    )!
    const spec = buildSpec({
      name: 'Padella',
      vertical: 'restaurant',
      accent: '#c8452b',
      logo: 'P',
      features: ['catalog'],
      site: {
        website: 'https://www.padella.co/',
        phone: '020 7000 0000',
        address: '6 Southwark Street',
        hours: 'Mon–Sun 12–10',
        menu: [],
      },
      sourceReview: review,
    })
    const stored = JSON.parse(JSON.stringify(spec))
    expect(stored.phone).toBe('020 7000 0000')
    expect(stored.address).toBe('6 Southwark Street')
    expect(stored.hours).toBe('Mon–Sun 12–10')
    expect(stored.sourceReview.rejected.map((entry: { destination: string }) => entry.destination)).toEqual([
      'information',
      'information',
    ])
    expect(stored.sourceReview.conflicts[0].values).toHaveLength(2)
    expect(stored.sourceReview.missing).toEqual(['menu with prices', 'phone number'])
  })

  test('portfolio provenance survives storage and stays out of the service list', () => {
    const projects = sanitizeProjects([
      { title: 'Stone House', desc: 'A refurbishment in Hackney', source: 'website' },
      { title: 'Our own extension', source: 'owner' },
    ])
    const stored = JSON.parse(JSON.stringify(projects))
    expect(stored).toEqual([
      { title: 'Stone House', desc: 'A refurbishment in Hackney', source: 'website' },
      { title: 'Our own extension', source: 'owner' },
    ])
  })
})

describe('a later website reading cannot overwrite the owner', () => {
  const corrected = () =>
    markOwnerEdits(menu(), menu([{ ...verifiedItem, price: 1550 }]), 'GBP', SESSION_ONE).menu

  const reread = (price: number, extra: Record<string, unknown> = {}) =>
    menu([
      {
        ...verifiedItem,
        price,
        priceEvidence: {
          method: 'text' as const,
          source: 'https://www.padella.co/menus',
          raw: (price / 100).toFixed(2),
          currency: 'GBP',
          validated: true,
        },
        ...extra,
      },
    ])

  test('a changed website price becomes a conflict, not an approved change', () => {
    const plan = diffCatalogue(corrected(), reread(1700), 'https://www.padella.co/')
    expect(plan.changed).toEqual([])
    expect(plan.conflicts).toEqual([
      {
        section: 'Pasta',
        name: verifiedItem.name,
        field: 'price',
        original: '14.50',
        originalKnown: true,
        latest: '17.00',
        owner: '15.50',
        ownerAt: SESSION_ONE,
      },
    ])
  })

  test('a website that still says the original value raises nothing', () => {
    const plan = diffCatalogue(corrected(), reread(1450))
    expect(plan.conflicts).toEqual([])
    expect(plan.changed).toEqual([])
    expect(plan.unchanged).toBe(1)
  })

  test('approval without a resolution leaves the owner’s price exactly as it was', () => {
    const next = applyApproval(corrected(), reread(1700), { changed: ['Pappardelle with beef shin|price'] }, REREAD)
    const item = next[0].items[0]
    expect(item.price).toBe(1550)
    expect(item.ownerFields).toEqual(['price'])
    expect(item.sourceTrail?.latest).toBeUndefined()
    expect(item.priceEvidence).toMatchObject({ method: 'owner' })
    expect(item.sourcePriceEvidence).toMatchObject({ raw: '14.50' })
  })

  test('keeping the owner’s value records the reading they declined', () => {
    const next = applyApproval(
      corrected(),
      reread(1700),
      { resolutions: [{ name: verifiedItem.name, field: 'price', choice: 'owner' }] },
      REREAD,
    )
    const item = next[0].items[0]
    expect(item.price).toBe(1550)
    expect(item.ownerFields).toEqual(['price'])
    expect(item.sourceTrail?.latest).toMatchObject({ name: verifiedItem.name, price: '17.00', at: REREAD })
    expect(item.sourceTrail?.decisions).toEqual([
      { field: 'price', choice: 'owner', ownerValue: '15.50', sourceValue: '17.00', at: REREAD },
    ])
    // The next check sees a reading the owner has already answered.
    expect(diffCatalogue(next, reread(1700)).conflicts).toEqual([])
  })

  test('taking the website’s value records the decision and drops the owner claim', () => {
    const next = applyApproval(
      corrected(),
      reread(1700),
      { resolutions: [{ name: verifiedItem.name, field: 'price', choice: 'source' }] },
      REREAD,
    )
    const item = reload(next)[0].items[0]
    expect(item.price).toBe(1700)
    expect(item.ownerFields).toBeUndefined()
    expect(item.priceEvidence).toMatchObject({ method: 'text', raw: '17.00', validated: true })
    expect(item.sourcePriceEvidence).toBeUndefined()
    // The value the owner had published is not lost: it is in the decision and
    // the original reading remains in the trail.
    expect(item.sourceTrail?.original).toMatchObject({ price: '14.50' })
    expect(item.sourceTrail?.latest).toMatchObject({ price: '17.00', at: REREAD })
    expect(item.sourceTrail?.decisions).toEqual([
      { field: 'price', choice: 'source', ownerValue: '15.50', sourceValue: '17.00', at: REREAD },
    ])
    expect(diffCatalogue(next, reread(1700)).conflicts).toEqual([])
  })

  test('a corrected description is protected the same way', () => {
    const owned = markOwnerEdits(
      menu(),
      menu([{ ...verifiedItem, desc: 'Beef shin, parmesan, black pepper' }]),
      'GBP',
      SESSION_ONE,
    ).menu
    const plan = diffCatalogue(owned, menu([{ ...verifiedItem, desc: 'Beef shin and parmesan' }]))
    expect(plan.conflicts[0]).toMatchObject({
      field: 'description',
      owner: 'Beef shin, parmesan, black pepper',
      latest: 'Beef shin and parmesan',
      original: verifiedItem.desc,
    })
    const kept = applyApproval(owned, menu([{ ...verifiedItem, desc: 'Beef shin and parmesan' }]), {}, REREAD)
    expect(kept[0].items[0].desc).toBe('Beef shin, parmesan, black pepper')
    const taken = applyApproval(
      owned,
      menu([{ ...verifiedItem, desc: 'Beef shin and parmesan' }]),
      { resolutions: [{ name: verifiedItem.name, field: 'description', choice: 'source' }] },
      REREAD,
    )
    expect(taken[0].items[0].desc).toBe('Beef shin and parmesan')
    expect(taken[0].items[0].ownerFields).toBeUndefined()
  })

  test('an owner-renamed product is still the same product to a later read', () => {
    const product = { ...verifiedItem, sourceId: 'shopify:8100' }
    const renamed = markOwnerEdits(
      menu([product]),
      menu([{ ...product, name: 'Pappardelle, slow beef shin' }]),
      'GBP',
      SESSION_ONE,
    ).menu
    const incoming = menu([
      {
        ...product,
        name: 'Pappardelle with beef shin',
        price: 1600,
        priceEvidence: {
          method: 'text',
          source: 'https://www.padella.co/menus',
          raw: '16.00',
          currency: 'GBP',
          validated: true,
        },
      },
    ])
    const plan = diffCatalogue(renamed, incoming)
    expect(plan.added).toEqual([])
    expect(plan.removed).toEqual([])
    // The price was never corrected, so its change is an ordinary approval.
    expect(plan.changed[0]).toMatchObject({ name: 'Pappardelle, slow beef shin' })
    expect(plan.changed[0].changes).toEqual([{ field: 'price', from: '1450', to: '1600' }])
    // The owner's name is not offered as a change at all.
    expect(plan.conflicts).toEqual([])
  })

  test('an owner photograph is still never replaced', () => {
    const owned = menu([{ ...verifiedItem, media: { id: 'med_0123456789abcdef' } }])
    const site = menu([{ ...verifiedItem, image: { url: 'https://example.com/pasta.jpg', source: 'website' as const } }])
    const next = applyApproval(owned, site, { changed: [`${verifiedItem.name}|image`] }, REREAD)
    expect(next[0].items[0].media?.id).toBe('med_0123456789abcdef')
    expect(next[0].items[0].image).toBeUndefined()
  })

  test('an ordinary, never-corrected price still follows an approved change', () => {
    const next = applyApproval(menu(), menu([{ ...verifiedItem, price: 1500 }]), {
      changed: [`${verifiedItem.name}|price`],
    })
    expect(next[0].items[0].price).toBe(1500)
    expect(next[0].items[0].ownerFields).toBeUndefined()
  })
})

describe('field-level provenance', () => {
  test('a row keeps a different origin for each field', () => {
    const item = reload(menu())[0].items[0]
    expect(item.fieldProvenance?.name).toMatchObject({
      source: 'website',
      method: 'visible-text',
      confidence: 'reported',
      validated: false,
    })
    expect(item.fieldProvenance?.price).toMatchObject({
      source: 'website',
      method: 'text',
      confidence: 'verified',
      validated: true,
    })
    expect(item.fieldProvenance?.image).toMatchObject({ source: 'unverified', validated: false })
    expect(item.fieldProvenance?.availability).toMatchObject({ source: 'unverified', validated: false })
  })

  test('an owner price does not relabel the website name or description', () => {
    const saved = markOwnerEdits(menu(), menu([{ ...verifiedItem, price: 1550 }]), 'GBP', SESSION_ONE)
    const item = reload(saved.menu)[0].items[0]
    expect(item.fieldProvenance?.price).toMatchObject({ source: 'owner', validated: true, at: SESSION_ONE })
    expect(item.fieldProvenance?.name).toMatchObject({ source: 'website', validated: false })
    expect(item.fieldProvenance?.desc).toMatchObject({ source: 'website', validated: false })
  })

  test('an owner photograph is recorded as the owner’s, not the website’s', () => {
    const saved = markOwnerEdits(
      menu(),
      menu([{ ...verifiedItem, media: { id: 'med_0123456789abcdef', alt: 'A plate' } }]),
      'GBP',
      SESSION_ONE,
    )
    const item = reload(saved.menu)[0].items[0]
    expect(item.fieldProvenance?.image).toMatchObject({ source: 'owner', validated: true })
    expect(item.media?.id).toBe('med_0123456789abcdef')
  })

  test('an owner-created row has no website provenance on any field', () => {
    const saved = markOwnerEdits(
      menu(),
      menu([{ name: 'Owner dish', desc: 'Written by the owner', price: 900, sourceUrl: 'https://example.com/' }]),
      'GBP',
      SESSION_ONE,
    )
    const item = reload(saved.menu)[0].items[0]
    expect(item.fieldProvenance?.name).toMatchObject({ source: 'owner', validated: true })
    expect(item.fieldProvenance?.desc).toMatchObject({ source: 'owner', validated: true })
    expect(item.fieldProvenance?.price).toMatchObject({ source: 'owner', validated: true })
    expect(item.fieldProvenance?.availability).toMatchObject({ source: 'owner', validated: true })
    expect(item.sourceUrl).toBeUndefined()
  })

  test('taking the website value restores website provenance only for that field', () => {
    const corrected = markOwnerEdits(menu(), menu([{ ...verifiedItem, price: 1550 }]), 'GBP', SESSION_ONE).menu
    const incoming = menu([
      {
        ...verifiedItem,
        price: 1700,
        priceEvidence: { ...verifiedItem.priceEvidence!, raw: '17.00' },
      },
    ])
    const next = applyApproval(
      corrected,
      incoming,
      { resolutions: [{ name: verifiedItem.name, field: 'price', choice: 'source' }] },
      REREAD,
    )
    const item = reload(next)[0].items[0]
    expect(item.price).toBe(1700)
    expect(item.fieldProvenance?.price).toMatchObject({ source: 'website', validated: true })
    expect(item.fieldProvenance?.name).toMatchObject({ source: 'website' })
    expect(item.ownerFields ?? []).not.toContain('price')
  })
})

describe('a price the build could not verify is not published as a fact', () => {
  const spec = buildSpec({
    name: 'Blue Tit',
    vertical: 'salon',
    accent: '#1f5c4a',
    logo: 'BT',
    features: ['catalog'],
    site: {
      website: 'https://bluetit.example/',
      menu: [
        {
          name: 'Treatments',
          items: [
            {
              name: 'Signature cut',
              desc: 'A cut shaped to you',
              price: 987654,
              priceEvidence: {
                method: 'text',
                source: 'https://bluetit.example/treatments',
                raw: '9,876.54',
                currency: 'GBP',
                validated: false,
              },
            },
          ],
        },
      ],
    },
  })
  const html = renderApp(spec, { token: 'unverified-probe', live: false })

  test('the amount is absent from the rendered app and its payload', () => {
    expect(html).not.toContain('9876.54')
    expect(html).not.toContain('9,876.54')
    expect(html).not.toContain('\"price\":987654')
    expect(html).not.toContain('fieldProvenance')
    expect(html).toContain('Signature cut')
  })
})

describe('the customer app receives no owner evidence', () => {
  const corrected = markOwnerEdits(menu(), menu([{ ...verifiedItem, price: 1550 }]), 'GBP', SESSION_ONE).menu
  const resolved = applyApproval(
    corrected,
    menu([
      {
        ...verifiedItem,
        price: 1700,
        priceEvidence: {
          method: 'text',
          source: 'https://www.padella.co/menus',
          raw: '17.00',
          currency: 'GBP',
          validated: true,
        },
      },
    ]),
    { resolutions: [{ name: verifiedItem.name, field: 'price', choice: 'owner' }] },
    REREAD,
  )
  const spec = buildSpec({
    name: 'Padella',
    vertical: 'restaurant',
    accent: '#c8452b',
    logo: 'P',
    features: ['catalog'],
    site: { website: 'https://www.padella.co/', menu: resolved },
    sourceReview: sanitizeSourceReview(
      {
        source: 'https://www.padella.co/',
        rejected: [{ name: 'Privacy Policy', section: 'Footer', reason: 'policy-page' }],
      },
      'restaurant',
    ),
  })
  const html = renderApp(spec, { token: 'leak-probe', live: false, flagship: true, doc: flagshipDocFromSpec(spec) })

  test('the public payload carries values, not provenance', () => {
    expect(html).toContain('15.50')
    for (const field of ['sourceTrail', 'sourcePriceEvidence', 'ownerFields', 'priceEvidence', 'sourceUrl', 'sourceMethod', 'sourceReview'])
      expect(html).not.toContain(`"${field}"`)
  })

  test('the customer information block does not print the internal classification', () => {
    expect(html).toContain('Privacy Policy')
    expect(html).not.toContain('· policy')
  })
})
