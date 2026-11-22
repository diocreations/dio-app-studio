import { describe, expect, test } from 'bun:test'
import { renderApp } from '../src/worker/app'
import { validateConcepts } from '../src/worker/blueprints'
import { flagshipDocFromSpec, syncProjectSection } from '../src/worker/doc'
import { buildSpec } from '../src/worker/pricing'
import {
  destinationFor,
  markOwnerEdits,
  reviewCounts,
  sanitizeProjects,
  sanitizeSourceReview,
} from '../src/worker/review'
import type { MenuSection } from '../src/worker/types'

const review = sanitizeSourceReview(
  {
    source: 'https://padella.example/',
    host: 'padella.example',
    status: 'empty',
    pagesRead: ['/', '/privacy/', '/borough-market/'],
    found: ['name'],
    missing: ['menu with prices', 'phone number'],
    rejected: [
      { name: 'Privacy Policy', section: 'Footer', reason: 'policy-page' },
      { name: 'Padella Borough Market', section: 'Locations', reason: 'location-page' },
      { name: 'Shop Now', section: 'Header', reason: 'navigation' },
    ],
  },
  'restaurant',
)!

const professional = sanitizeSourceReview(
  {
    source: 'https://afl.example/',
    host: 'afl.example',
    status: 'partial',
    rejected: [
      { name: 'Stone House', section: 'Journal', reason: 'article-section' },
      { name: 'Projects Archive', section: 'Journal', reason: 'navigation' },
    ],
  },
  'professional',
)!

describe('the source review keeps every refused page with its destination', () => {
  test('policies and locations stay business information, chrome is excluded', () => {
    expect(review.rejected.map((entry) => entry.kind)).toEqual(['policy', 'location', 'navigation'])
    expect(review.rejected.map((entry) => entry.destination)).toEqual(['information', 'information', 'excluded'])
    expect(destinationFor('promotion', 'hotel')).toBe('information')
    expect(destinationFor('article', 'professional')).toBe('portfolio')
    expect(destinationFor('article', 'hotel')).toBe('information')
  })

  test('a practice case study is portfolio work, not a service', () => {
    expect(professional.rejected[0]).toMatchObject({ kind: 'article', destination: 'portfolio' })
    expect(professional.rejected[1].destination).toBe('excluded')
  })

  test('the record is bounded and drops empty rows', () => {
    const huge = sanitizeSourceReview(
      { rejected: Array.from({ length: 400 }, (_, index) => ({ name: `Row ${index}`, reason: 'policy-page' })) },
      'shop',
    )!
    expect(huge.rejected).toHaveLength(200)
    expect(sanitizeProjects([{ title: 'A' }, { title: '' }, 'nope'])).toEqual([{ title: 'A', source: 'website' }])
  })
})

describe('owner corrections carry owner provenance', () => {
  const previous: MenuSection[] = [
    {
      name: 'Menu',
      items: [
        {
          id: 'margherita',
          name: 'Margherita',
          desc: 'Tomato and basil',
          price: 900,
          priceEvidence: { method: 'text', source: '/menu', raw: '9.00', currency: 'GBP', validated: false },
        },
      ],
    },
  ]

  test('a changed price is the owner’s, with the site reading kept beside it', () => {
    const next: MenuSection[] = [
      {
        name: 'Menu',
        items: [
          {
            id: 'margherita',
            name: 'Margherita',
            desc: 'Tomato and basil',
            price: 1050,
          },
        ],
      },
    ]
    const marked = markOwnerEdits(previous, next, 'GBP')
    const item = marked.menu[0].items[0]
    expect(item.ownerFields).toEqual(['price'])
    expect(item.priceEvidence).toMatchObject({ method: 'owner', validated: true, currency: 'GBP' })
    // The old reading is preserved, still unverified. It is not upgraded.
    expect(item.sourcePriceEvidence).toMatchObject({ method: 'text', raw: '9.00', validated: false })
  })

  test('an untouched row gains no owner credit', () => {
    const marked = markOwnerEdits(previous, previous, 'GBP')
    expect(marked.menu[0].items[0].ownerFields).toBeUndefined()
    expect(marked.menu[0].items[0].priceEvidence).toMatchObject({ method: 'text', validated: false })
    expect(marked.corrected).toBe(0)
  })

  test('a name correction keeps the site’s price evidence beside it', () => {
    const next: MenuSection[] = [
      { name: 'Menu', items: [{ ...previous[0].items[0], name: 'Margherita (large)' }] },
    ]
    const item = markOwnerEdits(previous, next, 'GBP').menu[0].items[0]
    expect(item.ownerFields).toEqual(['name'])
    expect(item.priceEvidence).toMatchObject({ method: 'text', raw: '9.00', validated: false })
    expect(item.sourcePriceEvidence).toBeUndefined()
  })

  test('clearing an owner price clears the owner claim, not just the number', () => {
    const owned: MenuSection[] = [
      {
        name: 'Menu',
        items: [
          {
            ...previous[0].items[0],
            price: 0,
            ownerFields: ['price'],
            priceEvidence: { method: 'owner', source: 'Owner entry', raw: '10.50', currency: 'GBP', validated: true },
            sourcePriceEvidence: { method: 'text', source: '/menu', raw: '9.00', currency: 'GBP', validated: false },
          },
        ],
      },
    ]
    const cleared = markOwnerEdits(owned, [{ name: 'Menu', items: [{ ...owned[0].items[0], price: 0 }] }], 'GBP')
    const item = cleared.menu[0].items[0]
    expect(item.ownerFields).toBeUndefined()
    expect(item.priceEvidence).toBeUndefined()
    expect(item.sourcePriceEvidence).toBeUndefined()
  })

  test('restoring the site’s own price restores its provenance', () => {
    const edited = markOwnerEdits(
      previous,
      [{ name: 'Menu', items: [{ ...previous[0].items[0], price: 1050 }] }],
      'GBP',
    )
    const restored = markOwnerEdits(edited.menu, [{ name: 'Menu', items: [{ ...edited.menu[0].items[0], price: 900 }] }], 'GBP')
    const item = restored.menu[0].items[0]
    expect(item.ownerFields).toBeUndefined()
    expect(item.priceEvidence).toMatchObject({ method: 'text', raw: '9.00', validated: false })
    expect(item.sourcePriceEvidence).toBeUndefined()
  })

  test('a new item is entirely the owner’s and has no website source', () => {
    const next: MenuSection[] = [
      {
        name: 'Menu',
        items: [
          ...previous[0].items,
          {
            name: 'Marinara',
            desc: 'Tomato, garlic, oregano',
            price: 850,
            sourceUrl: 'https://site.example/menu',
            sourceMethod: 'visible-text',
          },
        ],
      },
    ]
    const item = markOwnerEdits(previous, next, 'GBP').menu[0].items[1]
    expect(item.ownerFields).toEqual(['name', 'desc', 'price'])
    expect(item.sourceUrl).toBeUndefined()
    expect(item.sourceMethod).toBeUndefined()
    expect(item.priceEvidence).toMatchObject({ method: 'owner' })
  })
})

describe('recovery content is shown in the right role', () => {
  const spec = buildSpec({
    name: 'Padella',
    vertical: 'restaurant',
    accent: '#c8452b',
    logo: 'P',
    features: ['catalog', 'booking'],
    tagline: 'Pasta, made daily',
    site: { website: 'https://padella.example/' },
    sourceReview: review,
  })
  const doc = flagshipDocFromSpec(spec)

  test('an empty catalogue explains the read and keeps policies and locations', () => {
    const html = renderApp(spec, { token: 'review-probe', live: false, flagship: true, doc })
    expect(html).toContain('aren’t published yet')
    expect(html).toContain('Privacy Policy')
    expect(html).toContain('Padella Borough Market')
    expect(html).toContain('kept as information')
    expect(html).toContain('Nothing has been invented')
    // The home screen says the menu is on its way instead of leaving a blank
    // space under the reservation buttons.
    expect(html).toContain('The menu isn’t published yet.')
  })

  test('counts separate website evidence, owner data, refusals and missing fields', () => {
    const counts = reviewCounts(review, [
      {
        name: 'Menu',
        items: [
          { name: 'Pasta', desc: '', price: 1200, priceEvidence: { method: 'text', source: '/menu', raw: '12.00', currency: 'GBP', validated: true } },
          { name: 'Our dish', desc: '', price: 1000, ownerFields: ['name', 'price'], priceEvidence: { method: 'owner', source: 'Owner entry', raw: '10.00', currency: 'GBP', validated: true } },
        ],
      },
    ])
    expect(counts).toMatchObject({ items: 2, verified: 1, owner: 1, rejected: 3, information: 2 })
  })

  test('a portfolio is proof of work, and is never priced or booked', () => {
    const practice = buildSpec({
      name: 'Architecture for London',
      vertical: 'professional',
      accent: '#111a24',
      logo: 'AL',
      features: ['catalog', 'quote'],
      site: { website: 'https://afl.example/' },
      sourceReview: professional,
      projects: [{ title: 'Stone House', desc: 'A refurbishment in Hackney', source: 'website' }],
    })
    const proDoc = flagshipDocFromSpec(practice)
    expect(proDoc.screens.find((screen) => screen.kind === 'home')?.sections.some((node) => node.variant === 'pro-work')).toBe(true)
    const html = renderApp(practice, { token: 'portfolio-probe', live: false, flagship: true, doc: proDoc })
    expect(html).toContain('Selected work')
    expect(html).toContain('Stone House')
    expect(html).toContain('A refurbishment in Hackney')
    // The project block renders no price of its own: portfolio work is proof,
    // not a service the customer can buy from this section.
    const start = html.indexOf('sec_fx_pro_work')
    const end = html.indexOf('sec_fx_pro_actions', start)
    expect(start).toBeGreaterThan(-1)
    const block = end > start ? html.slice(start, end) : html.slice(start, start + 2400)
    expect(block).not.toContain('fx-pro-price')
  })

  test('a website project is not published work until the owner accepts it', () => {
    const spec = buildSpec({
      name: 'Practice',
      vertical: 'professional',
      accent: '#111a24',
      logo: 'P',
      features: ['quote'],
      site: { website: 'https://practice.example/' },
      projects: [{ title: 'Suggested Mews', source: 'website', accepted: false }],
    })
    const suggestedDoc = flagshipDocFromSpec(spec)
    expect(suggestedDoc.screens[0].sections.some((node) => node.variant === 'pro-work')).toBe(false)
    const hidden = renderApp(spec, { token: 'suggested-probe', live: false, flagship: true, doc: suggestedDoc })
    expect(hidden).not.toContain('Suggested Mews')

    const acceptedSpec = {
      ...spec,
      projects: [{ ...spec.projects![0], accepted: true }],
    }
    const acceptedDoc = flagshipDocFromSpec(acceptedSpec)
    const shown = renderApp(acceptedSpec, { token: 'accepted-probe', live: false, flagship: true, doc: acceptedDoc })
    expect(shown).toContain('Suggested Mews')
  })

  test('the portfolio block is added once and removed with the last project', () => {
    const practice = buildSpec({
      name: 'Practice',
      vertical: 'professional',
      accent: '#111a24',
      logo: 'P',
      features: ['quote'],
      site: { website: 'https://practice.example/' },
      projects: [{ title: 'One', source: 'owner' }],
    })
    const withWork = syncProjectSection(flagshipDocFromSpec(practice), true)
    const again = syncProjectSection(withWork, true)
    expect(again.screens[0].sections.filter((node) => node.variant === 'pro-work')).toHaveLength(1)
    const cleared = syncProjectSection(again, false)
    expect(cleared.screens[0].sections.some((node) => node.variant === 'pro-work')).toBe(false)
  })
})

describe('concept diversity measures the promised dimensions', () => {
  const spec = buildSpec({
    name: 'Padella',
    vertical: 'restaurant',
    accent: '#c8452b',
    logo: 'P',
    features: ['catalog', 'booking'],
    site: { website: 'https://padella.example/' },
    sourceReview: review,
  })
  const doc = flagshipDocFromSpec(spec)

  test('identical concepts fail with the exact dimensions that are too alike', () => {
    const verdict = validateConcepts(spec, [
      { id: 'one', doc },
      { id: 'two', doc: flagshipDocFromSpec(spec) },
    ])
    expect(verdict.ok).toBe(false)
    expect(verdict.pairs[0].dimensions.map((entry) => entry.name)).toEqual([
      'screen and navigation architecture',
      'section types and composition',
      'catalogue presentation',
      'detail-page interaction',
      'primary customer journey',
      'trade-specific functionality',
    ])
    expect(verdict.pairs[0].dimensions.every((entry) => !entry.different)).toBe(true)
    expect(verdict.pairs[0].reasons).toContain('same sections in the same order')
    expect(verdict.pairs[0].reasons).toContain('same section composition')
  })
})
